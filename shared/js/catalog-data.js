/**
 * MAICXEN EDGE — Unified Product Registry, Model Variants & Minimalist Hardware Illustrations
 * Single source of truth for all MAICXEN EDGE products, hardware models, firmware metadata,
 * and capability-aware Apple-style minimalist stylized SVG renders.
 */

// ---------------------------------------------------------------------------
// Minimalist Apple-Style Hardware Illustrations (Curated + Capability-Aware)
// ---------------------------------------------------------------------------

function resolveAccent(defaultAccent, { progressPct = -1, isError = false, customColor = null, isPoweredOn = true }) {
  if (isError) return "#ff453a";
  if (progressPct >= 0) return "#0a84ff";
  if (!isPoweredOn) return "#3a3a42";
  return customColor || defaultAccent || "#0a84ff";
}

function renderSmartySvg(opts = {}) {
  const { progressPct = -1, isError = false, customColor = null, isPoweredOn = true, maxWidth = "460px" } = opts;
  const accent = resolveAccent("#ff9f0a", { progressPct, isError, customColor, isPoweredOn });
  const cols = 15;
  const rows = 3;
  const filledCols = progressPct >= 0 ? Math.round((Math.max(0, Math.min(100, progressPct)) / 100) * cols) : -1;

  let dots = "";
  for (let c = 0; c < cols; c++) {
    const cx = 66 + c * 22;
    for (let r = 0; r < rows; r++) {
      const cy = 44 + r * 21;
      let fill = "rgba(255,255,255,0.10)";
      let opacity = "1";
      let glow = "";

      if (progressPct >= 0) {
        if (c < filledCols) {
          fill = c === filledCols - 1 ? "#ffffff" : accent;
          glow = `filter="drop-shadow(0 0 5px ${accent})"`;
        }
      } else if (isPoweredOn) {
        const isCenter = r === 1;
        fill = accent;
        opacity = isCenter ? "0.95" : "0.42";
        if (isCenter && c % 2 === 0) glow = `filter="drop-shadow(0 0 4px ${accent})"`;
      }

      dots += `<circle cx="${cx}" cy="${cy}" r="3.4" fill="${fill}" fill-opacity="${opacity}" ${glow}/>`;
    }
  }

  return `
    <svg viewBox="0 0 440 130" style="width:100%;max-width:${maxWidth};height:auto;display:block;" aria-label="Smarty Minimalist Hardware">
      <defs>
        <linearGradient id="sm-chassis" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1d1e24"/>
          <stop offset="100%" stop-color="#111216"/>
        </linearGradient>
      </defs>
      <rect x="20" y="16" width="400" height="98" rx="28" fill="url(#sm-chassis)" stroke="rgba(255,255,255,0.16)" stroke-width="1.2"/>
      <rect x="34" y="27" width="372" height="76" rx="19" fill="#090a0d" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      ${dots}
      <circle cx="390" cy="65" r="5" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>
    </svg>
  `;
}

