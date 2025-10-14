// static/js/i18n.js
// Online i18n loader with origin-based base URLs, language detection, safe HTML rendering, and DOM applicator.
// Notes:
// - Use data-i18n for plain text (textContent).
// - Use data-i18n-html for HTML-enabled strings (innerHTML with allowlist-based sanitizer).
// - Existing data-i18n-id mappings are preserved; usageBody is treated as HTML.

// ───────────────────────────────────────────────────────────────────────────────
// Config / Globals
// ───────────────────────────────────────────────────────────────────────────────
const FALLBACK_LANG = 'en';

let DICT = null;       // Active dictionary
let CUR_LANG = FALLBACK_LANG; // Active language code

// Built-in EN dictionary as the last-resort safety net
const BUILTIN_EN = {
  app: { title: "Alliance Placement Simulator" },
  ui: {
    usageTitle: "How to use",
    usage:
      "• <b>Drag & drop</b>: place items from the left palette (grid snap).<br>" +
      "• <b>Middle-button drag</b>: pan the view.<br>" +
      "• <b>Ctrl/⌘ + Mouse wheel</b>: zoom in/out (½ sensitivity).<br>" +
      "• <b>Trackpad pinch</b>: zoom in/out (½ sensitivity).<br>" +
      "• <b>Click a cell</b>: toggle red paint on floor.<br>" +
      "• <b>City</b> label: double-click → edit (Enter save / Esc cancel).<br>" +
      "• Bottom <b>🗑 area</b>: drag an item here to delete.<br>" +
      "※ Blue paint is created by <b>Alliance Flag (7×7)</b> and <b>HQ (15×15)</b>.",
    paletteTitle: "Palette",
    toolbar: {
      undo: "Undo",
      redo: "Redo",
      reset: "Reset",
      copy: "Copy URL",
      export: "Export PNG",
      dist2label: "Set City label to distance from Traps",
      lang: "Language",
      home: "Go to center",
    },
    footer: {
      credit: "Created by #135 [KOR] BangGuseok Dev",
      bmc: "Buy me a coffee",
      toss: "Toss",
    },
  },
  palette: {
    hq: "HQ",
    flag: "Alliance Flag",
    trap: "Hunting Trap",
    city: "City",
    resource: "Alliance Resource",
    block1: "1×1",
    block2: "2×2",
    block3: "3×3",
  },
  alert: {
    noCities: "No cities.",
    noTraps: "No traps.",
    resetConfirm:
      "Reset everything? (All objects and red tiles will be removed)",
    exportFail: "Failed to export PNG.",
  },
};

// ───────────────────────────────────────────────────────────────────────────────
// Base URL resolution
// ───────────────────────────────────────────────────────────────────────────────
/**
 * Compute i18n base directories in priority order.
 * Priority:
 * 1) window.I18N_BASES if provided (array of base URLs)
 * 2) Fallback to origin-based defaults:
 *    - {origin}/static/i18n
 *    - {origin}/i18n
 */
function getBases() {
  const g = typeof window !== 'undefined' ? window : {};
  if (Array.isArray(g.I18N_BASES) && g.I18N_BASES.length) {
    return g.I18N_BASES;
  }
  const origin = location.origin; // e.g., https://example.com[:port]
  return [`${origin}/static/i18n`, `${origin}/i18n`];
}

// ───────────────────────────────────────────────────────────────────────────────
// Language detection & fetching
// ───────────────────────────────────────────────────────────────────────────────
/**
 * Detect preferred language:
 * 1) URL ?lang=xx
 * 2) localStorage 'lang'
 * 3) navigator.language: ko → 'ko', otherwise 'en'
 */
export function detectPreferredLang() {
  const url = new URL(location.href);
  const qp = (url.searchParams.get('lang') || '').toLowerCase();
  if (qp) return qp;

  const saved = localStorage.getItem('lang');
  if (saved) return saved;

  const nav = (navigator.language || 'en').toLowerCase();
  if (nav.startsWith('ko')) return 'ko';
  return 'en';
}

/**
 * Try to fetch JSON dict for a given language from each base URL.
 * Returns parsed JSON or null if all attempts fail.
 */
async function fetchJsonFromBases(lang) {
  const bases = getBases();
  for (const base of bases) {
    const u = `${base}/${lang}.json`;
    try {
      const r = await fetch(u, { cache: 'no-cache', mode: 'cors' });
      if (r.ok) return await r.json();
    } catch (_err) {
      // ignore and try next base
    }
  }
  return null;
}

