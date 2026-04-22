# Traplace Refactoring & Performance Optimization Plan

> Last updated: 2026-04-22  
> Branch: `test/tests` → target `main`

---

## Project Overview

- **Backend:** Python 3.13 + Flask + Redis (no SQL DB)
- **Frontend:** Vanilla ES Modules, CSS Layers, no bundler
- **Critical gap:** Zero test coverage — all refactoring is unverifiable without tests first

---

## Progress Tracker

| Phase | Item                                                   | Priority | Status  |
| ----- | ------------------------------------------------------ | -------- | ------- |
| 1     | [B1] Undo/redo loses custom block attributes           | Critical | ✅ Done |
| 1     | [B2] `last_updated` always shows today's date          | High     | ✅ Done |
| 1     | [B3] Dead import: `colorPicker.js`                     | High     | ✅ Done |
| 2     | [S1] No rate limit + no URL length validation          | High     | ✅ Done |
| 2     | [S2] `lang` param not validated in `core.py`           | Medium   | ✅ Done |
| 2     | [S3] Redis path redirected without re-validation       | Medium   | ✅ Done |
| —     | **Write tests before Phase 3**                         | Critical | ✅ Done |
| 3     | [P1] O(n) `state.blocks.find` in 60fps handlers        | High     | ✅ Done |
| 3     | [P2] `recomputePaint()` cascade during drag            | High     | ✅ Done |
| 3     | [P3] `renderCells()` full DOM re-creation              | Medium   | ✅ Done |
| 3     | [P4] `console.log` in `recomputeRedZone()` hot path    | Medium   | ✅ Done |
| 3     | [P5] i18n JSON fetched with `cache: 'no-cache'`        | Medium   | ✅ Done |
| 3     | [P6] PNG export canvas size unbounded                  | Low      | ✅ Done |
| 4     | [Q1] Duplicate `privacy()`/`terms()` handlers          | High     | ⬜ Todo |
| 4     | [Q2] `window.__*` globals bypass module system         | Medium   | ⬜ Todo |
| 4     | [Q3] 12-arm ternary duplicated 3×                      | Medium   | ⬜ Todo |
| 4     | [Q4] `safeSetPointerCapture` copy-pasted               | Low      | ⬜ Todo |
| 4     | [Q5] Debug globals exposed in production               | Medium   | ⬜ Todo |
| 4     | [Q6] 21 hardcoded magic coordinates in `main.js`       | Low      | ⬜ Todo |
| 5     | [A1] No Flask error handlers for 404/500               | Low      | ⬜ Todo |
| 5     | [A2] `gunicorn.conf.py` workers vs Docker CMD conflict | Low      | ⬜ Todo |
| 5     | [A3] `SUPPORTED_LANGS` duplicated in Python + JS       | Low      | ⬜ Todo |
| 5     | [A4] File I/O in route handler, not service layer      | Low      | ⬜ Todo |

**Status key:** ⬜ Todo · 🔄 In Progress · ✅ Done · ⏭ Skipped

---

## Phase 1 — Bug Fixes (Do First)

These are real bugs that must be fixed before any refactoring.

### [B1] Undo/Redo Loses Custom Block Attributes

