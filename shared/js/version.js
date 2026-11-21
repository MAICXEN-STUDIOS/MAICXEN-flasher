export function compareVersions(verA, verB) {
  const parse = (s) =>
    String(s || "0.0.0")
      .replace(/^v/i, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const [a0 = 0, a1 = 0, a2 = 0] = parse(verA);
  const [b0 = 0, b1 = 0, b2 = 0] = parse(verB);
  if (a0 !== b0) return a0 > b0 ? 1 : -1;
  if (a1 !== b1) return a1 > b1 ? 1 : -1;
  if (a2 !== b2) return a2 > b2 ? 1 : -1;
  return 0;
}

export function isVersionAtLeast(verStr, minMajor, minMinor, minPatch) {
  return compareVersions(verStr, `${minMajor}.${minMinor}.${minPatch}`) >= 0;
}

export function inferProductId(devOrHwId) {
  if (devOrHwId && typeof devOrHwId === "object") {
    const explicit = devOrHwId.product_id || devOrHwId.product;
    if (explicit) {
      const low = String(explicit).toLowerCase();
      if (low.includes("onir")) return "onir";
      if (low.includes("aleda")) return "aleda";
      if (low.includes("smarty")) return "smarty";
      return low;
    }
    const hwUpper = String(devOrHwId.hw_id || "").toUpperCase();
    if (hwUpper.startsWith("ONIR") || hwUpper.startsWith("IR-")) return "onir";
    if (hwUpper.startsWith("ALEDA") || hwUpper.startsWith("AL-")) return "aleda";
    return "smarty";
  }
  const hwUpper = String(devOrHwId || "").toUpperCase();
  if (hwUpper.startsWith("ONIR") || hwUpper.startsWith("IR-")) return "onir";
  if (hwUpper.startsWith("ALEDA") || hwUpper.startsWith("AL-")) return "aleda";
  return "smarty";
}

export function fmtTs(epochSec) {
  const n = Number(epochSec) || 0;
  if (n < 1700000000) return "Never / N/A";
  return new Date(n * 1000).toLocaleString("en-GB");
}

export function fmtDur(sec) {
  const s = Number(sec) || 0;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

export function fmtRelTime(ms) {
  if (!ms) return "N/A";
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(Number(ms)).toLocaleDateString("en-GB");
}
