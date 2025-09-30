import { cell, state, BASE_CELLS_X, BASE_CELLS_Y } from './state.js';
import { viewport, world, rot, tilesLayer, userLayer, outlinesLayer, outlinesPreviewLayer, previewLayer, badge } from './dom.js';
import { PAINTER_KINDS, cellsForKindAt, areaBoundingBox } from './painter.js';
import { posToCell, keyOf, clamp } from './transform.js';

export function setWorldSizeCells(cols, rows){
  const pxW = cols * cell;
  const pxH = rows * cell;

  world.style.width  = pxW + 'px';
  world.style.height = pxH + 'px';

  // ▼ 추가: CSS 변수 갱신 (translate 에 사용됨)
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--world-w', pxW + 'px');
  rootStyle.setProperty('--world-h', pxH + 'px');

  // ...기존 렌더/레이어 리사이즈 로직 유지...
}

export function centerToCell(cx, cy){
  const m = new DOMMatrixReadOnly(getComputedStyle(rot).transform);
  const p = new DOMPoint(cx * cell, cy * cell).matrixTransform(m);
  const targetLeft = clamp(p.x - viewport.clientWidth  / 2, 0, world.scrollWidth  - viewport.clientWidth);
  const targetTop  = clamp(p.y - viewport.clientHeight / 2, 0, world.scrollHeight - viewport.clientHeight);
  viewport.scrollLeft = targetLeft;
  viewport.scrollTop  = targetTop;
}

export function centerToWorldCenter(){
  const cols = Math.round(world.clientWidth  / cell);
  const rows = Math.round(world.clientHeight / cell);

  // 중심 셀 (0-index 기준). 1200×1200이면 599,599
  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2);

  centerToCell(cx, cy);
}


export function renderCells(layer, cellList, opts){
  layer.innerHTML = '';
  const set = new Set(cellList.map(c => keyOf(c.x, c.y)));
  const style = getComputedStyle(document.documentElement);
  const col = style.getPropertyValue('--paint-blue-border').trim() || 'rgba(66,133,244,0.9)';
  const thickness = '2px';
  const dashed = opts?.dashed ? 'dashed' : 'solid';

  for (const c of cellList){
    const t = document.createElement('div');
    t.className = 'tile';
    t.style.left = (c.x * cell) + 'px';
    t.style.top  = (c.y * cell) + 'px';
    t.style.width  = cell + 'px';
    t.style.height = cell + 'px';

    const topMissing    = !set.has(keyOf(c.x,   c.y-1));
    const rightMissing  = !set.has(keyOf(c.x+1, c.y  ));
    const bottomMissing = !set.has(keyOf(c.x,   c.y+1));
    const leftMissing   = !set.has(keyOf(c.x-1, c.y  ));

    t.style.borderTop    = topMissing    ? `${thickness} ${dashed} ${col}` : '0';
    t.style.borderRight  = rightMissing  ? `${thickness} ${dashed} ${col}` : '0';
    t.style.borderBottom = bottomMissing ? `${thickness} ${dashed} ${col}` : '0';
    t.style.borderLeft   = leftMissing   ? `${thickness} ${dashed} ${col}` : '0';

    layer.appendChild(t);
  }
}

export function renderUserTiles(){
  userLayer.innerHTML = '';
  for (const k of state.userPaint){
    const [x,y] = k.split(',').map(Number);
    const d = document.createElement('div');
    d.className = 'tile-red';
    d.style.left = (x * cell) + 'px';
    d.style.top  = (y * cell) + 'px';
    d.style.width  = cell + 'px';
    d.style.height = cell + 'px';
    userLayer.appendChild(d);
  }
}

export function renderOutlines(){
  outlinesLayer.innerHTML = '';
  for (const b of state.blocks){
    if (!PAINTER_KINDS.has(b.kind)) continue;
    const { cx, cy } = posToCell(b.left, b.top);
    const centerCx = cx + Math.floor(b.size/2);
    const centerCy = cy + Math.floor(b.size/2);
    const { minx, miny, maxx, maxy } = areaBoundingBox(b.kind, centerCx, centerCy);

    const el = document.createElement('div');
    el.className = 'area-outline';
    el.style.left = (minx * cell) + 'px';
    el.style.top  = (miny * cell) + 'px';
    el.style.width  = ((maxx - minx + 1) * cell) + 'px';
    el.style.height = ((maxy - miny + 1) * cell) + 'px';
    outlinesLayer.appendChild(el);
  }
}

export function recomputePaint(){
  state.paintedSet = new Set();
  for (const b of state.blocks){
    if (!PAINTER_KINDS.has(b.kind)) continue;
    const { cx, cy } = posToCell(b.left, b.top);
    const centerCx = cx + Math.floor(b.size/2);
    const centerCy = cy + Math.floor(b.size/2);
    for (const c of cellsForKindAt(b.kind, centerCx, centerCy)){
      state.paintedSet.add(keyOf(c.x, c.y));
    }
  }
  const cells = [...state.paintedSet].map(k => {
    const [x,y] = k.split(',').map(Number);
    return {x,y};
  });
  renderCells(tilesLayer, cells, { dashed:false });
  renderOutlines();
  // 블록 유효성은 blocks.validateAllObjects()에서 호출됨 (main/init에서 연결)
}

export function showPreview(kind, snappedLeft, snappedTop, size, show=true){
  outlinesPreviewLayer.innerHTML = '';
  previewLayer.innerHTML = '';
  if (!show) return;

  const { cx, cy } = posToCell(snappedLeft, snappedTop);
  const centerCx = cx + Math.floor(size/2);
  const centerCy = cy + Math.floor(size/2);

  const cells = cellsForKindAt(kind, centerCx, centerCy);
  renderCells(previewLayer, cells, { dashed:true });

  const { minx, miny, maxx, maxy } = areaBoundingBox(kind, centerCx, centerCy);
  const rect = document.createElement('div');
  rect.className = 'area-outline';
  rect.style.left = (minx * cell) + 'px';
  rect.style.top  = (miny * cell) + 'px';
  rect.style.width  = ((maxx - minx + 1) * cell) + 'px';
  rect.style.height = ((maxy - miny + 1) * cell) + 'px';
  outlinesPreviewLayer.appendChild(rect);
}

export function clearPreview(){
  outlinesPreviewLayer.innerHTML = '';
  previewLayer.innerHTML = '';
}

export function updateBadge(){
  if (!badgeText) return;
  const { x, y } = state.cursorCell || { x: 599, y: 599 };
  const zoomPct = Math.round((state.zoom || 1) * 100);
  badgeText.textContent = `x:${x}, y:${y}, ${zoomPct}%`;
}

// 초기 세팅에 사용
export function initialLayout(){
  setWorldSizeCells(BASE_CELLS_X, BASE_CELLS_Y);
  centerToWorldCenter();
  updateBadge();
}

