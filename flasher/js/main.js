import {
  FLASHER_VERSION,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  USB_FOTA_MIN_VERSION
} from "../../shared/js/config.js";
import { compareVersions, isVersionAtLeast, fmtDur, inferProductId } from "../../shared/js/version.js";
import {
  DEFAULT_CATALOG_PRODUCTS,
  MaicxenProductRegistry,
  fetchPublicCatalog
} from "../../shared/js/catalog-data.js";
import {
  safeClosePort,
  openAndProbeOnSamePort,
  runNativeUsbFota,
  runClassicEsptoolFlash
} from "./serial-protocol.js";
import { createUsbDiagnosticsController } from "./usb-diagnostics.js";

const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let catalogProducts = DEFAULT_CATALOG_PRODUCTS;
let selectedProduct = catalogProducts[0];
let selectedModel = catalogProducts[0].models[0];
let localFirmwareFile = null; // { name, bytes: Uint8Array, sha256 }

// Core DOM References
const pcbVisEl = document.getElementById("pcbVisualizer");
const productTabsEl = document.getElementById("productTabs");
const heroProductTitleEl = document.getElementById("heroProductTitle");
const heroProductTaglineEl = document.getElementById("heroProductTagline");
const modelSelectEl = document.getElementById("modelSelect");
const selectedModelTitleEl = document.getElementById("selectedModelTitle");
const fwVersionEl = document.getElementById("fwVersion");
const fwVersionBtn = document.getElementById("fwVersionBtn");
const versionPopoverAnchor = document.getElementById("versionPopoverAnchor");
const popoverModelNameEl = document.getElementById("popoverModelName");
const popoverChipEl = document.getElementById("popoverChip");
const popoverDownloadBinEl = document.getElementById("popoverDownloadBin");
const fwNotesEl = document.getElementById("fwNotes");
const capTagsEl = document.getElementById("capTags");
const modeBadgeEl = document.getElementById("modeBadge");
const flashBtn = document.getElementById("flashBtn");
const progressSection = document.getElementById("progressSection");
const progressStep = document.getElementById("progressStep");
const progressPct = document.getElementById("progressPct");
const progressFill = document.getElementById("progressFill");
const statusBanner = document.getElementById("statusBanner");
const consoleLog = document.getElementById("consoleLog");
const consoleDetails = document.getElementById("consoleDetails");

// Diagnostics & Tools DOM References
const diagConnDot = document.getElementById("diagConnDot");
const diagConnLabel = document.getElementById("diagConnLabel");
const diagRefreshBtn = document.getElementById("diagRefreshBtn");
const diagFotaBtn = document.getElementById("diagFotaBtn");
const diagRebootBtn = document.getElementById("diagRebootBtn");
const serialCmdInput = document.getElementById("serialCmdInput");
const sendSerialCmdBtn = document.getElementById("sendSerialCmdBtn");
const localBinInput = document.getElementById("localBinInput");
const chooseBinBtn = document.getElementById("chooseBinBtn");
const localBinNameEl = document.getElementById("localBinName");
const localBinMetaEl = document.getElementById("localBinMeta");
const localBinActionRow = document.getElementById("localBinActionRow");
const localBinShaEl = document.getElementById("localBinSha");
const flashLocalBinBtn = document.getElementById("flashLocalBinBtn");
const toolDownloadBinEl = document.getElementById("toolDownloadBin");
const toolOpenManifestEl = document.getElementById("toolOpenManifest");
const copyDeepLinkBtn = document.getElementById("copyDeepLinkBtn");

// --- View Switching (Flash / Diagnostics / Tools) ---
function switchView(viewName) {
  document.querySelectorAll(".view-tab").forEach((btn) => {
    const isMatch = btn.dataset.view === viewName;
    btn.classList.toggle("active", isMatch);
    btn.setAttribute("aria-selected", isMatch ? "true" : "false");
  });
  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `view-${viewName}`);
  });
}

document.querySelectorAll(".view-tab").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

// --- Release Notes Popover (Click + Hover + Escape/Outside Close) ---
function setPopoverOpen(open) {
  versionPopoverAnchor.classList.toggle("open", open);
  fwVersionBtn.setAttribute("aria-expanded", open ? "true" : "false");
}

fwVersionBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  setPopoverOpen(!versionPopoverAnchor.classList.contains("open"));
});

document.addEventListener("click", (e) => {
  if (!versionPopoverAnchor.contains(e.target)) {
    setPopoverOpen(false);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setPopoverOpen(false);
});

// --- Visualizers & Logging ---
function renderIdleBitmap(isError = false, customColor = null) {
  if (selectedProduct && typeof selectedProduct.renderSvg === "function") {
    pcbVisEl.innerHTML = selectedProduct.renderSvg({ progressPct: -1, isError, customColor });
    return;
  }
  const prodId = selectedProduct ? selectedProduct.product_id : "smarty";
  pcbVisEl.innerHTML = MaicxenProductRegistry.renderIllustration(prodId, { progressPct: -1, isError, customColor });
}

function renderMatrixProgress(pct) {
  if (selectedProduct && typeof selectedProduct.renderSvg === "function") {
    pcbVisEl.innerHTML = selectedProduct.renderSvg({ progressPct: pct });
    return;
  }
  const prodId = selectedProduct ? selectedProduct.product_id : "smarty";
  pcbVisEl.innerHTML = MaicxenProductRegistry.renderIllustration(prodId, { progressPct: pct });
}

function logLine(msg) {
  consoleLog.textContent += msg + "\n";
  consoleLog.scrollTop = consoleLog.scrollHeight;
}

function setStatus(type, message) {
  if (!type) {
    statusBanner.className = "status-banner";
    statusBanner.textContent = "";
    return;
  }
  statusBanner.className = `status-banner ${type}`;
  statusBanner.textContent = message;
}

function updateProgress(stepText, pct) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  progressSection.classList.add("active");
  progressStep.textContent = stepText;
  progressPct.textContent = `${clamped}%`;
  progressFill.style.width = `${clamped}%`;
  document.getElementById("matrixStatusRight").textContent = `${stepText} (${clamped}%)`;
  renderMatrixProgress(clamped);
}

// --- Product & Model Selection ---
function renderProductTabs() {
  productTabsEl.innerHTML = "";
  catalogProducts.forEach((prod) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isActive = selectedProduct && selectedProduct.product_id === prod.product_id;
    btn.className = "product-seg-btn" + (isActive ? " active" : "");
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
    const prodVer = prod.latest_version || prod.models?.[0]?.latest_version || "1.0.0";
    btn.innerHTML = `
      <span class="product-dot" style="background:${prod.accent || "#0a84ff"};"></span>
      <span>${prod.product_name}</span>
      <span class="product-seg-ver">v${prodVer}</span>
    `;
    btn.addEventListener("click", () => selectProduct(prod.product_id));
    productTabsEl.appendChild(btn);
  });
}

function selectModel(modelId) {
  if (!selectedProduct) return;
  selectedModel = selectedProduct.models.find((m) => m.model_id === modelId) || selectedProduct.models[0];
  if (!selectedModel) return;

  const unifiedVer = selectedProduct.latest_version || selectedModel.latest_version || "1.0.0";
  const baseDir = `./firmware/${selectedProduct.product_id}/${selectedModel.model_id}`;
  const fwUrl = selectedModel.firmware_url || `${baseDir}/firmware.bin`;
  const verUrl = selectedModel.version_url || `${baseDir}/version.json`;

  heroProductTitleEl.textContent = selectedProduct.product_name;
  heroProductTaglineEl.textContent = selectedProduct.tagline || "MAICXEN EDGE Hardware Platform";
  selectedModelTitleEl.textContent = `${selectedModel.model_name} · ${selectedModel.chip}`;
  fwVersionEl.textContent = `v${unifiedVer}`;
  popoverModelNameEl.textContent = `${selectedProduct.product_name} v${unifiedVer}`;
  popoverChipEl.textContent = `${selectedModel.chip} · Rev ${selectedModel.hw_rev || "1.0"}`;
  fwNotesEl.textContent = selectedModel.notes || selectedModel.release_notes || "Ready for WebSerial deployment.";
  popoverDownloadBinEl.href = fwUrl;
  popoverDownloadBinEl.download = `${selectedProduct.product_id}-${selectedModel.model_id}-v${unifiedVer}.bin`;
  toolDownloadBinEl.href = fwUrl;
  toolDownloadBinEl.download = `${selectedProduct.product_id}-${selectedModel.model_id}-v${unifiedVer}.bin`;
  toolOpenManifestEl.href = verUrl;

  document.getElementById("matrixLeftLabel").textContent = `${selectedProduct.product_name} · ${selectedModel.chip}`;
  renderIdleBitmap(false, selectedProduct.accent || "#0a84ff");

  capTagsEl.innerHTML = "";
  (selectedModel.capabilities || []).forEach((cap) => {
    const s = document.createElement("span");
    s.className = "cap-tag";
    s.textContent = String(cap).replace(/_/g, " ");
    capTagsEl.appendChild(s);
  });
}

