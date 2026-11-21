/**
 * WebSerial Hardware Protocol Layer:
 * - Native Espressif USB-CDC (0x303A) vs UART Bridge handling
 * - Zero-reset probing and Native USB-FOTA (CRC-16/CCITT)
 * - Classic esptool-js Bootloader fallback (preserving NVS)
 */

export function computeCrc16Ccitt(uint8Arr) {
  let crc = 0xFFFF;
  for (let i = 0; i < uint8Arr.length; i++) {
    crc ^= uint8Arr[i] << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc & 0xFFFF;
}

export function isNativeEspUsb(port) {
  try {
    const info = port && port.getInfo ? port.getInfo() : {};
    return info.usbVendorId === 0x303A;
  } catch (_) {
    return false;
  }
}

export async function applySafeSerialSignals(port) {
  try {
    if (isNativeEspUsb(port)) {
      await port.setSignals({ dataTerminalReady: true, requestToSend: false });
    } else {
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });
    }
  } catch (_) {}
}

export async function safeClosePort(port) {
  if (!port) return;
  try {
    if (port.readable && port.readable.locked) return;
    await port.close();
  } catch (_) {}
  await new Promise((r) => setTimeout(r, 80));
}

export async function openAndProbeOnSamePort(port, preferredProductId, logLine) {
  const nativeUsb = isNativeEspUsb(port);
  const bauds = nativeUsb
    ? [115200]
    : preferredProductId === "smarty"
    ? [9600, 115200]
    : [115200, 9600];

  for (const baud of bauds) {
    let reader = null;
    try {
      await port.open({ baudRate: baud, bufferSize: 16384 });
      await applySafeSerialSignals(port);
      await new Promise((r) => setTimeout(r, 140));

      const sendProbe = async () => {
        if (!port.writable) return;
        const w = port.writable.getWriter();
        await w.write(new TextEncoder().encode("\ntelemetry\n"));
        w.releaseLock();
      };

      await sendProbe();
      reader = port.readable.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let retriesSent = 0;
      const startMs = Date.now();
      const deadline = startMs + 2400;

      while (Date.now() < deadline) {
        const elapsed = Date.now() - startMs;
        if (retriesSent === 0 && elapsed > 600) {
          retriesSent = 1;
          await sendProbe().catch(() => {});
        } else if (retriesSent === 1 && elapsed > 1400) {
          retriesSent = 2;
          await sendProbe().catch(() => {});
        }

        const res = await Promise.race([
          reader.read(),
          new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 180))
        ]);
        if (res.timeout) continue;
        if (res.done) break;
        if (res.value) {
          buf += decoder.decode(res.value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (line.startsWith("SMARTY_TELEMETRY:") || line.startsWith("MAICXEN_TELEMETRY:")) {
              const prefix = line.startsWith("SMARTY_TELEMETRY:") ? "SMARTY_TELEMETRY:" : "MAICXEN_TELEMETRY:";
              const json = JSON.parse(line.slice(prefix.length));
              try {
                await reader.cancel();
              } catch (_) {}
              try {
                reader.releaseLock();
              } catch (_) {}
              return { devInfo: json, baud, nativeUsb, isOpen: true };
            }
          }
        }
      }
    } catch (err) {
      if (logLine) logLine(`[Probe] Notice @ ${baud} bps: ${err.message || err}`);
    }

    if (reader) {
      try {
        await reader.cancel();
      } catch (_) {}
      try {
        reader.releaseLock();
      } catch (_) {}
    }
    await safeClosePort(port);
  }
  return { devInfo: null, baud: bauds[0], nativeUsb, isOpen: false };
}

