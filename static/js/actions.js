// assets/js/actions.js
import { state } from './state.js';
import { tilesLayer, outlinesLayer, outlinesPreviewLayer, previewLayer, userLayer, rot, btnReset, btnCopyURL, btnExportPNG } from './dom.js';
import { recomputePaint, renderUserTiles } from './render.js';
import { validateAllObjects } from './blocks.js';
import { saveToURLImmediate } from './urlState.js';
import { exportPNG } from './exportPNG.js';

export function setupActions(){
  if (btnReset){
    btnReset.addEventListener('click', ()=>{
      if (!confirm('정말 초기화할까요? (모든 객체 및 빨간 칠이 삭제됩니다)')) return;

      // 모든 블록 제거
      rot.querySelectorAll('.block').forEach(el => el.remove());
      state.blocks = [];

      // 칠/레이어 초기화
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
      alert('초기화 완료!');
    });
  }

  if (btnCopyURL){
    btnCopyURL.addEventListener('click', async ()=>{
      try{
        saveToURLImmediate();
        await navigator.clipboard.writeText(location.href);
        btnCopyURL.textContent = '복사됨!';
        setTimeout(()=> btnCopyURL.textContent = 'URL 복사', 1200);
      }catch(err){
        // clipboard 실패 시 폴백
        const ta = document.createElement('textarea');
        ta.value = location.href;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        btnCopyURL.textContent = '복사됨!';
        setTimeout(()=> btnCopyURL.textContent = 'URL 복사', 1200);
      }
    });
  }

  if (btnExportPNG){
    btnExportPNG.addEventListener('click', async ()=>{
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
  }
}