/**
 * Load a language:
 * - First try requested lang from bases
 * - Fallback to 'en' from bases
 * - Fallback to built-in EN
 * Also updates URL (?lang=...) and localStorage.
 */
export async function loadLanguageOnline(lang) {
  CUR_LANG = lang === 'ko' || lang === 'en' ? lang : FALLBACK_LANG;

  // Temporary DICT to avoid flash of empty content
  if (!DICT) DICT = BUILTIN_EN;

  // 1) Requested language
  let dict = await fetchJsonFromBases(CUR_LANG);
  let appliedLang = CUR_LANG;

  // 2) Fallback to EN
  if (!dict && CUR_LANG !== FALLBACK_LANG) {
    dict = await fetchJsonFromBases(FALLBACK_LANG);
    appliedLang = FALLBACK_LANG;
  }

  // 3) Built-in EN
  if (!dict) {
    dict = BUILTIN_EN;
    appliedLang = FALLBACK_LANG;
  }

  DICT = dict;
  CUR_LANG = appliedLang;

  // Persist language in URL and localStorage
  const url = new URL(location.href);
  url.searchParams.set('lang', appliedLang);
  history.replaceState(null, '', url.toString());
  localStorage.setItem('lang', appliedLang);

  applyI18nToDOM();
}

// ───────────────────────────────────────────────────────────────────────────────
// Lookup helpers
// ───────────────────────────────────────────────────────────────────────────────
/**
 * Safe lookup: "a.b.c" → DICT[a][b][c] (or returns path if missing)
 */
export function t(path) {
  const segs = path.split('.');
  let cur = DICT || BUILTIN_EN;
  for (const s of segs) {
    cur = (cur || {})[s];
    if (cur == null) return path; // fall back to key path
  }
  return cur;
}

export function currentLang() {
  return CUR_LANG;
}

// ───────────────────────────────────────────────────────────────────────────────
// Sanitizer for HTML-enabled i18n strings
// ───────────────────────────────────────────────────────────────────────────────
/**
 * Allowlist-based sanitizer:
 * - First escape everything
 * - Then restore a small set of safe tags/attributes:
 *   Tags: b, i, em, strong, br, code, small, sup, sub, u, a
 *   <a> attributes: href (http/https/mailto/tel only), target (_self/_blank/_parent/_top),
 *                   rel (no opener for _blank)
 */
function sanitizeHtml(input) {
  if (typeof input !== 'string') return '';

  // 1) escape all
  const escaped = input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 2) restore allowlisted tags
  const unescapeAllowed = escaped
    // <br> (with optional self-closing)
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    // simple paired tags
    .replace(/&lt;(\/?)(b|i|em|strong|code|small|sup|sub|u)&gt;/gi, '<$1$2>')
    // <a ...>...</a>
    .replace(/&lt;a\s+([^&]*)&gt;/gi, (m, attrs) => {
      const hrefMatch = attrs.match(/href\s*=\s*"(.*?)"/i);
      const targetMatch = attrs.match(/target\s*=\s*"(.*?)"/i);
      const relMatch = attrs.match(/rel\s*=\s*"(.*?)"/i);

      let href = hrefMatch ? hrefMatch[1] : '';
      let target = targetMatch ? targetMatch[1] : '';
      let rel = relMatch ? relMatch[1] : '';

      // allow only safe schemes
      const ok = /^(https?:|mailto:|tel:)/i.test(href);
      if (!ok) href = '#';

      // normalize target and rel
      if (target && !/^_self|_blank|_parent|_top$/i.test(target)) {
        target = '_self';
      }
      if (target === '_blank' && !rel) {
        rel = 'noopener noreferrer';
      }

      const safeAttrs = [
        href ? `href="${href}"` : null,
        target ? `target="${target}"` : null,
        rel ? `rel="${rel}"` : null,
      ]
        .filter(Boolean)
        .join(' ');

      return `<a ${safeAttrs}>`;
    })
    .replace(/&lt;\/a&gt;/gi, '</a>');

  return unescapeAllowed;
}

// ───────────────────────────────────────────────────────────────────────────────
// DOM application
// ───────────────────────────────────────────────────────────────────────────────
/**
 * Apply i18n to the DOM:
 * - [data-i18n] → textContent (plain text only)
 * - [data-i18n-title] → title (plain text)
 * - [data-i18n-html] → innerHTML (sanitized)
 * - [data-i18n-id] (legacy mapping) → usageBody as HTML, others as text
 * - palette item labels are updated as plain text
 */

