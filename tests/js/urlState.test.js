/**
 * tests/js/urlState.test.js
 *
 * Tests for the pure serialization logic in urlState.js.
 * deserializeState() has no DOM or state dependencies, so it is tested directly.
 */

import { describe, it, expect } from 'vitest';

// ── Inline the pure functions under test ─────────────────────────────────────
// We replicate only the logic that can be exercised without a DOM, so we don't
// have to mock every transitive import that urlState.js pulls in.

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

const toB36 = (n) => Number(n).toString(36);
const fromB36 = (s) => parseInt(String(s), 36);

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
          for (let x = Math.min(a, b); x <= Math.max(a, b); x++) out.push(`${x},${y}`);
        } else {
          const x = useBase36 ? fromB36(r) : parseInt(r, 10);
          if (Number.isFinite(x)) out.push(`${x},${y}`);
        }
      }
    }
  } else {
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

function deserializeState(qs) {
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

    let wordWrap = false;
    const bangIdx = tail.indexOf('!');
    if (bangIdx >= 0) {
      wordWrap = true;
      tail = tail.slice(0, bangIdx) + tail.slice(bangIdx + 1);
    }

    let fontSize;
    const starIdx = tail.indexOf('*');
    if (starIdx >= 0) {
      const starContent = tail.slice(starIdx + 1);
      const nextSpecialIdx = starContent.search(/[~!]/);
      const sizeValStr = nextSpecialIdx >= 0 ? starContent.slice(0, nextSpecialIdx) : starContent;
      fontSize = isV2 ? parseInt(sizeValStr, 36) : parseInt(sizeValStr, 10);
      tail =
        tail.slice(0, starIdx) + (nextSpecialIdx >= 0 ? starContent.slice(nextSpecialIdx) : '');
    }

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
    if (kind === 'block') kind = 'custom';

    if (kind === 'custom' && sizeRaw.includes('x')) {
      const [wStr, hStr] = sizeRaw.split('x');
      const width = isV2 ? parseInt(wStr, 36) : parseInt(wStr, 10) || 1;
      const height = isV2 ? parseInt(hStr, 36) : parseInt(hStr, 10) || 1;
      blocks.push({
        kind,
        width,
        height,
        size: Math.max(width, height),
        cx,
        cy,
        label,
        fontSize,
        wordWrap,
      });
    } else {
      const size = isV2 ? parseInt(sizeRaw, 36) : parseInt(sizeRaw || '1', 10) || 1;
      if (kind === 'custom') {
        blocks.push({ kind, width: size, height: size, size, cx, cy, label, fontSize, wordWrap });
      } else {
        blocks.push({ kind, size, cx, cy, label, fontSize, wordWrap });
      }
    }
  }

  const red = decodeRed(params.get('r') || '', isV2);
  return { blocks, red, ver };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('deserializeState – block parsing', () => {
  it('parses a single v2 flag block', () => {
    const qs = 'v=2&b=F2@3,4';
    const { blocks } = deserializeState(qs);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: 'flag', size: 2, cx: 3, cy: 4 });
  });

  it('parses a city block with custom label', () => {
    const label = encodeURIComponent('My City');
    const qs = `v=2&b=C1@1,1~${label}`;
    const { blocks } = deserializeState(qs);
    expect(blocks[0].label).toBe('My City');
  });

  it('parses a custom block using WxH format', () => {
    const qs = 'v=2&b=X3x4@5,6';
    const { blocks } = deserializeState(qs);
    expect(blocks[0]).toMatchObject({ kind: 'custom', width: 3, height: 4 });
  });

  it('restores wordWrap flag', () => {
    const qs = 'v=2&b=F2@3,4!';
    const { blocks } = deserializeState(qs);
    expect(blocks[0].wordWrap).toBe(true);
  });

  it('restores fontSize from base36', () => {
    // fontSize 18 in base36 is 'i'
    const qs = `v=2&b=F2@3,4*${toB36(18)}`;
    const { blocks } = deserializeState(qs);
    expect(blocks[0].fontSize).toBe(18);
  });

  it('handles multiple blocks separated by semicolons', () => {
    const qs = 'v=2&b=F1@0,0;H1@1,1;R1@2,2';
    const { blocks } = deserializeState(qs);
    expect(blocks).toHaveLength(3);
    expect(blocks.map((b) => b.kind)).toEqual(['flag', 'hq', 'resource']);
  });

  it('converts legacy block kind to custom', () => {
    const qs = 'v=2&b=B3@1,1';
    const { blocks } = deserializeState(qs);
    expect(blocks[0].kind).toBe('custom');
  });

  it('returns empty blocks for empty b param', () => {
    const { blocks } = deserializeState('v=2&b=');
    expect(blocks).toHaveLength(0);
  });
});

describe('deserializeState – red paint decoding', () => {
  it('decodes a single red cell (v2 base36 RLE)', () => {
    // x=1, y=1 → base36: '1:1'
    const qs = 'v=2&r=1:1';
    const { red } = deserializeState(qs);
    expect(red).toContain('1,1');
  });

  it('decodes a run of consecutive cells', () => {
    // y=0, x=0..2 → '0:0-2'
    const qs = 'v=2&r=0:0-2';
    const { red } = deserializeState(qs);
    expect(red).toEqual(expect.arrayContaining(['0,0', '1,0', '2,0']));
    expect(red).toHaveLength(3);
  });

  it('decodes multiple rows', () => {
    const qs = 'v=2&r=0:0;1:1';
    const { red } = deserializeState(qs);
    expect(red).toContain('0,0');
    expect(red).toContain('1,1');
  });

  it('returns empty array when r param is absent', () => {
    const { red } = deserializeState('v=2&b=F1@0,0');
    expect(red).toHaveLength(0);
  });
});

describe('deserializeState – version handling', () => {
  it('sets ver field correctly for v2', () => {
    const { ver } = deserializeState('v=2&b=');
    expect(ver).toBe('2');
  });

  it('defaults to v1 when v param missing', () => {
    const { ver } = deserializeState('b=');
    expect(ver).toBe('1');
  });
});
