// assets/js/exportPNG.js
import { state, cell } from './state.js';
import { PAINTER_KINDS, cellsForKindAt, areaBoundingBox } from './painter.js';
import { posToCell, keyOf } from './transform.js';
import { rot } from './dom.js';

/** CSS 변수 얻기 */
function cssVar(name, fallback){
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** 블루 합집합(깃발/HQ) 재계산 (export 시 최신 보장) */
function computePaintedSet(){
  const set = new Set();
  for (const b of state.blocks){
    if (!PAINTER_KINDS.has(b.kind)) continue;
    const { cx, cy } = posToCell(b.left, b.top);
    const centerCx = cx + Math.floor(b.size/2);
    const centerCy = cy + Math.floor(b.size/2);
    for (const c of cellsForKindAt(b.kind, centerCx, centerCy)){
      set.add(keyOf(c.x, c.y));
    }
  }
  return set;
}

/** 블록이 덮는 셀 */
function cellsCoveredByBlocks(){
  const out = new Set();
  for (const b of state.blocks){
    const { cx, cy } = posToCell(b.left, b.top);
    for (let y=cy; y<cy+b.size; y++){
      for (let x=cx; x<cx+b.size; x++){
        out.add(keyOf(x,y));
      }
    }
  }
  return out;
}

/** 사용된 셀의 bounding box (minx..maxx, miny..maxy) */
function usedCellsBBox(){
  const used = new Set();

  // 빨간 칠
  for (const k of state.userPaint) used.add(k);

  // 파란 합집합
  const painted = computePaintedSet();
  for (const k of painted) used.add(k);

  // 블록 커버
  const cover = cellsCoveredByBlocks();
  for (const k of cover) used.add(k);

  if (used.size === 0) return null;

  let minx=Infinity, miny=Infinity, maxx=-Infinity, maxy=-Infinity;
  for (const k of used){
    const [x,y] = k.split(',').map(Number);
    if (x<minx) minx=x;
    if (y<miny) miny=y;
    if (x>maxx) maxx=x;
    if (y>maxy) maxy=y;
  }
  return {minx, miny, maxx, maxy, used, painted};
}

/** 집합에 이웃이 없는 방향만 선 긋기 (외곽선만) */
function strokeCellPerimeter(ctx, set, x, y, color, lineWidth=2, dashed=false){
  const has = (xx,yy)=> set.has(`${xx},${yy}`);
  const px = x*cell, py = y*cell;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  if (dashed) ctx.setLineDash([6,6]);

  // top
  if (!has(x, y-1)){ ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px+cell, py); ctx.stroke(); }
  // right
  if (!has(x+1, y)){ ctx.beginPath(); ctx.moveTo(px+cell, py); ctx.lineTo(px+cell, py+cell); ctx.stroke(); }
  // bottom
  if (!has(x, y+1)){ ctx.beginPath(); ctx.moveTo(px, py+cell); ctx.lineTo(px+cell, py+cell); ctx.stroke(); }
  // left
  if (!has(x-1, y)){ ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py+cell); ctx.stroke(); }

  ctx.restore();
}

/** 캔버스에 회전 변환 적용 (x' = x - y + H, y' = x + y) */
function applyRotTransform(ctx, heightPx){
  // 현재 변환에 곱하기(기존 상태 보존)
  ctx.transform(1, 1, -1, 1, heightPx, 0);
}

/** 라벨: 크롭 오프셋 보정 + 수평 텍스트로 출력 */
function drawUprightLabel(ctx, X, Y, heightPx, offX, offY, text){
  // 미회전 좌표 → 회전 캔버스 좌표로 투영 (크롭 보정 포함)
  const xLocal = X - offX;
  const yLocal = Y - offY;
  const xCanvas = xLocal - yLocal + heightPx;
  const yCanvas = xLocal + yLocal;

  // 텍스트는 수평으로
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0); // 변환 제거
  ctx.font = 'bold 14px system-ui, -apple-system, Segoe UI, Roboto, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#333';
  ctx.fillText(text, xCanvas, yCanvas);
  ctx.restore();
}

/** 블록 색상 (유효/경고/리소스) */
function styleForBlock(b, paintedSet){
  if (b.kind === 'resource'){
    return { fill: cssVar('--resource-bg', '#ffe5e5'),
             stroke: cssVar('--resource-border', '#d00000') };
  }
  // 유효성: 모든 셀이 파란 합집합에 포함되어야 함
  const { cx, cy } = posToCell(b.left, b.top);
  let invalid = false;
  for (let y=cy; y<cy+b.size && !invalid; y++){
    for (let x=cx; x<cx+b.size; x++){
      if (!paintedSet.has(`${x},${y}`)){ invalid = true; break; }
    }
  }
  if (invalid){
    return { fill: cssVar('--warn-bg', '#ffe9e9'),
             stroke: cssVar('--warn-border', '#cc1e1e') };
  }
  return { fill: cssVar('--ok-bg', '#fafafa'),
           stroke: cssVar('--ok-border', '#555') };
}

