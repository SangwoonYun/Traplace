// File: app/static/js/urlState.js
/**
 * URL serialization for app state.
 *
 * Encodes/decodes:
 *  - Blocks (kind/size/cell position; optional city label)
 *  - Red tiles (userPaint) using row-wise RLE with base-36
 *
 * Public API:
 *  - serializeState(): string
 *  - deserializeState(qs: string): { blocks, red, ver }
 *  - updateURLWithSerialized(qs: string): void
 *  - saveToURLImmediate(): void
 *  - queueSaveToURL(): void
 *  - parseFromURL(): { blocks, red }
 */

import { state, cellPx } from './state.js';

/* ---------------------------------------------
 * Kind ↔ code mapping (compact token)
 * ------------------------------------------- */
const KIND_TO_CODE = {
  block: 'B',
  flag: 'F',
  hq: 'H',
  city: 'C',
  resource: 'R',
  trap: 'T',
  custom: 'X',
};
const CODE_TO_KIND = Object.fromEntries(Object.entries(KIND_TO_CODE).map(([k, v]) => [v, k]));

/* ---------------------------------------------
 * Base36 helpers
 * ------------------------------------------- */
const toB36 = (n) => Number(n).toString(36);
const fromB36 = (s) => parseInt(String(s), 36);

/* ---------------------------------------------
 * Red paint RLE (row-wise)
 * ------------------------------------------- */
/**
 * Encode userPaint (Set<"x,y">) into a compact row-wise RLE string.
 * Example (base36): "y:xa-xb,xc; y2:..." or simple "x,y;..." when non-RLE.
 * @param {Set<string>} userPaintSet
 * @param {boolean} useBase36
 * @returns {string}
 */
function encodeRedRLE(userPaintSet, useBase36 = true) {
  if (!userPaintSet || userPaintSet.size === 0) return '';
  const byY = new Map();
  for (const k of userPaintSet) {
    const [xs, ys] = k.split(',');
    const x = parseInt(xs, 10);
    const y = parseInt(ys, 10);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (!byY.has(y)) byY.set(y, []);
    byY.get(y).push(x);
  }

  const ys = [...byY.keys()].sort((a, b) => a - b);
  const rows = [];

  for (const y of ys) {
    const xs = byY.get(y).sort((a, b) => a - b);
    const runs = [];
    let start = null,
      prev = null;

    for (const x of xs) {
      if (start === null) {
        start = prev = x;
        continue;
      }
      if (x === prev + 1) {
        prev = x;
        continue;
      }
      runs.push([start, prev]);
      start = prev = x;
    }
    if (start !== null) runs.push([start, prev]);

    const runStr = runs
      .map(([a, b]) => {
        const A = useBase36 ? toB36(a) : String(a);
        const B = useBase36 ? toB36(b) : String(b);
        return a === b ? A : `${A}-${B}`;
      })
      .join(',');

    const Y = useBase36 ? toB36(y) : String(y);
    rows.push(`${Y}:${runStr}`);
  }

  return rows.join(';');
}

/**
 * Decode RLE/base36 string back to array of "x,y" keys.
 * Accepts both RLE form ("y:...;...") and legacy "x,y;..." form.
 * @param {string} str
 * @param {boolean} useBase36
 * @returns {string[]}
 */
function decodeRed(str, useBase36) {
  const out = [];
  if (!str) return out;

  const isRLE = str.includes(':');
  if (isRLE) {
    for (const row of str.split(';')) {
      if (!row) continue;
      const [yStr, runsStr] = row.split(':');
      if (!runsStr) continue;
      const y = useBase36 ? fromB36(yStr) : parseInt(yStr, 10);
      if (!Number.isFinite(y)) continue;

      for (const r of runsStr.split(',')) {
        if (!r) continue;
        if (r.includes('-')) {
          const [aStr, bStr] = r.split('-');
          const a = useBase36 ? fromB36(aStr) : parseInt(aStr, 10);
          const b = useBase36 ? fromB36(bStr) : parseInt(bStr, 10);
          if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
          const start = Math.min(a, b),
            end = Math.max(a, b);
          for (let x = start; x <= end; x++) out.push(`${x},${y}`);
        } else {
          const x = useBase36 ? fromB36(r) : parseInt(r, 10);
          if (Number.isFinite(x)) out.push(`${x},${y}`);
        }
      }
    }
  } else {
    // legacy "x,y;..." format
    for (const p of str.split(';')) {
      if (!p) continue;
      const [xs, ys] = p.split(',');
      const x = useBase36 ? fromB36(xs) : parseInt(xs, 10);
      const y = useBase36 ? fromB36(ys) : parseInt(ys, 10);
      if (Number.isFinite(x) && Number.isFinite(y)) out.push(`${x},${y}`);
    }
  }
  return out;
}

