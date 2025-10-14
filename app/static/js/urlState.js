// assets/js/urlState.js
import { state, cell } from './state.js';

// kind <-> code
const KIND_TO_CODE = { block:'B', flag:'F', hq:'H', city:'C', resource:'R', trap:'T' };
const CODE_TO_KIND = Object.fromEntries(Object.entries(KIND_TO_CODE).map(([k,v])=>[v,k]));

let saveTimer = null;

/* Base36 helpers */
const toB36  = (n) => Number(n).toString(36);
const fromB36 = (s) => parseInt(String(s), 36);

/* ---------------- RLE (행 단위) ------------------ */
function encodeRedRLE(userPaintSet, useBase36 = true){
  if (!userPaintSet || userPaintSet.size === 0) return '';
  const byY = new Map();
  for (const k of userPaintSet){
    const [xs, ys] = k.split(',');
    const x = parseInt(xs, 10), y = parseInt(ys, 10);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (!byY.has(y)) byY.set(y, []);
    byY.get(y).push(x);
  }
  const ys = [...byY.keys()].sort((a,b)=>a-b);
  const rows = [];
  for (const y of ys){
    const xs = byY.get(y).sort((a,b)=>a-b);
    const runs = [];
    let start = null, prev = null;
    for (const x of xs){
      if (start === null){ start = prev = x; continue; }
      if (x === prev + 1){ prev = x; continue; }
      runs.push([start, prev]);
      start = prev = x;
    }
    if (start !== null) runs.push([start, prev]);
    const runStr = runs.map(([a,b])=>{
      const A = useBase36 ? toB36(a) : String(a);
      const B = useBase36 ? toB36(b) : String(b);
      return (a===b) ? A : `${A}-${B}`;
    }).join(',');
    const Y = useBase36 ? toB36(y) : String(y);
    rows.push(`${Y}:${runStr}`);
  }
  return rows.join(';');
}

function decodeRed(str, useBase36){
  const out = [];
  if (!str) return out;
  const isRLE = str.includes(':');
  if (isRLE){
    for (const row of str.split(';')){
      if (!row) continue;
      const [yStr, runsStr] = row.split(':');
      if (!runsStr) continue;
      const y = useBase36 ? fromB36(yStr) : parseInt(yStr, 10);
      if (!Number.isFinite(y)) continue;
      for (const r of runsStr.split(',')){
        if (!r) continue;
        if (r.includes('-')){
          const [aStr, bStr] = r.split('-');
          const a = useBase36 ? fromB36(aStr) : parseInt(aStr, 10);
          const b = useBase36 ? fromB36(bStr) : parseInt(bStr, 10);
          if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
          const start = Math.min(a,b), end = Math.max(a,b);
          for (let x = start; x <= end; x++) out.push(`${x},${y}`);
        } else {
          const x = useBase36 ? fromB36(r) : parseInt(r, 10);
          if (Number.isFinite(x)) out.push(`${x},${y}`);
        }
      }
    }
  } else {
    for (const p of str.split(';')){
      if (!p) continue;
      const [xs, ys] = p.split(',');
      const x = useBase36 ? fromB36(xs) : parseInt(xs, 10);
      const y = useBase36 ? fromB36(ys) : parseInt(ys, 10);
      if (Number.isFinite(x) && Number.isFinite(y)) out.push(`${x},${y}`);
    }
  }
  return out;
}

/* --------- 직렬화 / 역직렬화 공개 함수 ---------- */

// 현재 state → 쿼리스트링(v=2&b=...&r=...)
export function serializeState(){
  const bItems = state.blocks.map(b => {
    const cx = Math.round(b.left / cell);
    const cy = Math.round(b.top  / cell);
    const code = KIND_TO_CODE[b.kind] ?? 'B';
    const size36 = toB36(b.size);
    const cx36   = toB36(cx);
    const cy36   = toB36(cy);
    let token = `${code}${size36}@${cx36},${cy36}`;
    if (b.kind === 'city') {
      const labelEl = b.el?.querySelector('.label');
      const label = (labelEl?.textContent || '').trim();
      if (label && label !== '도시') token += `~${encodeURIComponent(label)}`;
    }
    return token;
  });
  const rRLE = encodeRedRLE(state.userPaint, true);
  const params = new URLSearchParams();
  params.set('v','2');
  params.set('b', bItems.join(';'));
  if (rRLE) params.set('r', rRLE);
  return params.toString();
}

// 쿼리스트링(v=..&b=..&r=..) → {blocks, red, ver}
export function deserializeState(qs){
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
    let tail  = token.slice(atIdx + 1);

    let label;
    const tildeIdx = tail.indexOf('~');
    if (tildeIdx >= 0) {
      label = decodeURIComponent(tail.slice(tildeIdx + 1));
      tail  = tail.slice(0, tildeIdx);
    }

    const code = head[0];
    const sizeRaw = head.slice(1);
    const size = isV2 ? parseInt(sizeRaw, 36) : (parseInt(sizeRaw || '1', 10) || 1);

    const [cxStr, cyStr] = tail.split(',');
    const cx = isV2 ? parseInt(cxStr, 36) : (parseInt(cxStr, 10) || 0);
    const cy = isV2 ? parseInt(cyStr, 36) : (parseInt(cyStr, 10) || 0);

    const kind = CODE_TO_KIND[code] || 'block';
    blocks.push({ kind, size, cx, cy, label });
  }

  const redParam = params.get('r') || '';
  const red = decodeRed(redParam, /*useBase36=*/isV2);

  return { blocks, red, ver };
}

// URL 갱신(히스토리 추가 없이)
export function updateURLWithSerialized(qs){
  const url = `${location.pathname}${location.search}#${qs}`;
  history.replaceState(null, '', url);
}

/* -------- 기존 API (호환) ---------- */
export function saveToURLImmediate(){
  updateURLWithSerialized(serializeState());
}

export function queueSaveToURL(){
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; saveToURLImmediate(); }, 150);
}

export function parseFromURL(){
  const h = (location.hash || '').replace(/^#/, '');
  if (!h) return { blocks:[], red:[] };
  return deserializeState(h);
}
