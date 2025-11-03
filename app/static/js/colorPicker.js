// File: app/static/js/colorPainter.js
/**
 * Color Painter (Radio-like Color Picker)
 * - 대상: #colorPicker (버튼 3 + <input type="color"> 1)
 * - 항상 한 개만 선택(라디오처럼)
 * - 키보드: ←/→/Home/End/Space/Enter
 * - 선택 변경 시 #colorPicker에 'colorpicker:change' 이벤트(dispatch) { detail: { color } }
 * - 외부에서 현재 색 사용: getCurrentTintColor()
 */

let CURRENT_TINT_COLOR = '#000000';

function colorOf(el) {
  if (el instanceof HTMLInputElement && el.type === 'color') return el.value || '#000000';
  return el.getAttribute('data-color') || '#000000';
}

function select(root, options, el) {
  options.forEach((opt) => {
    const on = opt === el;
    opt.setAttribute('aria-checked', on ? 'true' : 'false');
    opt.setAttribute('tabindex', on ? '0' : '-1');
    opt.classList.toggle('is-active', on);
  });
  CURRENT_TINT_COLOR = colorOf(el);
  root.dispatchEvent(
    new CustomEvent('colorpicker:change', { detail: { color: CURRENT_TINT_COLOR } }),
  );
  el.focus?.();
}

function nextIdx(options, cur, dir) {
  const i = options.indexOf(cur);
  const n = (i + dir + options.length) % options.length;
  return n;
}

export function setupColorPicker() {
  const root = document.getElementById('colorPicker');
  if (!root) return;

  // radiogroup 보장
  root.setAttribute('role', 'radiogroup');
  if (!root.getAttribute('aria-label')) root.setAttribute('aria-label', 'Painter');

  /** @type {HTMLButtonElement[]} */
  const btns = Array.from(root.querySelectorAll('.swatch[role="radio"]'));
  /** @type {HTMLInputElement|null} */
  const input = root.querySelector('#tintColor');

  if (input) {
    input.setAttribute('role', 'radio'); // 커스텀도 라디오처럼
    if (!input.getAttribute('aria-label')) input.setAttribute('aria-label', 'Custom color');
  }

  /** @type {(HTMLElement | HTMLInputElement)[]} */
  const options = [...btns, ...(input ? [input] : [])];
  if (!options.length) return;

  // 초기 선택: 첫 번째
  options.forEach((el, i) => {
    el.setAttribute('aria-checked', i === 0 ? 'true' : 'false');
    el.setAttribute('tabindex', i === 0 ? '0' : '-1');
    el.classList.toggle('is-active', i === 0);
  });
  CURRENT_TINT_COLOR = colorOf(options[0]);
  // 초기 상태 알림(필요 시 주석 해제)
  // root.dispatchEvent(new CustomEvent('colorpicker:change', { detail: { color: CURRENT_TINT_COLOR } }));

  // 마우스/터치
  btns.forEach((btn) => btn.addEventListener('click', () => select(root, options, btn)));
  if (input) {
    input.addEventListener('click', () => select(root, options, input));
    input.addEventListener('input', () => select(root, options, input));
    input.addEventListener('change', () => select(root, options, input));
  }

  // 키보드 네비게이션
  root.addEventListener('keydown', (e) => {
    const active = /** @type {HTMLElement} */ (
      options.find((o) => o.getAttribute('aria-checked') === 'true') || options[0]
    );
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        select(root, options, options[nextIdx(options, active, +1)]);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        select(root, options, options[nextIdx(options, active, -1)]);
        break;
      case 'Home':
        e.preventDefault();
        select(root, options, options[0]);
        break;
      case 'End':
        e.preventDefault();
        select(root, options, options[options.length - 1]);
        break;
      case ' ':
      case 'Enter':
        e.preventDefault();
        select(root, options, active);
        if (active === input) input?.click(); // 네이티브 피커 열기
        break;
    }
  });
}

export function getCurrentTintColor() {
  return CURRENT_TINT_COLOR;
}