function selectProduct(productId, preferredModelId = null) {
  selectedProduct = catalogProducts.find((p) => p.product_id === productId) || catalogProducts[0];
  if (!selectedProduct) return;
  const unifiedVer = selectedProduct.latest_version || selectedProduct.models?.[0]?.latest_version || "1.0.0";
  selectedProduct.latest_version = unifiedVer;
  selectedProduct.models.forEach((m) => {
    m.latest_version = unifiedVer;
  });
  renderProductTabs();

  modelSelectEl.innerHTML = "";
  selectedProduct.models.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.model_id;
    opt.textContent = `${m.model_name} (${m.chip})`;
    modelSelectEl.appendChild(opt);
  });

  const targetModel =
    (preferredModelId && selectedProduct.models.find((m) => m.model_id === preferredModelId)) ||
    selectedProduct.models[0];
  if (targetModel) {
    modelSelectEl.value = targetModel.model_id;
    selectModel(targetModel.model_id);
  }
}

function autoMatchProductFromTelemetry(devInfo, preserveModelSelection = false) {
  if (!devInfo) return;
  const detectedProd = inferProductId(devInfo);
  let targetModel = devInfo.model_id || null;
  if (preserveModelSelection && selectedProduct && selectedProduct.product_id === detectedProd && selectedModel) {
    targetModel = selectedModel.model_id;
  }
  if (catalogProducts.some((p) => p.product_id === detectedProd)) {
    selectProduct(detectedProd, targetModel);
    document.getElementById("autoDetectBadge").textContent = `Detected via USB · ${detectedProd.toUpperCase()} (${devInfo.hw_id || "ESP32"})`;
  }
}

function updateTelemetryUI(t) {
  autoMatchProductFromTelemetry(t);
  document.getElementById("tHwId").textContent = `${t.hw_id || "ESP32"} · ${t.product_id || t.profile || "MAICXEN"}`;
  document.getElementById("tFwPart").textContent = `v${t.fw || "?"} (${t.ota_part || "app0"})`;
  document.getElementById("tModeState").textContent = `${t.power ? "ON" : "OFF"} · ${t.mode || `${t.active_channels ?? 0} ch`} (${t.brightness ?? 100}%)`;
  document.getElementById("tWifi").textContent = t.wifi_ssid ? `${t.wifi_ssid} (${t.rssi} dBm)` : "Disconnected";

  const ipEl = document.getElementById("tIpLink");
  if (t.wifi_ip && t.wifi_ip !== "0.0.0.0") {
    ipEl.innerHTML = `<a href="http://${t.wifi_ip}" target="_blank" rel="noopener">http://${t.wifi_ip} ↗</a>`;
  } else {
    ipEl.textContent = "N/A";
  }

  document.getElementById("tCloud").textContent = t.cloud_online ? "Online" : "Offline";
  document.getElementById("tTempHeap").textContent = `${Number(t.temp || 0).toFixed(1)}°C · ${Math.round((t.heap_free || 0) / 1024)} KB free`;
  document.getElementById("tUptime").textContent = `${fmtDur(t.uptime)} / Tot ${fmtDur(t.total_on_sec)}`;
  document.getElementById("matrixStatusRight").textContent = `${t.hw_id} · ${t.mode || ""}`;
  renderIdleBitmap(false, t.power ? t.hex || (selectedProduct && selectedProduct.accent) || "#0a84ff" : "#1e293b");
}

