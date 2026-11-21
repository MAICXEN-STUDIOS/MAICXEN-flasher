import {
  isNativeEspUsb,
  applySafeSerialSignals,
  safeClosePort
} from "./serial-protocol.js";

/**
 * Live Read-Only USB Telemetry Diagnostics Controller
 */
export function createUsbDiagnosticsController({
  getSelectedProduct,
  onTelemetryPacket,
  onConnectionChange,
  logLine,
  setStatus
}) {
  let diagPort = null;
  let diagReader = null;
  let diagTimer = null;
  let diagClosing = false;
  let detectedRuntimeBaud = 115200;

  async function sendCommand(rawCmd) {
    if (!diagPort || !diagPort.writable) return false;
    const text = String(rawCmd || "").trim();
    if (!text) return false;
    const writer = diagPort.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(`\n${text}\n`));
      logLine(`[USB TX] ${text}`);
      return true;
    } finally {
      writer.releaseLock();
    }
  }

  async function requestUsbTelemetry() {
    if (!diagPort || !diagPort.writable) return;
    const writer = diagPort.writable.getWriter();
    await writer.write(new TextEncoder().encode("\ntelemetry\n"));
    writer.releaseLock();
  }

  async function closeUsbDiagnostics() {
    diagClosing = true;
    if (diagTimer) {
      clearInterval(diagTimer);
      diagTimer = null;
    }
    if (diagReader) {
      try {
        await diagReader.cancel();
      } catch (_) {}
      try {
        diagReader.releaseLock();
      } catch (_) {}
      diagReader = null;
    }
    if (diagPort) {
      try {
        await diagPort.close();
      } catch (_) {}
      diagPort = null;
    }
    await new Promise((r) => setTimeout(r, 80));
    const btn = document.getElementById("usbDiagBtn");
    if (btn) btn.textContent = "Connect USB Telemetry";
    if (onConnectionChange) onConnectionChange(false, 0);
    diagClosing = false;
  }

  async function streamDiagPortLoop(port, baudRate, tryAlternateOnTimeout) {
    await port.open({ baudRate, bufferSize: 16384 });
    await applySafeSerialSignals(port);
    await new Promise((r) => setTimeout(r, 150));

    const btn = document.getElementById("usbDiagBtn");
    if (btn) btn.textContent = "Disconnect USB";
    if (onConnectionChange) onConnectionChange(true, baudRate);
    document.getElementById("matrixStatusRight").textContent = `USB Connected @ ${baudRate} bps · Waiting telemetry...`;
    logLine(`[USB] Live Telemetry connected (${baudRate} bps${isNativeEspUsb(port) ? ", Native USB-CDC" : ""})`);

    await requestUsbTelemetry();
    let gotPacket = false;
    setTimeout(() => {
      if (diagPort === port && !gotPacket) requestUsbTelemetry().catch(() => {});
    }, 800);
    setTimeout(() => {
      if (diagPort === port && !gotPacket) requestUsbTelemetry().catch(() => {});
    }, 1600);

    diagTimer = setInterval(() => {
      if (diagPort === port) requestUsbTelemetry().catch(() => {});
    }, 2500);

    const decoder = new TextDecoder();
    let buffer = "";
    const startTime = Date.now();
    diagReader = port.readable.getReader();

    while (diagPort === port) {
      const res = await Promise.race([
        diagReader.read(),
        new Promise((r) => setTimeout(() => r({ timeout: true }), 400))
      ]);
      if (diagPort !== port || diagClosing) break;
      if (res.timeout) {
        if (tryAlternateOnTimeout && !gotPacket && Date.now() - startTime > 2600) {
          return { switchBaud: true };
        }
        continue;
      }
      if (res.done) break;
      if (res.value) {
        buffer += decoder.decode(res.value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line.startsWith("SMARTY_TELEMETRY:") || line.startsWith("MAICXEN_TELEMETRY:")) {
            try {
              const prefix = line.startsWith("SMARTY_TELEMETRY:") ? "SMARTY_TELEMETRY:" : "MAICXEN_TELEMETRY:";
              gotPacket = true;
              detectedRuntimeBaud = baudRate;
              onTelemetryPacket(JSON.parse(line.slice(prefix.length)));
            } catch (_) {}
          } else if (line) {
            logLine(`[USB] ${line}`);
          }
        }
      }
    }
    return { switchBaud: false };
  }

  async function toggleDiagnostics() {
    if (diagPort) {
      await closeUsbDiagnostics();
      return;
    }
    try {
      diagPort = await navigator.serial.requestPort();
      const activePort = diagPort;
      const nativeUsb = isNativeEspUsb(activePort);
      const selectedProduct = getSelectedProduct();
      const primaryBaud = nativeUsb
        ? 115200
        : selectedProduct && selectedProduct.product_id === "smarty"
        ? 9600
        : 115200;
      const altBaud = primaryBaud === 115200 ? 9600 : 115200;

      document.getElementById("usbDiagBtn").textContent = "Connecting USB...";
      const res = await streamDiagPortLoop(activePort, primaryBaud, !nativeUsb);
      if (res && res.switchBaud && diagPort === activePort && !diagClosing) {
        if (diagTimer) {
          clearInterval(diagTimer);
          diagTimer = null;
        }
        if (diagReader) {
          try {
            await diagReader.cancel();
            diagReader.releaseLock();
          } catch (_) {}
          diagReader = null;
        }
        await safeClosePort(activePort);
        await streamDiagPortLoop(activePort, altBaud, false);
      }
    } catch (e) {
      if (!diagClosing) {
        logLine(`USB Telemetry Error: ${e.message || e}`);
        setStatus("warning", `USB Telemetry notice: ${e.message || e}`);
        await closeUsbDiagnostics();
      }
    }
  }

  return {
    toggleDiagnostics,
    closeUsbDiagnostics,
    sendCommand,
    requestUsbTelemetry,
    isConnected: () => Boolean(diagPort),
    getDetectedBaud: () => detectedRuntimeBaud
  };
}
