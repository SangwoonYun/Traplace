// assets/js/actions.js
import { state } from './state.js';
import { tilesLayer, outlinesLayer, outlinesPreviewLayer, previewLayer, userLayer, rot, btnReset, btnCopyURL, btnExportPNG, btnUndo, btnRedo } from './dom.js';
import { recomputePaint, renderUserTiles } from './render.js';
import { validateAllObjects } from './blocks.js';
import { saveToURLImmediate } from './urlState.js';
import { exportPNG } from './exportPNG.js';
import { undo, redo, onHistoryChange, saveCheckpoint } from './history.js';

function isMac(){ return /Mac|iPhone|iPad/.test(navigator.platform); }

function setTitles(){
  const mac = isMac();
  if (btnUndo) btnUndo.title = mac ? '되돌리기 (⌘Z)' : '되돌리기 (Ctrl+Z)';
  if (btnRedo) btnRedo.title = mac ? '다시하기 (⇧⌘Z)' : '다시하기 (Ctrl+Y)';
  if (btnReset) btnReset.title = mac ? '초기화 (⌥⌘R)' : '초기화 (Ctrl+Alt+R)';
  if (btnCopyURL) btnCopyURL.title = mac ? 'URL 복사 (⌥⌘C)' : 'URL 복사 (Ctrl+Alt+C)';
  if (btnExportPNG) btnExportPNG.title = mac ? 'PNG 내보내기 (⌥⌘E)' : 'PNG 내보내기 (Ctrl+Alt+E)';
}

export function setupActions(){
  setTitles();

  // 버튼 활성/비활성 동기화
  onHistoryChange((canUndo, canRedo)=>{
    if (btnUndo) btnUndo.disabled = !canUndo;
    if (btnRedo) btnRedo.disabled = !canRedo;
  });

  // Undo/Redo
  btnUndo?.addEventListener('click', ()=> undo());
  btnRedo?.addEventListener('click', ()=> redo());

  // 초기화
  btnReset?.addEventListener('click', ()=>{
    if (!confirm('정말 초기화할까요? (모든 객체 및 빨간 칠이 삭제됩니다)')) return;
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

  // URL 복사
  btnCopyURL?.addEventListener('click', async ()=>{
    try{
      saveToURLImmediate();
      await navigator.clipboard.writeText(location.href);
      btnCopyURL.textContent = '복사됨!';
      setTimeout(()=> btnCopyURL.textContent = '🔗', 1000);
    }catch(err){
      const ta = document.createElement('textarea');
      ta.value = location.href;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      btnCopyURL.textContent = '복사됨!';
      setTimeout(()=> btnCopyURL.textContent = '🔗', 1000);
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
      alert('PNG 내보내기에 실패했습니다.');
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
