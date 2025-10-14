// assets/js/actions.js
import { state } from './state.js';
import { tilesLayer, outlinesLayer, outlinesPreviewLayer, previewLayer, userLayer, rot, btnReset, btnCopyURL, btnExportPNG, btnUndo, btnRedo } from './dom.js';
import { recomputePaint, renderUserTiles, centerToWorldCenter } from './render.js';
import { validateAllObjects } from './blocks.js';
import { saveToURLImmediate } from './urlState.js';
import { exportPNG } from './exportPNG.js';
import { undo, redo, onHistoryChange, saveCheckpoint } from './history.js';
import { posToCell } from './transform.js';
import { t } from './i18n.js';

function isMac(){ return /Mac|iPhone|iPad/.test(navigator.platform); }

export function setTitles(){
  const mac = isMac();
  const sc = {
    undo : mac ? '⌘Z'        : 'Ctrl+Z',
    redo : mac ? '⇧⌘Z'       : 'Ctrl+Y',
    reset: mac ? '⌥⌘R'       : 'Ctrl+Alt+R',
    copy : mac ? '⌥⌘C'       : 'Ctrl+Alt+C',
    export:mac ? '⌥⌘E'       : 'Ctrl+Alt+E',
    dist : mac ? '⌥⌘D'       : 'Ctrl+Alt+D',
  };
  if (btnUndo)        btnUndo.title        = `${t('ui.toolbar.undo')} (${sc.undo})`;
  if (btnRedo)        btnRedo.title        = `${t('ui.toolbar.redo')} (${sc.redo})`;
  if (btnReset)       btnReset.title       = `${t('ui.toolbar.reset')} (${sc.reset})`;
  if (btnCopyURL)     btnCopyURL.title     = `${t('ui.toolbar.copy')} (${sc.copy})`;
  if (btnExportPNG)   btnExportPNG.title   = `${t('ui.toolbar.export')} (${sc.export})`;
  if (btnCityTrapDist)btnCityTrapDist.title= `${t('ui.toolbar.dist2label')} (${sc.dist})`;
}

/** 블록 중심 좌표(셀 단위, 실수 허용: +0.5) */
function blockCenterInCells(b){
  const { cx, cy } = posToCell(b.left, b.top); // 좌상단 셀
  return { x: cx + b.size/2, y: cy + b.size/2 };
}

function setParenValues(labelEl, valuesStr, fallbackBaseText){
  const cur = (labelEl.textContent || '').trim();
  // 라벨 본문과 기존 괄호 값을 분리 (맨 끝 괄호 한 덩어리만 인식)
  const m = cur.match(/^(.*?)(?:\s*\((.*?)\))?\s*$/);
  let base = (m && m[1]) ? m[1].trim() : '';
  // base가 비어 있다면 기본 라벨(예: '도시')로 대체
  if (!base) base = (fallbackBaseText || '').trim();

  labelEl.textContent = base ? `${base} (${valuesStr})` : `(${valuesStr})`;
}

/** 도시 라벨의 괄호(...) 부분에
 *   모든 사냥함정까지 거리×3.19 → 반올림 정수, ","로 연결하여 채움.
 *   기존 라벨 본문은 유지, 괄호 안 값이 이미 있으면 갱신만.
 */
function applyCityLabelsWithTrapDistance(){
  const cities = state.blocks.filter(b => b.kind === 'city');
  const traps  = state.blocks.filter(b => b.kind === 'trap');

  if (cities.length === 0){
    alert(t('alert.noCities'));
    return;
  }
  if (traps.length === 0){
    alert(t('alert.noCities'));
    return;
  }

  const trapCenters = traps.map(blockCenterInCells);

  for (const city of cities){
    const c = blockCenterInCells(city);
    const values = trapCenters.map(t => {
      const dx = c.x - t.x;
      const dy = c.y - t.y;
      const d  = Math.hypot(dx, dy);
      return Math.round(d * 3.19);
    });
    const valuesStr = values.join(',');

    const labelEl = city.el?.querySelector('.label');
    if (!labelEl) continue;

    const fallbackBase = t('palette.city');
    setParenValues(labelEl, valuesStr, fallbackBase);
  }

  // URL/히스토리 저장
  saveToURLImmediate();
  saveCheckpoint();
}