export async function runNativeUsbFota({
  port,
  fwBytes,
  targetVer,
  probeCtx,
  productName,
  modelName,
  logLine,
  updateProgress,
  setStatus
}) {
  const nativeUsb = probeCtx ? probeCtx.nativeUsb : isNativeEspUsb(port);
  const runtimeBaud = probeCtx ? probeCtx.baud : 9600;
  const otaBaud = nativeUsb ? runtimeBaud : 921600;
  let reader = null;
  let wroteAnyChunk = false;

  try {
    if (!probeCtx || !probeCtx.isOpen) {
      await port.open({ baudRate: runtimeBaud, bufferSize: 16384 });
      await applySafeSerialSignals(port);
      await new Promise((r) => setTimeout(r, 120));
    }

    updateProgress("Entering USB-FOTA Update Mode (No Bootloader Reset)...", 8);
    let writer = port.writable.getWriter();
    const startCmd = JSON.stringify({ cmd: "serial_ota_start", size: fwBytes.length, baud: otaBaud }) + "\n";
    await writer.write(new TextEncoder().encode(startCmd));
    writer.releaseLock();

    reader = port.readable.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let switchConfirmed = false;
    const switchDeadline = Date.now() + 2500;

    while (Date.now() < switchDeadline && !switchConfirmed) {
      const r = await Promise.race([
        reader.read(),
        new Promise((res) => setTimeout(() => res({ timeout: true }), 200))
      ]);
      if (r.timeout) continue;
      if (r.done) break;
      if (r.value) {
        buf += decoder.decode(r.value, { stream: true });
        if (buf.includes("SMARTY_OTA_SWITCH:") || buf.includes("MAICXEN_OTA_SWITCH:")) {
          switchConfirmed = true;
          break;
        }
      }
    }

    if (!switchConfirmed) {
      try {
        await reader.cancel();
        reader.releaseLock();
      } catch (_) {}
      reader = null;
      throw new Error("USB-FOTA handshake not received from firmware");
    }

    if (!nativeUsb && otaBaud !== runtimeBaud) {
      try {
        await reader.cancel();
        reader.releaseLock();
      } catch (_) {}
      reader = null;
      await safeClosePort(port);
      await new Promise((r) => setTimeout(r, 100));
      await port.open({ baudRate: otaBaud, bufferSize: 16384 });
      await applySafeSerialSignals(port);
      await new Promise((r) => setTimeout(r, 80));
      reader = port.readable.getReader();
      buf = "";
    } else {
      const nlIdx = buf.lastIndexOf("\n");
      if (nlIdx >= 0) buf = buf.slice(nlIdx + 1);
      await new Promise((r) => setTimeout(r, 90));
    }

    writer = port.writable.getWriter();
    await writer.write(new TextEncoder().encode("OTA_SYNC\n"));
    writer.releaseLock();

    const readLineWithTimeout = async (ms) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const nl = buf.indexOf("\n");
        if (nl >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          return line;
        }
        const r = await Promise.race([
          reader.read(),
          new Promise((res) => setTimeout(() => res({ timeout: true }), 180))
        ]);
        if (r.timeout) continue;
        if (r.done) return null;
        if (r.value) buf += decoder.decode(r.value, { stream: true });
      }
      return null;
    };

    let ready = false;
    const readyDeadline = Date.now() + 3000;
    let syncRetried = false;
    const readyStart = Date.now();
    while (Date.now() < readyDeadline) {
      if (!syncRetried && Date.now() - readyStart > 1000) {
        syncRetried = true;
        try {
          const w2 = port.writable.getWriter();
          await w2.write(new TextEncoder().encode("OTA_SYNC\n"));
          w2.releaseLock();
        } catch (_) {}
      }
      const line = await readLineWithTimeout(350);
      if (!line) continue;
      logLine(`[USB-FOTA] ${line}`);
      if (line.includes("SMARTY_OTA_READY") || line.includes("MAICXEN_OTA_READY")) {
        ready = true;
        break;
      }
      if (line.includes("OTA_ERR")) throw new Error(line);
    }

    if (!ready) throw new Error("Timeout waiting for OTA_READY");

    logLine(`[USB-FOTA] Streaming firmware v${targetVer} (${nativeUsb ? "Native USB 12Mbps" : otaBaud + " bps"}) with CRC-16 verification...`);
    updateProgress(`Streaming USB-FOTA v${targetVer}...`, 12);

    const chunkSize = 2048;
    let offset = 0;
    let retries = 0;

    while (offset < fwBytes.length) {
      const end = Math.min(offset + chunkSize, fwBytes.length);
      const slice = fwBytes.subarray(offset, end);
      const len = slice.length;
      const crc = computeCrc16Ccitt(slice);

      const packet = new Uint8Array(6 + len);
      packet[0] = 0xA5;
      packet[1] = 0x5A;
      packet[2] = len & 0xFF;
      packet[3] = (len >> 8) & 0xFF;
      packet[4] = crc & 0xFF;
      packet[5] = (crc >> 8) & 0xFF;
      packet.set(slice, 6);

      writer = port.writable.getWriter();
      await writer.write(packet);
      writer.releaseLock();

      const respLine = await readLineWithTimeout(3000);
      if (!respLine) throw new Error(`ACK timeout at byte ${offset}`);

      if (respLine.startsWith("ACK:")) {
        wroteAnyChunk = true;
        offset = end;
        retries = 0;
        const devPct = parseInt(respLine.slice(4), 10) || Math.round((offset * 100) / fwBytes.length);
        const uiPct = 12 + Math.round((offset / fwBytes.length) * 86);
        updateProgress(`USB-FOTA Progress (${devPct}%)...`, uiPct);
      } else if (respLine === "NAK") {
        retries++;
        logLine(`[USB-FOTA] CRC mismatch @ ${offset}, retry ${retries}/4...`);
        if (retries > 4) throw new Error("Too many CRC errors on serial line");
      } else if (respLine.startsWith("OTA_ERR")) {
        throw new Error(respLine);
      }
    }

    const finalLine = await readLineWithTimeout(3000);
    if (finalLine) logLine(`[USB-FOTA] ${finalLine}`);

    try {
      await reader.cancel();
      reader.releaseLock();
    } catch (_) {}
    reader = null;
    await safeClosePort(port);

    updateProgress("USB-FOTA Complete! Applying & Rebooting...", 100);
    setStatus("success", `${productName} (${modelName}) updated to v${targetVer} via seamless USB-FOTA (no bootloader reset)!`);
    return { ok: true, wroteAnyChunk };
  } catch (err) {
    logLine(`[USB-FOTA] Notice: ${err.message || err}`);
    if (reader) {
      try {
        await reader.cancel();
        reader.releaseLock();
      } catch (_) {}
    }
    await safeClosePort(port);
    return { ok: false, wroteAnyChunk, error: err };
  }
}