function handleDiagConnectionChange(connected, baud) {
  diagConnDot.classList.toggle("online", connected);
  diagConnLabel.textContent = connected ? `Connected over USB @ ${baud} bps` : "Not connected";
  diagRefreshBtn.disabled = !connected;
  diagFotaBtn.disabled = !connected;
  diagRebootBtn.disabled = !connected;
  sendSerialCmdBtn.disabled = !connected;
}

const espLoaderTerminal = {
  clean() {
    consoleLog.textContent = "";
  },
  writeLine(data) {
    logLine(data);
  },
  write(data) {
    consoleLog.textContent += data;
    consoleLog.scrollTop = consoleLog.scrollHeight;
  }
};

const usbDiag = createUsbDiagnosticsController({
  getSelectedProduct: () => selectedProduct,
  onTelemetryPacket: updateTelemetryUI,
  onConnectionChange: handleDiagConnectionChange,
  logLine,
  setStatus
});

async function loadCatalog() {
  try {
    const fetched = await fetchPublicCatalog(sb, "./catalog.json");
    if (fetched.length > 0) {
      catalogProducts = fetched;
      const params = new URLSearchParams(window.location.search);
      const qProd = params.get("product") || (selectedProduct ? selectedProduct.product_id : "smarty");
      const qModel = params.get("model") || (selectedModel ? selectedModel.model_id : null);
      selectProduct(qProd, qModel);
    }
  } catch (_) {}
}

// --- Primary Cloud Flash Workflow ---
flashBtn.addEventListener("click", async () => {
  if (!selectedProduct || !selectedModel) return;
  await usbDiag.closeUsbDiagnostics();

  let port = null;
  try {
    setStatus(null, "");
    port = await navigator.serial.requestPort();

    flashBtn.disabled = true;
    espLoaderTerminal.clean();
    updateProgress("Probing connected MAICXEN EDGE device...", 2);
    logLine(`[MAICXEN EDGE · Flasher v${FLASHER_VERSION}] Probing device telemetry over USB...`);

    const probe = await openAndProbeOnSamePort(
      port,
      selectedProduct ? selectedProduct.product_id : "smarty",
      logLine
    );
    const devInfo = probe.devInfo;
    const forceFlash = Boolean(document.getElementById("forceFlashChk")?.checked);

    if (devInfo) {
      autoMatchProductFromTelemetry(devInfo, true);
      logLine(`[MAICXEN EDGE] Detected ${devInfo.hw_id} (${devInfo.product_id || "device"}) running v${devInfo.fw} (${devInfo.ota_part}).`);

      const targetVer = selectedModel.latest_version || selectedProduct.latest_version;
      const verCmp = compareVersions(devInfo.fw, targetVer);
      if (verCmp >= 0 && !forceFlash) {
        await safeClosePort(port);
        updateProgress("Already Up to Date", 100);
        logLine(`[MAICXEN EDGE] Version check: installed v${devInfo.fw} >= target v${targetVer}. Upload skipped.`);
        setStatus(
          "success",
          `${selectedProduct.product_name} (${devInfo.hw_id}) is already up to date on v${devInfo.fw}. Enable Force Re-flash to overwrite.`
        );
        return;
      }
      logLine(`[MAICXEN EDGE] Update eligible: v${devInfo.fw} -> v${targetVer}`);
    } else {
      logLine("[MAICXEN EDGE] No runtime telemetry detected (blank flash or legacy firmware).");
    }

    const prodSlug = String((devInfo && devInfo.product_id) || selectedProduct.product_id || "").toLowerCase();
    const minThr = USB_FOTA_MIN_VERSION[prodSlug] || [1, 0, 0];
    const meetsThreshold = devInfo && (devInfo.serial_ota === true || isVersionAtLeast(devInfo.fw, minThr[0], minThr[1], minThr[2]));
    const baseDir = `./firmware/${selectedProduct.product_id}/${selectedModel.model_id}`;
    const fwUrl = selectedModel.firmware_url || `${baseDir}/firmware.bin`;

    if (meetsThreshold) {
      modeBadgeEl.textContent = `Native USB-FOTA (v${devInfo.fw} → v${selectedModel.latest_version})`;
      updateProgress("Downloading firmware binary...", 6);
      const fwRes = await fetch(`${fwUrl}?cb=${Date.now()}`, { cache: "no-store" });
      if (!fwRes.ok) throw new Error(`Failed to fetch ${fwUrl} (HTTP ${fwRes.status})`);
      const fwBytes = new Uint8Array(await fwRes.arrayBuffer());

      const fotaRes = await runNativeUsbFota({
        port,
        fwBytes,
        targetVer: selectedModel.latest_version,
        probeCtx: probe,
        productName: selectedProduct.product_name,
        modelName: selectedModel.model_name,
        logLine,
        updateProgress,
        setStatus
      });
      if (!fotaRes.ok) {
        if (fotaRes.wroteAnyChunk) {
          throw fotaRes.error || new Error("USB-FOTA transfer interrupted");
        }
        logLine("[MAICXEN EDGE] Native USB-FOTA unavailable — falling back to esptool-js Bootloader mode...");
        await runClassicEsptoolFlash({
          port,
          selectedProduct,
          selectedModel,
          espLoaderTerminal,
          logLine,
          updateProgress,
          setStatus,
          modeBadgeEl
        });
      }
    } else {
      await safeClosePort(port);
      logLine(
        devInfo
          ? `[MAICXEN EDGE] Installed v${devInfo.fw} < USB-FOTA threshold v${minThr.join(".")} -> using direct esptool-js upload.`
          : "[MAICXEN EDGE] Entering direct esptool-js Bootloader upload..."
      );
      await runClassicEsptoolFlash({
        port,
        selectedProduct,
        selectedModel,
        espLoaderTerminal,
        logLine,
        updateProgress,
        setStatus,
        modeBadgeEl
      });
    }
  } catch (err) {
    if (port) await safeClosePort(port);
    consoleDetails.open = true;
    renderIdleBitmap(true);
    logLine(`ERROR: ${err.message || err}`);
    setStatus("error", `Flash interrupted: ${err.message || err}`);
  } finally {
    flashBtn.disabled = false;
  }
});