function renderAledaSvg(opts = {}) {
  const { progressPct = -1, isError = false, customColor = null, isPoweredOn = true, maxWidth = "460px" } = opts;
  const accent = resolveAccent("#2997ff", { progressPct, isError, customColor, isPoweredOn });
  const activeCount = progressPct >= 0 ? Math.ceil((Math.max(0, Math.min(100, progressPct)) / 100) * 4) : isPoweredOn ? 4 : 0;
  const barWidth = progressPct >= 0 ? Math.round((Math.max(0, Math.min(100, progressPct)) / 100) * 268) : isPoweredOn ? 268 : 0;

  let channels = "";
  for (let i = 0; i < 4; i++) {
    const x = 128 + i * 70;
    const lit = i < activeCount;
    channels += `
      <rect x="${x}" y="38" width="54" height="50" rx="10" fill="${lit ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)"}" stroke="${lit ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)"}" stroke-width="1"/>
      <rect x="${x + 15}" y="52" width="24" height="4" rx="2" fill="${lit ? accent : "rgba(255,255,255,0.12)"}" ${lit ? `filter="drop-shadow(0 0 5px ${accent})"` : ""}/>
      <text x="${x + 27}" y="76" fill="rgba(255,255,255,0.42)" font-size="8.5" font-weight="500" text-anchor="middle" font-family="-apple-system,sans-serif">CH ${i + 1}</text>
    `;
  }

  return `
    <svg viewBox="0 0 440 148" style="width:100%;max-width:${maxWidth};height:auto;display:block;" aria-label="AledA Minimalist Hardware">
      <defs>
        <linearGradient id="al-chassis" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1c1d23"/>
          <stop offset="100%" stop-color="#101115"/>
        </linearGradient>
      </defs>
      <rect x="24" y="14" width="392" height="120" rx="20" fill="url(#al-chassis)" stroke="rgba(255,255,255,0.16)" stroke-width="1.2"/>
      <rect x="44" y="38" width="66" height="72" rx="12" fill="#0b0c10" stroke="rgba(255,255,255,0.09)" stroke-width="1"/>
      <circle cx="77" cy="64" r="11" fill="none" stroke="${accent}" stroke-width="1.4" stroke-opacity="${isPoweredOn || progressPct >= 0 ? "0.9" : "0.25"}"/>
      <circle cx="77" cy="64" r="3.5" fill="${accent}" fill-opacity="${isPoweredOn || progressPct >= 0 ? "0.95" : "0.25"}"/>
      <text x="77" y="96" fill="rgba(255,255,255,0.46)" font-size="8" font-weight="600" text-anchor="middle" letter-spacing="0.08em" font-family="-apple-system,sans-serif">HUB</text>
      ${channels}
      <rect x="128" y="102" width="268" height="6" rx="3" fill="rgba(255,255,255,0.07)"/>
      ${barWidth > 0 ? `<rect x="128" y="102" width="${barWidth}" height="6" rx="3" fill="${accent}" filter="drop-shadow(0 0 6px ${accent})"/>` : ""}
    </svg>
  `;
}

function renderOnIrSvg(opts = {}) {
  const { progressPct = -1, isError = false, customColor = null, isPoweredOn = true, maxWidth = "440px" } = opts;
  const accent = resolveAccent("#bf5af2", { progressPct, isError, customColor, isPoweredOn });
  const lit = progressPct >= 0 || isPoweredOn;
  const arc1Op = progressPct >= 0 ? (progressPct >= 25 ? 0.9 : 0.15) : lit ? 0.85 : 0.15;
  const arc2Op = progressPct >= 0 ? (progressPct >= 55 ? 0.75 : 0.12) : lit ? 0.55 : 0.12;
  const arc3Op = progressPct >= 0 ? (progressPct >= 85 ? 0.6 : 0.08) : lit ? 0.30 : 0.08;

  return `
    <svg viewBox="0 0 440 144" style="width:100%;max-width:${maxWidth};height:auto;display:block;" aria-label="onIR Minimalist Hardware">
      <defs>
        <linearGradient id="ir-puck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#202128"/>
          <stop offset="100%" stop-color="#101115"/>
        </linearGradient>
        <radialGradient id="ir-lens" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#2a2b34"/>
          <stop offset="100%" stop-color="#090a0d"/>
        </radialGradient>
      </defs>
      <rect x="116" y="20" width="128" height="104" rx="28" fill="url(#ir-puck)" stroke="rgba(255,255,255,0.16)" stroke-width="1.2"/>
      <circle cx="180" cy="72" r="28" fill="url(#ir-lens)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
      <circle cx="180" cy="72" r="9" fill="${accent}" fill-opacity="${lit ? "0.9" : "0.22"}" ${lit ? `filter="drop-shadow(0 0 10px ${accent})"` : ""}/>
      <circle cx="180" cy="72" r="3" fill="#ffffff" fill-opacity="${lit ? "0.85" : "0.18"}"/>
      <path d="M266 50 A 30 30 0 0 1 266 94" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" opacity="${arc1Op}"/>
      <path d="M284 38 A 46 46 0 0 1 284 106" fill="none" stroke="${accent}" stroke-width="1.8" stroke-linecap="round" opacity="${arc2Op}"/>
      <path d="M302 26 A 62 62 0 0 1 302 118" fill="none" stroke="${accent}" stroke-width="1.5" stroke-linecap="round" opacity="${arc3Op}"/>
    </svg>
  `;
}