/* ---------------------------------------------
 * Public: serialize / deserialize
 * ------------------------------------------- */
/**
 * Convert current state → compact querystring (hash payload).
 * Format (v=2):
 *   v=2
 *   b=<tokens>;...   where token = Code + size36 + '@' + cx36 + ',' + cy36 [+ '~' + encodeURIComponent(label)]
 *   r=<RLE base36>
 * @returns {string}
 */
export function serializeState() {
  // Filter out immutable blocks from serialization
  const bItems = state.blocks
    .filter((b) => !b.immutable)
    .map((b) => {
      const c = cellPx();
      const cx = Math.round(b.left / c);
      const cy = Math.round(b.top / c);
      const code = KIND_TO_CODE[b.kind] ?? 'B';
      const cx36 = toB36(cx);
      const cy36 = toB36(cy);

      let token;
      // Custom blocks store width x height separately
      if (b.kind === 'custom') {
        const w36 = toB36(b.width || b.size);
        const h36 = toB36(b.height || b.size);
        token = `${code}${w36}x${h36}@${cx36},${cy36}`;
      } else {
        const size36 = toB36(b.size);
        token = `${code}${size36}@${cx36},${cy36}`;
      }

      // Persist city and custom block labels only when truly custom (avoid saving defaults).
      if (b.kind === 'city') {
        const labelEl = b.el?.querySelector('.label');
        const label = (labelEl?.textContent || '').trim();

        // Treat both Korean and English defaults as non-custom
        if (label && label !== '도시' && label !== 'City') {
          token += `~${encodeURIComponent(label)}`;
        }
      } else if (b.kind === 'custom') {
        const labelEl = b.el?.querySelector('.label');
        const label = (labelEl?.textContent || '').trim();
        const defaultLabel = `${b.width || b.size}×${b.height || b.size}`;

        // Only save if label differs from default WxH format
        if (label && label !== defaultLabel) {
          token += `~${encodeURIComponent(label)}`;
        }
      }
      return token;
    });

  const rRLE = encodeRedRLE(state.userPaint, true);

  // Serialize object layers
  const oItems = state.objectLayers.map((o) => {
    const c = cellPx();
    const cx = Math.round(o.left / c);
    const cy = Math.round(o.top / c);

    // Format: O<w>x<h>@<cx>,<cy>~<color>~<edges>
    // edges: top|right|bottom|left as dot-separated offsets
    const edges = [
      o.topEdge.join('.'),
      o.rightEdge.join('.'),
      o.bottomEdge.join('.'),
      o.leftEdge.join('.'),
    ].join('|');

    const colorPart = o.color ? o.color.replace('#', '') : '';
    return `O${toB36(o.baseWidth)}x${toB36(o.baseHeight)}@${toB36(cx)},${toB36(cy)}~${colorPart}~${edges}`;
  });

  const params = new URLSearchParams();
  params.set('v', '2');
  params.set('b', bItems.join(';'));
  if (rRLE) params.set('r', rRLE);
  if (oItems.length > 0) params.set('o', oItems.join(';'));

  return params.toString();
}

/**
 * Parse a querystring (hash payload) back to state fragments.
 * Converts legacy 'block' kind to 'custom' kind automatically.
 * @param {string} qs
 * @returns {{blocks: Array<{kind:string,size:number,cx:number,cy:number,label?:string}>, red: string[], ver: string}}
 */