// --- Tools: Custom Local .bin Upload with SHA-256 ---
async function computeSha256Hex(uint8Arr) {
  if (!window.crypto || !window.crypto.subtle) return "Unavailable (non-HTTPS)";
  const hashBuf = await window.crypto.subtle.digest("SHA-256", uint8Arr);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

chooseBinBtn.addEventListener("click", () => localBinInput.click());

localBinInput.addEventListener("change", async () => {
  const file = localBinInput.files && localBinInput.files[0];
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha = await computeSha256Hex(bytes);
  localFirmwareFile = { name: file.name, bytes, sha256: sha };
  localBinNameEl.textContent = file.name;
  localBinMetaEl.textContent = `${(bytes.length / 1024).toFixed(1)} KB (${bytes.length.toLocaleString()} bytes)`;
  localBinShaEl.textContent = sha;
  localBinActionRow.style.display = "flex";
});

flashLocalBinBtn.addEventListener("click", async () => {
  if (!localFirmwareFile) return;
  await usbDiag.closeUsbDiagnostics();
  switchView("flash");

  let port = null;
  try {
    setStatus(null, "");
    port = await navigator.serial.requestPort();
    flashBtn.disabled = true;
    flashLocalBinBtn.disabled = true;
    espLoaderTerminal.clean();
    updateProgress("Probing device for local binary USB-FOTA...", 4);
    logLine(`[MAICXEN EDGE] Local Binary: ${localFirmwareFile.name} (${localFirmwareFile.bytes.length} B)`);
    logLine(`[MAICXEN EDGE] SHA-256: ${localFirmwareFile.sha256}`);

    const probe = await openAndProbeOnSamePort(
      port,
      selectedProduct ? selectedProduct.product_id : "smarty",
      logLine
    );
    if (!probe.devInfo) {
      throw new Error("Local .bin quick-flash requires an active MAICXEN EDGE firmware with USB-FOTA support.");
    }
    modeBadgeEl.textContent = `Local USB-FOTA · ${localFirmwareFile.name}`;
    const res = await runNativeUsbFota({
      port,
      fwBytes: localFirmwareFile.bytes,
      targetVer: "custom-local",
      probeCtx: probe,
      productName: selectedProduct ? selectedProduct.product_name : "MAICXEN EDGE",
      modelName: localFirmwareFile.name,
      logLine,
      updateProgress,
      setStatus
    });
    if (!res.ok) throw res.error || new Error("Local USB-FOTA failed");
  } catch (err) {
    if (port) await safeClosePort(port);
    consoleDetails.open = true;
    renderIdleBitmap(true);
    logLine(`ERROR: ${err.message || err}`);
    setStatus("error", `Local flash failed: ${err.message || err}`);
  } finally {
    flashBtn.disabled = false;
    flashLocalBinBtn.disabled = false;
  }
});

// --- Diagnostics Quick Actions & Serial Console ---
diagRefreshBtn.addEventListener("click", () => usbDiag.requestUsbTelemetry().catch(() => {}));
diagFotaBtn.addEventListener("click", () => usbDiag.sendCommand('{"action":"fota_check"}').catch(() => {}));
diagRebootBtn.addEventListener("click", () => {
  if (confirm("Reboot the connected MAICXEN EDGE device now?")) {
    usbDiag.sendCommand('{"action":"reboot"}').catch(() => {});
  }
});

async function submitSerialCommand() {
  const val = serialCmdInput.value.trim();
  if (!val) return;
  try {
    const ok = await usbDiag.sendCommand(val);
    if (ok) serialCmdInput.value = "";
  } catch (e) {
    logLine(`[USB TX Error] ${e.message || e}`);
  }
}

sendSerialCmdBtn.addEventListener("click", submitSerialCommand);
serialCmdInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitSerialCommand();
});

