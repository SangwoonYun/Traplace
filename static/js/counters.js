// static/js/counters.js
import { state } from './state.js';

let counts = new Map(); // key -> number
const K = (kind, size) => `${kind}:${kind === 'block' ? size : 0}`;

function ensureBadges() {
  document.querySelectorAll('.palette-item').forEach(el => {
    if (!el.querySelector('.pi-count')) {
      const badge = document.createElement('span');
      badge.className = 'pi-count';
      badge.textContent = '0';
      el.appendChild(badge);
    }
  });
}

function computeCountsFromState() {
  const m = new Map();
  for (const b of state.blocks) {
    const key = K(b.kind, b.size);
    m.set(key, (m.get(key) || 0) + 1);
  }
  counts = m;
}

function renderPaletteCounts() {
  ensureBadges();
  document.querySelectorAll('.palette-item').forEach(el => {
    const kind = el.getAttribute('data-kind');
    const size = Number(el.getAttribute('data-size') || 0);
    const key = K(kind, size);
    const n = counts.get(key) || 0;
    const badge = el.querySelector('.pi-count');
    if (!badge) return;
    badge.textContent = String(n);
    // 0일 때 연하게 보이고, >0이면 강조
    badge.classList.toggle('is-zero', n === 0);
  });
}

export function initCounters() {
  ensureBadges();
  updateAllCounts();
}

export function updateAllCounts() {
  computeCountsFromState();
  renderPaletteCounts();
}

export function onCreateBlock(b) {
  const key = K(b.kind, b.size);
  counts.set(key, (counts.get(key) || 0) + 1);
  renderPaletteCounts();
}

export function onDeleteBlock(b) {
  const key = K(b.kind, b.size);
  const v = (counts.get(key) || 0) - 1;
  counts.set(key, Math.max(0, v));
  renderPaletteCounts();
}