// 1) 값에 허용태그가 있는지 감지
function hasAllowedHtml(s) {
  if (typeof s !== 'string') return false;
  // 허용 태그: b, i, em, strong, br, code, small, sup, sub, u, a
  return /<(br|b|i|em|strong|code|small|sup|sub|u|a)\b|<\/(b|i|em|strong|code|small|sup|sub|u|a)>/i.test(s);
}

// 2) 키를 받아 해당 엘리먼트에 렌더(자동 판별: HTML이면 innerHTML+sanitize, 아니면 textContent)
function renderI18n(el, key) {
  const val = t(key);
  // 개발자가 강제로 HTML을 쓰고 싶으면 data-i18n-html 속성을 주면 됨
  const forceHtml = el.hasAttribute('data-i18n-html');
  if (forceHtml || hasAllowedHtml(val)) {
    el.innerHTML = sanitizeHtml(val);
  } else {
    el.textContent = val;
  }
}

export function applyI18nToDOM() {
  // [data-i18n] : 자동 판별
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    renderI18n(el, el.getAttribute('data-i18n'));
  });

  // [data-i18n-title] : title은 항상 텍스트
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });

  // [data-i18n-id] : 레거시 매핑도 자동 판별로 통일
  document.querySelectorAll('[data-i18n-id]').forEach((el) => {
    const id = el.getAttribute('data-i18n-id');
    const mapId = {
      usageTitle: 'ui.usageTitle',
      usageBody : 'ui.usage',       // 예: 여긴 HTML 포함
      footer_bmc: 'ui.footer.bmc',
      footer_toss: 'ui.footer.toss',
      footer_credit: 'ui.footer.credit',
    }[id];
    if (mapId) renderI18n(el, mapId);
  });

  // 팔레트 항목(텍스트)
  const map = {
    hq: t('palette.hq'),
    flag: t('palette.flag'),
    trap: t('palette.trap'),
    city: t('palette.city'),
    resource: t('palette.resource'),
  };
  document.querySelectorAll('.palette-item').forEach((el) => {
    const kind = el.getAttribute('data-kind');
    const size = Number(el.getAttribute('data-size'));
    const label = map[kind] || (size ? `${size}×${size}` : '');
    const span = el.querySelector('.pi-text') || el;
    span.textContent = label;
  });
}

// ───────────────────────────────────────────────────────────────────────────────
// Block label updater for locale switching
// ───────────────────────────────────────────────────────────────────────────────
/**
 * Update block labels to current locale.
 * - Non-editable labels are always replaced with current default.
 * - City labels: keep user-edited labels (b.customLabel === true).
 *   Replace only when the label is empty or still the default in another locale.
 */
export function updateBlockLabelsForLocale(state) {
  if (!state?.blocks) return;

  const defaultTextFor = (kind, size) => {
    if (kind === 'hq') return t('palette.hq');
    if (kind === 'flag') return t('palette.flag');
    if (kind === 'trap') return t('palette.trap');
    if (kind === 'city') return t('palette.city');
    if (kind === 'resource') return t('palette.resource');
    if (kind === 'block') return `${size}×${size}`;
    return '';
    // Add other kinds if necessary
  };

  for (const b of state.blocks) {
    const labelEl = b.el?.querySelector?.('.label');
    if (!labelEl) continue;

    const next = defaultTextFor(b.kind, b.size);

    if (b.kind === 'city') {
      // Preserve user edits
      if (b.customLabel === true) continue;

      const cur = (labelEl.textContent || '').trim();
      if (!cur) {
        labelEl.textContent = next;
        continue;
      }

      // Replace if it looks like a previous default (ko/en)
      const prevDefaults = ['도시', 'Town'];
      if (prevDefaults.includes(cur)) {
        labelEl.textContent = next;
      }
    } else {
      // Always sync non-editable labels to current language
      labelEl.textContent = next;
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Convenience: init helper (optional)
// ───────────────────────────────────────────────────────────────────────────────
/**
 * Optionally call this on boot:
 *   await initI18n(); // detect → load → apply
 */
export async function initI18n() {
  const lang = detectPreferredLang();
  await loadLanguageOnline(lang);
}