// --- Log Copy / Clear / Export & Share Deep-Link ---
function copyConsoleText(btn) {
  const txt = consoleLog.textContent || "";
  if (!txt) return;
  navigator.clipboard?.writeText(txt).then(() => {
    const orig = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => { btn.textContent = orig; }, 1400);
  });
}

document.getElementById("copyLogBtn").addEventListener("click", (e) => copyConsoleText(e.currentTarget));
document.getElementById("toolsCopyLogBtn").addEventListener("click", (e) => copyConsoleText(e.currentTarget));
document.getElementById("clearLogBtn").addEventListener("click", () => { consoleLog.textContent = ""; });

document.getElementById("exportLogBtn").addEventListener("click", () => {
  const blob = new Blob([consoleLog.textContent || "[Empty Log]\n"], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `maicxen-flasher-log-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

copyDeepLinkBtn.addEventListener("click", () => {
  if (!selectedProduct || !selectedModel) return;
  const shareUrl = `${window.location.origin}${window.location.pathname}?product=${encodeURIComponent(selectedProduct.product_id)}&model=${encodeURIComponent(selectedModel.model_id)}`;
  navigator.clipboard?.writeText(shareUrl).then(() => {
    const orig = copyDeepLinkBtn.textContent;
    copyDeepLinkBtn.textContent = "Copied ✓";
    setTimeout(() => { copyDeepLinkBtn.textContent = orig; }, 1600);
  });
});

// --- Init ---
modelSelectEl.addEventListener("change", () => selectModel(modelSelectEl.value));
document.getElementById("usbDiagBtn").addEventListener("click", usbDiag.toggleDiagnostics);

renderIdleBitmap();
const initParams = new URLSearchParams(window.location.search);
selectProduct(initParams.get("product") || "smarty", initParams.get("model") || null);
loadCatalog();

if (!("serial" in navigator)) {
  setStatus(
    "warning",
    "WebSerial is unavailable in this browser. You can browse firmware releases and open Fleet Console; use desktop Chrome, Edge, or Opera to flash over USB."
  );
  flashBtn.disabled = true;
  flashLocalBinBtn.disabled = true;
  document.getElementById("usbDiagBtn").disabled = true;
}