/** 메인: PNG Blob 생성 */
export async function exportPNG(){
  const bbox = usedCellsBBox();
  if (!bbox){
    throw new Error('사용된 모눈이 없습니다. 객체를 배치하거나 칠한 후 내보내세요.');
  }
  const { minx, miny, maxx, maxy, used, painted } = bbox;

  const gridColor = cssVar('--grid-bold', '#d0d0d0');
  const bgColor   = cssVar('--bg', '#ffffff');
  const blueFill  = cssVar('--paint-blue', 'rgba(66,133,244,0.25)');
  const blueEdge  = cssVar('--paint-blue-border', 'rgba(66,133,244,0.9)');
  const redFill   = cssVar('--paint-red', 'rgba(220,20,60,0.35)');

  const widthCells  = maxx - minx + 1;
  const heightCells = maxy - miny + 1;
  const widthPx  = widthCells  * cell;
  const heightPx = heightCells * cell;

  // 회전 후 바운딩은 정사각형 (w+h)
  const canvasSize = widthPx + heightPx;
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const ctx = canvas.getContext('2d');

  // 배경
  ctx.save();
  ctx.fillStyle = bgColor;
  ctx.fillRect(0,0,canvas.width, canvas.height);
  ctx.restore();

  // 회전 변환 적용 (원점 = 잘라낸 영역 좌상단)
  applyRotTransform(ctx, heightPx);

  // 모든 그리기는 "미회전 좌표" 기준, 크롭 보정
  const offX = minx * cell;
  const offY = miny * cell;
  ctx.save();
  ctx.translate(-offX, -offY);

  // 1) 그리드(주 라인만)
  ctx.save();
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  // 세로선
  for (let x=minx*cell; x<=(maxx+1)*cell; x+=cell){
    ctx.beginPath();
    ctx.moveTo(x, miny*cell);
    ctx.lineTo(x, (maxy+1)*cell);
    ctx.stroke();
  }
  // 가로선
  for (let y=miny*cell; y<=(maxy+1)*cell; y+=cell){
    ctx.beginPath();
    ctx.moveTo(minx*cell, y);
    ctx.lineTo((maxx+1)*cell, y);
    ctx.stroke();
  }
  ctx.restore();

  // 2) 빨간 칠 (userPaint)
  ctx.save();
  ctx.fillStyle = redFill;
  for (const k of state.userPaint){
    const [x,y] = k.split(',').map(Number);
    if (x<minx||x>maxx||y<miny||y>maxy) continue;
    ctx.fillRect(x*cell, y*cell, cell, cell);
  }
  ctx.restore();

  // 3) 파란 칠(합집합) + 외곽선만
  ctx.save();
  // 채우기
  ctx.fillStyle = blueFill;
  for (const k of painted){
    const [x,y] = k.split(',').map(Number);
    if (x<minx||x>maxx||y<miny||y>maxy) continue;
    ctx.fillRect(x*cell, y*cell, cell, cell);
  }
  // 외곽선
  for (const k of painted){
    const [x,y] = k.split(',').map(Number);
    if (x<minx||x>maxx||y<miny||y>maxy) continue;
    strokeCellPerimeter(ctx, painted, x, y, blueEdge, 2, /*dashed=*/false);
  }
  ctx.restore();

  // 4) 페인터 영역 점선 사각 (깃발/HQ)
  ctx.save();
  ctx.strokeStyle = blueEdge;
  ctx.setLineDash([6,6]);
  ctx.lineWidth = 2;
  for (const b of state.blocks){
    if (!PAINTER_KINDS.has(b.kind)) continue;
    const { cx, cy } = posToCell(b.left, b.top);
    const centerCx = cx + Math.floor(b.size/2);
    const centerCy = cy + Math.floor(b.size/2);
    const { minx:ax, miny:ay, maxx:bx, maxy:by } = areaBoundingBox(b.kind, centerCx, centerCy);
    const x = ax*cell, y = ay*cell, w = (bx-ax+1)*cell, h=(by-ay+1)*cell;
    ctx.strokeRect(x, y, w, h);
  }
  ctx.restore();

  // 5) 블록(배경/테두리) + 라벨
  for (const b of state.blocks){
    const st = styleForBlock(b, painted);
    const { cx, cy } = posToCell(b.left, b.top);
    const x = cx*cell, y = cy*cell, w = b.size*cell, h=b.size*cell;

    // 사각
    ctx.save();
    ctx.fillStyle = st.fill;
    ctx.strokeStyle = st.stroke;
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();

    // 라벨(수평) — 오프셋 보정 반영
    const labelEl = b.el?.querySelector('.label');
    let text =
      b.kind === 'flag'     ? '연맹깃발' :
      b.kind === 'hq'       ? '평원본부' :
      b.kind === 'city'     ? '도시센터' :
      b.kind === 'resource' ? '연맹자원' :
      b.kind === 'trap'     ? '사냥함정' : `${b.size}×${b.size}`;

    const t2 = (labelEl?.textContent || '').trim();
    if (b.kind === 'city' && t2) text = t2;

    const Xc = x + w/2;
    const Yc = y + h/2;
    drawUprightLabel(ctx, Xc, Yc, heightPx, offX, offY, text);
  }

  // 회전 좌표계 해제
  ctx.restore(); // translate(-offX,-offY) 해제

  // PNG Blob
  return await new Promise((resolve)=> canvas.toBlob(resolve, 'image/png'));
}