**File:** [`app/static/js/history.js:57-70`](app/static/js/history.js#L57)  
**Problem:** `applySerialized()` calls `createBlock(it.kind, it.size, left, top)` without passing `width`, `height`, `fontSize`, or `wordWrap`. Custom block dimensions and font settings are lost on every undo/redo.  
**Fix:** Pass all attributes to `createBlock` and restore them after creation.

### [B2] `last_updated` Always Shows Today's Date

**File:** [`app/routes/policies.py:103`](app/routes/policies.py#L103) and [`:131`](app/routes/policies.py#L131)  
**Problem:** `datetime.now().strftime(date_format)` — the "Last Updated" date on legal pages changes every day regardless of when the content was actually revised.  
**Fix:** Store the actual revision date in the JSON files (e.g., `"last_updated": "2025-01-01"`) and read it from there.

### [B3] Dead Import: `colorPicker.js`

**File:** [`app/static/js/main.js:42`](app/static/js/main.js#L42)  
**Problem:** `setupColorPicker` is imported and called but `#colorPicker` does not exist in the HTML. The function silently no-ops. Related CSS in `ui.css:398–506` is also dead.  
**Fix:** Remove the import, the call site, and the dead CSS.

---

## Phase 2 — Security

### [S1] No Rate Limit + No URL Length Validation on `POST /api/shorten`

**File:** [`app/routes/shortener.py:19-63`](app/routes/shortener.py#L19)  
**Problem:** Anyone can flood the endpoint to exhaust Redis storage. No per-IP limit, no length cap.  
**Fix:**

```python
# Add length check immediately after parsing
if len(raw) > 8190:
    return jsonify(error='url too long'), 400
```

Add `flask-limiter` for rate limiting or configure at the Nginx/proxy level.

### [S2] `lang` Parameter Not Validated in `core.py`

**File:** [`app/routes/core.py:18`](app/routes/core.py#L18)  
**Problem:** `current_lang = request.args.get('lang', 'en')` is passed to the template without checking against `SUPPORTED_LANGS`. `policies.py` already does this validation — `core.py` should too.  
**Fix:** Add `if lang not in SUPPORTED_LANGS: lang = 'en'` before passing to template.

### [S3] Redis Path Redirected Without Re-Validation

**File:** [`app/routes/shortener.py:75-81`](app/routes/shortener.py#L75)  
**Problem:** The `path` value retrieved from Redis is passed directly to `redirect()`. Defense-in-depth requires verifying the path is still a safe relative URL before serving.  
**Fix:** Validate the stored path starts with `/` and contains no scheme before calling `redirect(path)`.

---

## Phase 3 — Performance Optimization

> ⚠️ Write tests before starting this phase.

### [P1] O(n) Linear Block Lookup in 60fps Pointer Handlers

**Files:** [`app/static/js/interactions/drag.js`](app/static/js/interactions/drag.js), [`app/static/js/blocks.js`](app/static/js/blocks.js)  
**Problem:** `state.blocks.find(b => b.el === el)` appears **24 times** across the codebase, most critically inside `pointermove` handlers that fire at 60fps. Full array scan every frame.  
**Fix:** Add a `WeakMap<HTMLElement, Block>` side-index in `state.js`:

```javascript
// state.js
export const blockByEl = new WeakMap();

// In createBlock — register
blockByEl.set(block.el, block);

// In deleteBlock — unregister (WeakMap GC handles this automatically)

// Replace all .find(b => b.el === el) with:
blockByEl.get(el);
```

### [P2] `recomputePaint()` Cascade on Every Drag Position Change

**Files:** [`app/static/js/blocks.js`](app/static/js/blocks.js), [`app/static/js/render.js`](app/static/js/render.js)  
**Problem:** Every `updateBlockPosition()` call triggers `recomputePaint()` + `validateAllObjects()` + `queueSaveToURL()` + `saveCheckpoint()` — a cascade of 4 expensive operations. During a live drag, this fires on every grid snap.  
**Fix:**

```javascript
// drag.js — set flag on pointerdown, clear on pointerup
state.isDragging = true;

// blocks.js — skip cascade during drag
if (!state.isDragging) {
  recomputePaint();
  saveCheckpoint();
}

// drag.js — run once on pointerup
recomputePaint();
validateAllObjects();
saveCheckpoint();
```

### [P3] `renderCells()` Destroys and Recreates All Paint Tile DOM Nodes

**File:** [`app/static/js/render.js:123-153`](app/static/js/render.js#L123)  
**Problem:** `layer.innerHTML = ''` followed by creating individual `<div>` elements for every painted cell. Hundreds of DOM nodes destroyed and recreated on every block move.  
**Option A (quick):** Diff the previous and new cell sets, only add/remove changed tiles.  
**Option B (thorough):** Replace DOM tiles with a `<canvas>` layer for paint rendering.

### [P4] `console.log` in `recomputeRedZone()` Hot Path

**File:** [`app/static/js/render.js:274-277`](app/static/js/render.js#L274)  
**Problem:** A `console.log` with `.filter()` and string interpolation fires on every block position change.  
**Fix:** Remove the log entirely, or guard it with a `DEBUG` flag.

### [P5] i18n JSON Fetched with `cache: 'no-cache'`

**File:** [`app/static/js/i18n.js:175`](app/static/js/i18n.js#L175)  
**Problem:** Every language switch makes a fresh network request. Up to 2 round-trips with no HTTP caching benefit.  
**Fix:** Change `cache: 'no-cache'` to `cache: 'default'` and set appropriate `Cache-Control` headers on the static file server.

### [P6] PNG Export Canvas Size Unbounded

**File:** [`app/static/js/exportPNG.js:590-612`](app/static/js/exportPNG.js#L590)  
**Problem:** On retina displays (DPR=2) with a large layout, the export canvas can reach 10,000×10,000+ pixels. `getImageData` on this size causes a memory spike.  
**Fix:** Cap the canvas dimensions at a reasonable maximum (e.g., 4096px on the longest edge) and scale down if needed.

---

## Phase 4 — Code Quality

### [Q1] Duplicate `privacy()` / `terms()` Handler Bodies

**File:** [`app/routes/policies.py:88-141`](app/routes/policies.py#L88)  
**Problem:** Both handlers are 25-line identical structures — only the `page_type` string differs.  
**Fix:**

```python
def _render_legal(page_type: str):
    lang = request.args.get('lang', 'en')
    # ... shared logic ...
    return render_template('legal.html', ...)

@bp.get('/privacy')
def privacy(): return _render_legal('privacy')

@bp.get('/terms')
def terms(): return _render_legal('terms')
```

### [Q2] `window.__*` Globals Bypass the Module System

**Files:** [`app/static/js/main.js:198`](app/static/js/main.js#L198), [`app/static/js/i18n.js:505`](app/static/js/i18n.js#L505)  
**Problem:** `window.__turrets`, `window.__fortresses`, `window.__sanctuaries` are set in `main.js` and read in `i18n.js`, creating invisible cross-module coupling.  
**Fix:** Create `app/static/js/worldBlocks.js` that exports references; import it where needed.

### [Q3] 12-Arm Ternary Chain Duplicated 3×

**Files:** [`app/static/js/blocks.js:285-301`](app/static/js/blocks.js#L285), [`app/static/js/exportPNG.js:742`](app/static/js/exportPNG.js#L742), [`app/static/js/exportPNG.js:813`](app/static/js/exportPNG.js#L813)  
**Problem:** The same block-kind → label lookup ternary is copy-pasted verbatim.  
**Fix:** Extract `labelForKind(kind, userText, size)` into a shared utility and replace all three occurrences.

### [Q4] `safeSetPointerCapture` Copy-Pasted

**Files:** [`app/static/js/interactions/drag.js:133-142`](app/static/js/interactions/drag.js#L133), [`app/static/js/interactions/pan.js:23-31`](app/static/js/interactions/pan.js#L23)  
**Fix:** Move to a shared `app/static/js/interactions/utils.js` and import from both files.

### [Q5] Debug Globals Exposed in Production

**File:** [`app/static/js/main.js:538`](app/static/js/main.js#L538)  
**Problem:** `Object.assign(window, { state, centerToCell, updateBadge, saveCheckpoint })` runs unconditionally in production, exposing internal state.  
**Fix:**

```javascript
if (import.meta.env?.DEV) {
  Object.assign(window, { state, centerToCell, updateBadge, saveCheckpoint });
}
```

Or remove entirely and use browser devtools if needed.

### [Q6] 21 Hardcoded Magic Coordinates in `main.js`

**File:** [`app/static/js/main.js:146-380`](app/static/js/main.js#L146)  
**Problem:** Castle, turrets, fortresses, and sanctuaries are created with inline magic numbers like `594 * c`, `800 * c`. Impossible to modify the map without understanding the coordinate geometry.  
**Fix:** Extract to a `WORLD_LAYOUT` constant array:

```javascript
const WORLD_LAYOUT = [
  { kind: 'castle', size: 12, cx: 594, cy: 594 },
  { kind: 'turret', size: 2, cx: 594, cy: 594, name: 'Turret I' },
  // ...
];
```

---

## Phase 5 — Architecture

### [A1] No Flask Error Handlers for 404/500

**Problem:** Flask returns bare Werkzeug default HTML on errors. Should return branded or JSON error responses.  
**Fix:** Register `@app.errorhandler(404)` and `@app.errorhandler(500)` in `app/__init__.py`.

### [A2] `gunicorn.conf.py` Workers Setting Silently Overridden

**File:** [`gunicorn.conf.py`](gunicorn.conf.py)  
**Problem:** `workers = 4` in the conf file is always overridden by Docker CMD's `-w ${WORKERS}` (default: `2`, compose: `1`). The conf file value is never used.  
**Fix:** Remove `workers` from `gunicorn.conf.py`. Manage it solely via the `WORKERS` env var.

### [A3] `SUPPORTED_LANGS` Duplicated in Python and JS

**Files:** [`app/routes/policies.py:19-35`](app/routes/policies.py#L19), [`app/static/js/i18n.js:16-32`](app/static/js/i18n.js#L16)  
**Problem:** The two lists are already out of sync (`ar` present in Python, commented out in JS).  
**Fix:** Serve the list from a backend endpoint or maintain a single `supported_langs.json` as the source of truth.

### [A4] File I/O in Route Handler, Not Service Layer

**File:** [`app/routes/policies.py:57-85`](app/routes/policies.py#L57)  
**Problem:** `load_legal_content()` does filesystem I/O directly inside the route layer.  
**Fix:** Move to `app/services/legal.py` or `app/utils/legal.py`.

---

## Recommended Order

```
Phase 1 (Bugs) → Phase 2 (Security) → Write Tests
                                            ↓
                      Phase 3 (Performance) → Phase 4 (Quality) → Phase 5 (Architecture)
```

Tests should be added before Phase 3. Without them, there is no way to verify that performance changes haven't broken existing behavior.

**Suggested test targets:**

- `pytest` for all backend routes (`/`, `/healthz`, `POST /api/shorten`, `GET /s/<code>`, `/privacy`, `/terms`)
- `vitest` for frontend utilities: `urlState.js`, `history.js`, `blocks.js` core functions
