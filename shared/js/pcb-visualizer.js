/**
 * Backwards-compatible wrapper delegating hardware SVG rendering to
 * MaicxenProductRegistry in shared/js/catalog-data.js (Single Source of Truth).
 */
import { MaicxenProductRegistry } from "./catalog-data.js";

export function buildStylizedPcbSvg(prodId, opts = {}) {
  return MaicxenProductRegistry.renderIllustration(prodId, opts);
}