async function shortenCurrentUrl() {
  saveToURLImmediate();

  const u = new URL(location.href);
  const rel = u.pathname + u.search + u.hash;

  const res = await fetch('/api/shorten', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: rel })
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error('shorten-failed');

  const candidate = data.short_url;
  if (!candidate) throw new Error('shorten-missing');

  const out = candidate.startsWith('http')
    ? candidate
    : new URL(candidate, location.origin).toString();

  return out;
}

export function setupActions(){
  setTitles();

  // 버튼 활성/비활성 동기화
  onHistoryChange((canUndo, canRedo)=>{
    if (btnUndo) btnUndo.disabled = !canUndo;
    if (btnRedo) btnRedo.disabled = !canRedo;
  });

  btnHome?.addEventListener('click', (e)=>{
    e.preventDefault();
    centerToWorldCenter();
  });

  // Undo/Redo
  btnUndo?.addEventListener('click', ()=> undo());
  btnRedo?.addEventListener('click', ()=> redo());

  // 도시 라벨 = 사냥함정 거리
  btnCityTrapDist?.addEventListener('click', ()=>{
    applyCityLabelsWithTrapDistance();
  });

  // 초기화
  btnReset?.addEventListener('click', ()=>{
    if (!confirm(t('alert.resetConfirm'))) return;
    rot.querySelectorAll('.block').forEach(el => el.remove());
    state.blocks = [];
    state.paintedSet.clear();
    state.userPaint.clear();
    tilesLayer.innerHTML = '';
    userLayer.innerHTML = '';
    outlinesLayer.innerHTML = '';
    outlinesPreviewLayer.innerHTML = '';
    previewLayer.innerHTML = '';
    recomputePaint();
    renderUserTiles();
    validateAllObjects();
    saveToURLImmediate();
    saveCheckpoint();  // 히스토리 스냅샷
  });

  // URL 복사 (TTL 7일) — 실패 시 전체 URL 폴백
  btnCopyURL?.addEventListener('click', async ()=>{
    const restoreIcon = () => setTimeout(()=> (btnCopyURL.textContent = '🔗'), 1200);
    try{
      const shortUrl = await shortenCurrentUrl();
      await navigator.clipboard.writeText(shortUrl);
      btnCopyURL.textContent = t('msg.copiedShort');
      restoreIcon();
    }catch(e){
      // 폴백: 전체 URL 복사
      try{
        saveToURLImmediate();
        await navigator.clipboard.writeText(location.href);
        btnCopyURL.textContent = t('msg.copiedFull');
        restoreIcon();
      }catch{
        const ta = document.createElement('textarea');
        ta.value = location.href;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        btnCopyURL.textContent = t('msg.copiedFull');
        restoreIcon();
      }
    }
  });
 
  // PNG 내보내기
  btnExportPNG?.addEventListener('click', async ()=>{
    try{
      const blob = await exportPNG();
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g,'-');
      a.download = `grid-export-${ts}.png`;
      a.href = URL.createObjectURL(blob);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href), 3000);
    }catch(e){
      console.error(e);
      alert(t('alert.exportFail'));
    }
  });

  // 단축키
  window.addEventListener('keydown', (e)=>{
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;

    const k = e.key.toLowerCase();

    // Undo: Cmd/Ctrl+Z
    if (k === 'z' && !e.shiftKey && !e.altKey){
      e.preventDefault(); undo(); return;
    }
    // Redo: Shift+Cmd+Z or Ctrl+Y
    if ((k === 'z' && e.shiftKey) || k === 'y'){
      e.preventDefault(); redo(); return;
    }
    if (k === 'd' && e.altKey){
      e.preventDefault(); btnCityTrapDist?.click(); return; 
    }
    // Reset: Cmd/Ctrl+Alt+R
    if (k === 'r' && e.altKey){
      e.preventDefault(); btnReset?.click(); return;
    }
    // Copy URL: Cmd/Ctrl+Alt+C
    if (k === 'c' && e.altKey){
      e.preventDefault(); btnCopyURL?.click(); return;
    }
    // Export PNG: Cmd/Ctrl+Alt+E
    if (k === 'e' && e.altKey){
      e.preventDefault(); btnExportPNG?.click(); return;
    }
  });
}
