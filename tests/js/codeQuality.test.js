/**
 * tests/js/codeQuality.test.js
 *
 * Static source-code assertions for REFACTORING.md Phase 3/4/5 items.
 * Each test reads the relevant source file and asserts the expected property.
 * Tests marked with [CURRENTLY FAILING — fix target] will fail until the
 * corresponding refactor is applied; they serve as regression guards.
 *
 * Legend:
 *  ✅ already fixed  → passes now, guards against regression
 *  ⬜ not yet fixed  → fails now, documents the expected fix
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const JS = (...parts) => resolve(import.meta.dirname, '../../app/static/js', ...parts);
const PY = (...parts) => resolve(import.meta.dirname, '../../app', ...parts);

const read = (path) => readFileSync(path, 'utf-8');

// ── Phase 3 — Performance ────────────────────────────────────────────────────

describe('[P1] O(n) block lookup — state.blocks.find(b => b.el === el)', () => {
  it('drag.js should use WeakMap index instead of .find()', () => {
    const src = read(JS('interactions/drag.js'));
    // After fix: blockByEl.get(el) replaces state.blocks.find(b => b.el === el)
    // This test will FAIL until P1 is implemented.
    expect(src).not.toMatch(/state\.blocks\.find\(.*\.el\s*===\s*el/);
  });

  it('blocks.js should use WeakMap index instead of .find()', () => {
    const src = read(JS('blocks.js'));
    expect(src).not.toMatch(/state\.blocks\.find\(.*\.el\s*===\s*el/);
  });
});

describe('[P2] recomputePaint cascade during drag', () => {
  it('drag.js should set state.isDragging on pointerdown', () => {
    const src = read(JS('interactions/drag.js'));
    // After fix: state.isDragging = true on pointerdown, false on pointerup
    expect(src).toMatch(/state\.isDragging\s*=\s*true/);
  });

  it('blocks.js should guard recomputePaint with !state.isDragging', () => {
    const src = read(JS('blocks.js'));
    expect(src).toMatch(/state\.isDragging/);
  });
});

describe('[P3] renderCells() full DOM re-creation', () => {
  it('render.js should not wipe innerHTML on every call', () => {
    const src = read(JS('render.js'));
    // After fix: layer.innerHTML = '' is removed / guarded
    // This will FAIL until P3 is implemented.
    const renderCellsFn = src.slice(src.indexOf('export function renderCells'));
    // Grab just the function body (up to the next export or end of file)
    const body = renderCellsFn.slice(0, renderCellsFn.indexOf('\nexport', 10) || undefined);
    expect(body).not.toContain("layer.innerHTML = ''");
  });
});

describe('[P4] console.log in recomputeRedZone() hot path', () => {
  it('render.js recomputeRedZone should not contain console.log', () => {
    const src = read(JS('render.js'));
    const fnStart = src.indexOf('function recomputeRedZone');
    const fnEnd = src.indexOf('\nfunction ', fnStart + 1);
    const body = fnEnd > 0 ? src.slice(fnStart, fnEnd) : src.slice(fnStart);
    // This will FAIL until P4 is fixed.
    expect(body).not.toContain('console.log');
  });
});

describe('[P5] i18n JSON fetched with cache: no-cache', () => {
  it("i18n.js fetch should not use cache: 'no-cache'", () => {
    const src = read(JS('i18n.js'));
    // This will FAIL until P5 is fixed.
    expect(src).not.toContain("cache: 'no-cache'");
  });
});

describe('[P6] PNG export canvas size unbounded', () => {
  it('exportPNG.js should cap canvas dimensions', () => {
    const src = read(JS('exportPNG.js'));
    // After fix: a max cap (e.g. 4096) limits canvas size.
    expect(src).toMatch(/4096|MAX_CANVAS|maxDim|clamp/);
  });
});

// ── Phase 4 — Code Quality ───────────────────────────────────────────────────

describe('[Q1] Duplicate privacy()/terms() handler bodies', () => {
  it('policies.py should have a shared _render_legal helper', () => {
    const src = read(PY('routes/policies.py'));
    // After fix: a shared helper replaces the duplicated handler bodies.
    expect(src).toMatch(/_render_legal|render_legal/);
  });
});

describe('[Q2] window.__* globals bypass module system', () => {
  it('main.js should not set window.__turrets', () => {
    const src = read(JS('main.js'));
    // After fix: worldBlocks.js module replaces window.__turrets etc.
    expect(src).not.toMatch(/window\.__turrets/);
  });

  it('main.js should not set window.__fortresses', () => {
    const src = read(JS('main.js'));
    expect(src).not.toMatch(/window\.__fortresses/);
  });
});

describe('[Q3] 12-arm ternary duplicated 3×', () => {
  it('blocks.js should not contain the repeated ternary chain', () => {
    const src = read(JS('blocks.js'));
    // After fix: labelForKind() utility replaces inline ternary
    const chainMarker = "kind === 'hq'";
    const occurrences = src.split(chainMarker).length - 1;
    // Currently duplicated — this FAILS until Q3 is fixed (expect ≤1 occurrence)
    expect(occurrences).toBeLessThanOrEqual(1);
  });

  it('exportPNG.js should not contain the repeated ternary chain', () => {
    const src = read(JS('exportPNG.js'));
    const chainMarker = "kind === 'hq'";
    const occurrences = src.split(chainMarker).length - 1;
    expect(occurrences).toBeLessThanOrEqual(1);
  });
});

describe('[Q4] safeSetPointerCapture copy-pasted', () => {
  it('drag.js should import safeSetPointerCapture from a shared module', () => {
    const src = read(JS('interactions/drag.js'));
    // After fix: function definition moves to utils.js, drag.js imports it
    const definedLocally = /^function safeSetPointerCapture/m.test(src);
    // This FAILS until Q4 is fixed (local definition should be removed)
    expect(definedLocally).toBe(false);
  });

  it('pan.js should import safeSetPointerCapture from a shared module', () => {
    const src = read(JS('interactions/pan.js'));
    const definedLocally = /^function safeSetPointerCapture/m.test(src);
    expect(definedLocally).toBe(false);
  });
});

describe('[Q5] Debug globals exposed in production', () => {
  it('main.js Object.assign(window, ...) should be guarded by a DEV flag', () => {
    const src = read(JS('main.js'));
    // After fix: wrapped in if (import.meta.env?.DEV) or removed entirely
    const rawAssign = /Object\.assign\(window,/.test(src);
    const guarded = /import\.meta\.env.*DEV/.test(src);
    // This FAILS until Q5 is fixed
    if (rawAssign) {
      expect(guarded).toBe(true);
    }
  });
});

describe('[Q6] 21 hardcoded magic coordinates in main.js', () => {
  it('main.js should define a WORLD_LAYOUT constant', () => {
    const src = read(JS('main.js'));
    // After fix: WORLD_LAYOUT replaces scattered magic numbers
    expect(src).toMatch(/WORLD_LAYOUT/);
  });
});

// ── Phase 5 — Architecture ───────────────────────────────────────────────────

describe('[A1] No Flask error handlers for 404/500', () => {
  it('app __init__.py should register 404 and 500 error handlers', () => {
    const src = read(PY('__init__.py'));
    expect(src).toMatch(/errorhandler\(404\)/);
    expect(src).toMatch(/errorhandler\(500\)/);
  });
});

describe('[A2] gunicorn.conf.py workers overridden by Docker CMD', () => {
  it('gunicorn.conf.py should not hardcode workers', () => {
    const src = readFileSync(resolve(import.meta.dirname, '../../gunicorn.conf.py'), 'utf-8');
    // After fix: 'workers' key removed, managed solely by WORKERS env var
    expect(src).not.toMatch(/^workers\s*=/m);
  });
});

describe('[A3] SUPPORTED_LANGS duplicated in Python and JS', () => {
  it('Python and JS SUPPORTED_LANGS should contain the same languages', () => {
    const pySrc = read(PY('routes/policies.py'));
    const jsSrc = read(JS('i18n.js'));

    const extractList = (src, start) => {
      const begin = src.indexOf(start);
      const chunk = src.slice(begin, src.indexOf(']', begin));
      return [...chunk.matchAll(/'([a-z]{2}(?:-[A-Z]{2})?)'/g)].map((m) => m[1]);
    };

    const pyLangs = extractList(pySrc, 'SUPPORTED_LANGS = [');
    const jsLangs = extractList(jsSrc, 'SUPPORTED_LANGS = [');

    // ar is in Python but commented out in JS — this FAILS until A3 is fixed
    const missing = pyLangs.filter((l) => !jsLangs.includes(l));
    expect(missing).toHaveLength(0);
  });
});

describe('[A4] File I/O in route handler', () => {
  it('load_legal_content should live in a service/utils layer, not routes', () => {
    // After fix: moved to app/services/legal.py or app/utils/legal.py
    const servicePath = resolve(import.meta.dirname, '../../app/services/legal.py');
    const utilPath = resolve(import.meta.dirname, '../../app/utils/legal.py');
    expect(existsSync(servicePath) || existsSync(utilPath)).toBe(true);
  });
});