export async function runClassicEsptoolFlash({
  port,
  selectedProduct,
  selectedModel,
  espLoaderTerminal,
  logLine,
  updateProgress,
  setStatus,
  modeBadgeEl
}) {
  let transport = null;
  try {
    modeBadgeEl.textContent = "Mode: Bootloader esptool-js (Preserves NVS)";
    updateProgress(`Loading esptool-js & Connecting ${selectedModel.chip} Bootloader...`, 4);
    const { ESPLoader, Transport } = await import("https://unpkg.com/esptool-js@0.4.5/bundle.js");

    transport = new Transport(port, true);
    const esploader = new ESPLoader({
      transport,
      baudrate: 460800,
      terminal: espLoaderTerminal
    });

    const chipName = await esploader.main();
    logLine(`[Bootloader] Detected chip: ${chipName}`);

    const baseDir = `./firmware/${selectedProduct.product_id}/${selectedModel.model_id}`;
    const isClassicEsp32 = String(selectedModel.chip || "").toUpperCase() === "ESP32";
    const defaultOffsets = isClassicEsp32 ? [4096, 32768, 57344, 65536] : [0, 32768, 69632, 131072];
    const offs = Array.isArray(selectedModel.offsets) && selectedModel.offsets.length === 4
      ? selectedModel.offsets
      : defaultOffsets;
    const fmtHex = (v) => `0x${Number(v).toString(16).toUpperCase().padStart(4, "0")}`;
    const parts = [
      { path: selectedModel.bootloader_url || `${baseDir}/bootloader.bin`, offset: offs[0], label: `Bootloader (${fmtHex(offs[0])})` },
      { path: selectedModel.partitions_url || `${baseDir}/partitions.bin`, offset: offs[1], label: `Partition Table (${fmtHex(offs[1])})` },
      { path: selectedModel.boot_app0_url || `${baseDir}/boot_app0.bin`, offset: offs[2], label: `OTA Selector (${fmtHex(offs[2])})` },
      {
        path: selectedModel.firmware_url || `${baseDir}/firmware.bin`,
        offset: offs[3],
        label: `${selectedProduct.product_name} v${selectedModel.latest_version} (${fmtHex(offs[3])})`
      }
    ];

    const fileArray = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      updateProgress(`Downloading ${p.label}...`, 6 + Math.round((i / parts.length) * 9));
      logLine(`[Bootloader] Fetching ${p.path} (@ 0x${p.offset.toString(16)})...`);
      const res = await fetch(`${p.path}?cb=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch ${p.path} (HTTP ${res.status})`);
      const buf = await res.arrayBuffer();
      fileArray.push({
        data: esploader.ui8ToBstr(new Uint8Array(buf)),
        address: p.offset
      });
    }

    const totalLengths = fileArray.map((f) => f.data.length);
    const grandTotal = totalLengths.reduce((acc, v) => acc + v, 0);

    updateProgress(`Flashing ${selectedModel.model_name}...`, 15);
    await esploader.writeFlash({
      fileArray,
      flashSize: "keep",
      flashMode: "keep",
      flashFreq: "keep",
      eraseAll: false,
      compress: true,
      reportProgress: (fileIndex, written, total) => {
        let prevBytes = 0;
        for (let k = 0; k < fileIndex; k++) prevBytes += totalLengths[k];
        const currentFileEstimate = total > 0 ? (written / total) * totalLengths[fileIndex] : 0;
        const overallRatio = (prevBytes + currentFileEstimate) / grandTotal;
        const pct = 15 + overallRatio * 83;
        updateProgress(`Writing ${parts[fileIndex]?.label || "Partition"}...`, pct);
      }
    });

    updateProgress("Rebooting device...", 99);
    await transport.setDTR(false);
    await transport.setRTS(true);
    await new Promise((r) => setTimeout(r, 120));
    await transport.setRTS(false);
    await transport.disconnect();
    transport = null;

    updateProgress("Firmware Installed Successfully!", 100);
    setStatus(
      "success",
      `${selectedProduct.product_name} (${selectedModel.model_name}) v${selectedModel.latest_version} flashed successfully! NVS settings were preserved.`
    );
  } finally {
    if (transport) {
      try {
        await transport.disconnect();
      } catch (_) {}
    }
  }
}