function renderGenericModuleSvg(opts = {}) {
  const {
    progressPct = -1,
    isError = false,
    customColor = null,
    isPoweredOn = true,
    maxWidth = "440px",
    productName = "MAICXEN EDGE",
    chip = "ESP32-S3",
    capabilities = []
  } = opts;
  const caps = Array.isArray(capabilities) ? capabilities.map((c) => String(c).toLowerCase()) : [];
  if (caps.includes("ir_tx") || caps.includes("ir_rx")) {
    return renderOnIrSvg(opts);
  }
  if (caps.includes("relays") || caps.includes("dimmers")) {
    return renderAledaSvg(opts);
  }
  if (caps.includes("matrix") || (caps.includes("rgb") && caps.includes("effects"))) {
    return renderSmartySvg(opts);
  }

  const accent = resolveAccent("#0a84ff", { progressPct, isError, customColor, isPoweredOn });
  const barWidth = progressPct >= 0 ? Math.round((Math.max(0, Math.min(100, progressPct)) / 100) * 180) : isPoweredOn ? 180 : 0;
  const subLabel = caps.length > 0 ? caps.slice(0, 3).join(" · ").toUpperCase() : `${chip} IoT Module`;

  return `
    <svg viewBox="0 0 440 136" style="width:100%;max-width:${maxWidth};height:auto;display:block;" aria-label="${productName} Hardware">
      <defs>
        <linearGradient id="gen-chassis" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1d1e24"/>
          <stop offset="100%" stop-color="#101115"/>
        </linearGradient>
      </defs>
      <rect x="64" y="18" width="312" height="100" rx="22" fill="url(#gen-chassis)" stroke="rgba(255,255,255,0.16)" stroke-width="1.2"/>
      <rect x="88" y="40" width="56" height="56" rx="12" fill="#0a0b0e" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
      <circle cx="116" cy="68" r="8" fill="${accent}" fill-opacity="${isPoweredOn || progressPct >= 0 ? "0.9" : "0.2"}" ${isPoweredOn || progressPct >= 0 ? `filter="drop-shadow(0 0 8px ${accent})"` : ""}/>
      <text x="166" y="61" fill="rgba(255,255,255,0.85)" font-size="13" font-weight="600" letter-spacing="0.02em" font-family="-apple-system,sans-serif">${productName}</text>
      <text x="166" y="77" fill="rgba(255,255,255,0.42)" font-size="9.5" font-family="-apple-system,sans-serif">${subLabel}</text>
      <rect x="166" y="90" width="180" height="5" rx="2.5" fill="rgba(255,255,255,0.08)"/>
      ${barWidth > 0 ? `<rect x="166" y="90" width="${barWidth}" height="5" rx="2.5" fill="${accent}"/>` : ""}
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// Object-Oriented Product & Model Catalog Classes
// ---------------------------------------------------------------------------

export class MaicxenModel {
  constructor(data = {}) {
    const isClassicEsp32 = String(data.chip || "").toUpperCase() === "ESP32";
    this.model_id = data.model_id || "esp32s3-std";
    this.model_name = data.model_name || this.model_id;
    this.chip = data.chip || "ESP32-S3";
    this.hw_rev = data.hw_rev || "1.0";
    this.offsets = Array.isArray(data.offsets)
      ? data.offsets
      : isClassicEsp32
      ? [4096, 32768, 57344, 65536]
      : [0, 32768, 69632, 131072];
    this.latest_version = data.latest_version || "1.0.0";
    this.version_url = data.version_url || "";
    this.firmware_url = data.firmware_url || "";
    this.bootloader_url = data.bootloader_url || "";
    this.partitions_url = data.partitions_url || "";
    this.boot_app0_url = data.boot_app0_url || "";
    this.capabilities = Array.isArray(data.capabilities) ? data.capabilities : [];
    this.notes = data.notes || data.release_notes || "";
  }
}

export class MaicxenProduct {
  constructor({
    product_id,
    product_name,
    latest_version = "1.0.0",
    tagline = "",
    accent = "#0a84ff",
    models = [],
    renderIllustration = null
  }) {
    this.product_id = String(product_id || "generic").toLowerCase();
    this.product_name = product_name || this.product_id;
    this.latest_version = latest_version;
    this.tagline = tagline;
    this.accent = accent;
    this.models = models.map((m) => (m instanceof MaicxenModel ? m : new MaicxenModel(m)));
    this._renderIllustration = renderIllustration || renderGenericModuleSvg;
  }

  getModel(modelId) {
    return this.models.find((m) => m.model_id === modelId) || this.models[0] || null;
  }

  renderSvg(opts = {}) {
    const primaryModel = this.models[0] || {};
    return this._renderIllustration({
      customColor: opts.customColor ?? this.accent,
      productName: this.product_name,
      chip: primaryModel.chip || "ESP32-S3",
      capabilities: primaryModel.capabilities || [],
      ...opts
    });
  }
}

export class MaicxenProductRegistry {
  static _products = new Map();

  static register(productOrConfig) {
    const prod = productOrConfig instanceof MaicxenProduct ? productOrConfig : new MaicxenProduct(productOrConfig);
    this._products.set(prod.product_id, prod);
    return prod;
  }

  static get(productId) {
    return this._products.get(String(productId || "").toLowerCase()) || null;
  }

  static getAll() {
    return Array.from(this._products.values());
  }

  static renderIllustration(productId, opts = {}) {
    const prod = this.get(productId);
    if (prod) return prod.renderSvg(opts);
    return renderGenericModuleSvg(opts);
  }

  static syncFromRawList(rawProducts = []) {
    if (!Array.isArray(rawProducts) || rawProducts.length === 0) return this.getAll();
    const synced = [];
    rawProducts.forEach((raw) => {
      const id = String(raw.product_id || "").toLowerCase();
      if (!id) return;
      const existing = this.get(id);
      const merged = new MaicxenProduct({
        product_id: id,
        product_name: raw.product_name || existing?.product_name || id,
        latest_version: raw.latest_version || existing?.latest_version || "1.0.0",
        tagline: raw.tagline || raw.description || existing?.tagline || "",
        accent: existing?.accent || raw.accent || "#0a84ff",
        models: Array.isArray(raw.models) && raw.models.length > 0 ? raw.models : existing?.models || [],
        renderIllustration: existing?._renderIllustration || renderGenericModuleSvg
      });
      this._products.set(id, merged);
      synced.push(merged);
    });
    return synced.length > 0 ? synced : this.getAll();
  }
}

// ---------------------------------------------------------------------------
// Built-in MAICXEN EDGE Product Line Initialization (Auto-Synced by Ecosystem)
// ---------------------------------------------------------------------------

MaicxenProductRegistry.register({
  product_id: "smarty",
  product_name: "Smarty",
  latest_version: "1.6.1",
  tagline: "Addressable RGB Light Matrix · Capacitive Touch · Hybrid USB/Cloud FOTA",
  accent: "#ff9f0a",
  renderIllustration: renderSmartySvg,
  models: [
    {
      model_id: "esp32s3-std",
      model_name: "Smarty 23×5 RGB Matrix (ESP32-S3)",
      chip: "ESP32-S3",
      hw_rev: "1.0",
      latest_version: "1.6.1",
      version_url: "./firmware/smarty/esp32s3-std/version.json",
      firmware_url: "./firmware/smarty/esp32s3-std/firmware.bin",
      bootloader_url: "./firmware/smarty/esp32s3-std/bootloader.bin",
      partitions_url: "./firmware/smarty/esp32s3-std/partitions.bin",
      boot_app0_url: "./firmware/smarty/esp32s3-std/boot_app0.bin",
      capabilities: ["power", "brightness", "rgb", "effects", "usb_fota", "cloud_fota", "local_web", "alexa"],
      notes: "v1.6.1 — Enabled native ESP32-S3 USB-CDC (HWCDC) alongside UART0 for zero-reset Live USB Telemetry and WebSerial FOTA."
    }
  ]
});

MaicxenProductRegistry.register({
  product_id: "aleda",
  product_name: "AledA",
  latest_version: "1.1.4",
  tagline: "Architectural 4-Relay, 4-Dimmer & 3-Strip Hub · Local Web UI · Matter",
  accent: "#2997ff",
  renderIllustration: renderAledaSvg,
  models: [
    {
      model_id: "esp32s3-matter",
      model_name: "AledA Matter over Wi-Fi Controller (ESP32-S3)",
      chip: "ESP32-S3",
      hw_rev: "1.0",
      latest_version: "1.1.4",
      version_url: "./firmware/aleda/esp32s3-matter/version.json",
      firmware_url: "./firmware/aleda/esp32s3-matter/firmware.bin",
      bootloader_url: "./firmware/aleda/esp32s3-matter/bootloader.bin",
      partitions_url: "./firmware/aleda/esp32s3-matter/partitions.bin",
      boot_app0_url: "./firmware/aleda/esp32s3-matter/boot_app0.bin",
      capabilities: ["power", "relays", "dimmers", "strips", "matter", "usb_fota", "cloud_fota", "local_web"],
      notes: "v1.1.4 — Fix AledA WebServer & telemetry OOM/starvation: remove 45KB resident Keep-Alive TLS & HTTPClient overhead, zero-fragmentation raw HTTP/1.1 POST + /api/status, and 45s non-blocking heartbeat."
    }
  ]
});

MaicxenProductRegistry.register({
  product_id: "onir",
  product_name: "onIR",
  latest_version: "1.0.1",
  tagline: "Universal Matter-over-WiFi Infrared Bridge · Live IR Learning · Dual-Core",
  accent: "#bf5af2",
  renderIllustration: renderOnIrSvg,
  models: [
    {
      model_id: "esp32-matter",
      model_name: "onIR Universal IR Bridge (ESP32 Matter)",
      chip: "ESP32",
      hw_rev: "1.0",
      offsets: [4096, 32768, 57344, 65536],
      latest_version: "1.0.1",
      version_url: "./firmware/onir/esp32-matter/version.json",
      firmware_url: "./firmware/onir/esp32-matter/firmware.bin",
      bootloader_url: "./firmware/onir/esp32-matter/bootloader.bin",
      partitions_url: "./firmware/onir/esp32-matter/partitions.bin",
      boot_app0_url: "./firmware/onir/esp32-matter/boot_app0.bin",
      capabilities: ["power", "ir_tx", "ir_rx", "ir_learn", "matter", "usb_fota", "cloud_fota", "local_web"],
      notes: "v1.0.1 — Fix Web UI IR form reset caused by ambient RX frames during polling + stricter IR noise filter (>= 12 edges)."
    }
  ]
});

export const DEFAULT_CATALOG_PRODUCTS = MaicxenProductRegistry.getAll();

export async function fetchPublicCatalog(sbClient, catalogJsonUrl = "./catalog.json") {
  let rawProducts = [];

  if (sbClient) {
    const { data, error } = await sbClient
      .from("product_catalog")
      .select("*")
      .eq("is_public", true)
      .order("product_id", { ascending: true });

    if (!error && data && data.length > 0) {
      const grouped = {};
      data.forEach((row) => {
        if (!grouped[row.product_id]) {
          grouped[row.product_id] = {
            product_id: row.product_id,
            product_name: row.product_name,
            latest_version: row.latest_version,
            tagline: row.description || "",
            models: []
          };
        }
        const prodVer = grouped[row.product_id].latest_version;
        const isClassicEsp32 = String(row.chip || "").toUpperCase() === "ESP32";
        grouped[row.product_id].models.push({
          model_id: row.model_id,
          model_name: row.model_name,
          chip: row.chip,
          hw_rev: row.hw_rev,
          offsets: isClassicEsp32 ? [4096, 32768, 57344, 65536] : [0, 32768, 69632, 131072],
          latest_version: prodVer,
          version_url: row.version_url || `./firmware/${row.product_id}/${row.model_id}/version.json`,
          firmware_url: row.firmware_url || `./firmware/${row.product_id}/${row.model_id}/firmware.bin`,
          bootloader_url: row.bootloader_url || `./firmware/${row.product_id}/${row.model_id}/bootloader.bin`,
          partitions_url: row.partitions_url || `./firmware/${row.product_id}/${row.model_id}/partitions.bin`,
          boot_app0_url: row.boot_app0_url || `./firmware/${row.product_id}/${row.model_id}/boot_app0.bin`,
          capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
          notes: row.release_notes || row.description || ""
        });
      });
      rawProducts = Object.values(grouped);
    }
  }

  if (rawProducts.length === 0) {
    const res = await fetch(`${catalogJsonUrl}?cb=${Date.now()}`, { cache: "no-store" });
    if (res.ok) {
      const cat = await res.json();
      if (cat.products && cat.products.length > 0) {
        rawProducts = cat.products;
      }
    }
  }

  return MaicxenProductRegistry.syncFromRawList(rawProducts);
}