export function deserializeState(qs) {
  const params = new URLSearchParams(qs);
  const ver = params.get('v') || '1';
  const isV2 = ver === '2';

  const blocks = [];
  const bstr = params.get('b') || '';
  for (const token of bstr.split(';')) {
    if (!token) continue;

    const atIdx = token.indexOf('@');
    if (atIdx < 0) continue;

    const head = token.slice(0, atIdx);
    let tail = token.slice(atIdx + 1);

    // Optional label part split by "~"
    let label;
    const tildeIdx = tail.indexOf('~');
    if (tildeIdx >= 0) {
      label = decodeURIComponent(tail.slice(tildeIdx + 1));
      tail = tail.slice(0, tildeIdx);
    }

    const code = head[0];
    const sizeRaw = head.slice(1);

    const [cxStr, cyStr] = tail.split(',');
    const cx = isV2 ? parseInt(cxStr, 36) : parseInt(cxStr, 10) || 0;
    const cy = isV2 ? parseInt(cyStr, 36) : parseInt(cyStr, 10) || 0;

    let kind = CODE_TO_KIND[code] || 'block';

    // Legacy conversion: convert 'block' kind to 'custom' kind
    if (kind === 'block') {
      kind = 'custom';
    }

    // Custom blocks use WxH format
    if (kind === 'custom' && sizeRaw.includes('x')) {
      const [wStr, hStr] = sizeRaw.split('x');
      const width = isV2 ? parseInt(wStr, 36) : parseInt(wStr, 10) || 1;
      const height = isV2 ? parseInt(hStr, 36) : parseInt(hStr, 10) || 1;
      blocks.push({ kind, width, height, size: Math.max(width, height), cx, cy, label });
    } else {
      const size = isV2 ? parseInt(sizeRaw, 36) : parseInt(sizeRaw || '1', 10) || 1;
      // For legacy 'block' (now 'custom'), convert to width x height format
      if (kind === 'custom') {
        blocks.push({ kind, width: size, height: size, size, cx, cy, label });
      } else {
        blocks.push({ kind, size, cx, cy, label });
      }
    }
  }

  const redParam = params.get('r') || '';
  const red = decodeRed(redParam, /* useBase36= */ isV2);

  // Parse object layers
  const objectLayers = [];
  const ostr = params.get('o') || '';
  for (const token of ostr.split(';')) {
    if (!token) continue;

    // Format: O<w>x<h>@<cx>,<cy>~<color>~<edges>
    const atIdx = token.indexOf('@');
    if (atIdx < 0) continue;

    const head = token.slice(0, atIdx);
    const tail = token.slice(atIdx + 1);

    // Skip the 'O' prefix
    const sizeRaw = head.slice(1);
    const [wStr, hStr] = sizeRaw.split('x');
    const baseWidth = isV2 ? parseInt(wStr, 36) : parseInt(wStr, 10) || 4;
    const baseHeight = isV2 ? parseInt(hStr, 36) : parseInt(hStr, 10) || 4;

    // Parse position and optional color/edges
    const parts = tail.split('~');
    const posPart = parts[0];
    const colorPart = parts[1] || '';
    const edgesPart = parts[2] || '';

    const [cxStr, cyStr] = posPart.split(',');
    const cx = isV2 ? parseInt(cxStr, 36) : parseInt(cxStr, 10) || 0;
    const cy = isV2 ? parseInt(cyStr, 36) : parseInt(cyStr, 10) || 0;

    const color = colorPart ? `#${colorPart}` : null;

    // Parse edges: top|right|bottom|left
    let topEdge = new Array(baseWidth).fill(0);
    let rightEdge = new Array(baseHeight).fill(0);
    let bottomEdge = new Array(baseWidth).fill(0);
    let leftEdge = new Array(baseHeight).fill(0);

    if (edgesPart) {
      const edgeParts = edgesPart.split('|');
      if (edgeParts[0]) topEdge = edgeParts[0].split('.').map((n) => parseInt(n, 10) || 0);
      if (edgeParts[1]) rightEdge = edgeParts[1].split('.').map((n) => parseInt(n, 10) || 0);
      if (edgeParts[2]) bottomEdge = edgeParts[2].split('.').map((n) => parseInt(n, 10) || 0);
      if (edgeParts[3]) leftEdge = edgeParts[3].split('.').map((n) => parseInt(n, 10) || 0);
    }

    objectLayers.push({
      baseWidth,
      baseHeight,
      cx,
      cy,
      color,
      topEdge,
      rightEdge,
      bottomEdge,
      leftEdge,
    });
  }

  return { blocks, red, objectLayers, ver };
}

/* ---------------------------------------------
 * URL helpers
 * ------------------------------------------- */
/**
 * Replace current URL (without adding a history entry) with the given serialized payload in the hash.
 * @param {string} qs
 */
export function updateURLWithSerialized(qs) {
  const url = `${location.pathname}${location.search}#${qs}`;
  try {
    history.replaceState(null, '', url);
  } catch {
    // Some browsers/environments may block replaceState; fall back.
    location.hash = `#${qs}`;
  }
}

/* ---------------------------------------------
 * Legacy-compatible helpers
 * ------------------------------------------- */
export function saveToURLImmediate() {
  updateURLWithSerialized(serializeState());
}

let saveTimer = null;

/** Debounced URL update for frequent operations. */
export function queueSaveToURL() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveToURLImmediate();
  }, 150);
}

/**
 * Parse the current location hash into state fragments.
 * @returns {{blocks: Array, red: string[]}}
 */
export function parseFromURL() {
  const h = (location.hash || '').replace(/^#/, '');
  if (!h) return { blocks: [], red: [] };
  return deserializeState(h);
}
