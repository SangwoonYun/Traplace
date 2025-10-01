// static/js/exportPNG.js
import { state, cell } from './state.js';
import { world } from './dom.js';
import { PAINTER_KINDS, cellsForKindAt, areaBoundingBox } from './painter.js';
import { posToCell } from './transform.js';

/* ================= 공통 유틸 ================= */

const k = Math.SQRT1_2; // √2/2

function cssVar(name, fallback){
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** 파란 칠(깃발/HQ) 합집합 계산 (실시간) */
function computePaintedSet(){
  const set = new Set();
  for (const b of state.blocks){
    if (!PAINTER_KINDS.has(b.kind)) continue;
    const { cx, cy } = posToCell(b.left, b.top);
    const centerCx = cx + Math.floor(b.size/2);
    const centerCy = cy + Math.floor(b.size/2);
    for (const c of cellsForKindAt(b.kind, centerCx, centerCy)){
      set.add(`${c.x},${c.y}`);
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
        out.add(`${x},${y}`);
      }
    }
  }
  return out;
}

/** 사용된 셀 bbox(min/max) + 파란셋 반환 */
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

  if (!used.size) return null;

  let minx=Infinity, miny=Infinity, maxx=-Infinity, maxy=-Infinity;
  for (const key of used){
    const [x,y] = key.split(',').map(Number);
    if (x<minx) minx=x;
    if (y<miny) miny=y;
    if (x>maxx) maxx=x;
    if (y>maxy) maxy=y;
  }
  return { minx, miny, maxx, maxy, painted };
}

/** 이웃이 없는 변만 외곽선(파란 영역) */
function strokeCellPerimeter(ctx, set, x, y, color, lineWidth=2, dashed=false){
  const has = (xx,yy)=> set.has(`${xx},${yy}`);
  const px = x*cell, py = y*cell;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  if (dashed) ctx.setLineDash([6,6]);

  if (!has(x, y-1)){ ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px+cell, py); ctx.stroke(); }
  if (!has(x+1, y)){ ctx.beginPath(); ctx.moveTo(px+cell, py); ctx.lineTo(px+cell, py+cell); ctx.stroke(); }
  if (!has(x, y+1)){ ctx.beginPath(); ctx.moveTo(px, py+cell); ctx.lineTo(px+cell, py+cell); ctx.stroke(); }
  if (!has(x-1, y)){ ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py+cell); ctx.stroke(); }

  ctx.restore();
}

/** 블록 스타일(유효/경고/리소스) */
function styleForBlock(b, paintedSet){
  if (b.kind === 'resource'){
    return { fill: cssVar('--resource-bg', '#ffe5e5'),
             stroke: cssVar('--resource-border', '#d00000') };
  }
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

/* ============ 화면과 동일한 변환(줌 제외) =============
 * CSS: transform: translate(W·k, (W+H)·k) rotate(45deg) scale(-1)
 *   rotate(45) = [[ k, -k], [ k,  k]]
 *   scale(-1)  = -I          → 선형부 L = -R = [[-k, +k], [-k, -k]]
 *   평행이동 T = (W·k, (W+H)·k)
 * → 캔버스 setTransform(a,b,c,d,e,f) 에서 a=-k, b=-k, c=+k, d=-k, e/f는 나중에 오프셋 보정
 */
function linearForWorld(){
  return { a: -k, b: -k, c: +k, d: -k };
}

/** (오프셋 보정 전) 월드 변환에 의한 투영 함수 */
function projectRaw(W, H, X, Y){
  const { a,b,c,d } = linearForWorld();
  const e = W * k;
  const f = (W + H) * k;
  return { x: a*X + c*Y + e, y: b*X + d*Y + f };
}

/** 크롭 사각형 4꼭짓점을 투영해 bbox 및 평행이동 보정(shiftX/Y) 계산 */
function computeCanvasBoxAndShift(offX, offY, widthPx, heightPx){
  const W = world.clientWidth;   // px
  const H = world.clientHeight;  // px

  // 크롭 4점 (미회전)
  const P = [
    [offX,             offY],
    [offX + widthPx,   offY],
    [offX,             offY + heightPx],
    [offX + widthPx,   offY + heightPx],
  ];

  // 투영
  const proj = P.map(([x,y]) => projectRaw(W,H,x,y));

  // bbox
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  for (const p of proj){
    if (p.x<minX) minX=p.x;
    if (p.y<minY) minY=p.y;
    if (p.x>maxX) maxX=p.x;
    if (p.y>maxY) maxY=p.y;
  }

  // 살짝 여유(안티앨리어싱 절삭 방지)
  const margin = 1;

  const boxW = Math.ceil(maxX - minX) + margin*2;
  const boxH = Math.ceil(maxY - minY) + margin*2;

  // 최종 평행이동: (minX,minY)가 (margin,margin)에 오도록
  const shiftX = margin - minX;
  const shiftY = margin - minY;

  return { boxW, boxH, shiftX, shiftY, W, H };
}

/** 라벨 수평출력을 위한 투영(shift 포함) */
function projectWithShift(W, H, shiftX, shiftY, X, Y){
  const { a,b,c,d } = linearForWorld();
  const e = W * k + shiftX;
  const f = (W + H) * k + shiftY;
  return { x: a*X + c*Y + e, y: b*X + d*Y + f };
}

/* ================== 메인: PNG Export ================== */

export async function exportPNG(){
  const bbox = usedCellsBBox();
  if (!bbox) throw new Error('사용된 모눈이 없습니다. 객체를 배치하거나 칠한 후 내보내세요.');

  const { minx, miny, maxx, maxy, painted } = bbox;

  const gridColor = cssVar('--grid-bold', '#d0d0d0');
  const bgColor   = cssVar('--bg', '#ffffff');
  const blueFill  = cssVar('--paint-blue', 'rgba(66,133,244,0.25)');
  const blueEdge  = cssVar('--paint-blue-border', 'rgba(66,133,244,0.9)');
  const redFill   = cssVar('--paint-red', 'rgba(220,20,60,0.35)');

  // 크롭 영역(미회전 좌표)
  const offX = minx * cell;
  const offY = miny * cell;
  const widthCells  = maxx - minx + 1;
  const heightCells = maxy - miny + 1;
  const widthPx  = widthCells  * cell;
  const heightPx = heightCells * cell;

  // 캔버스 bbox & 평행이동 산출
  const { boxW, boxH, shiftX, shiftY, W, H } =
    computeCanvasBoxAndShift(offX, offY, widthPx, heightPx);

  // HiDPI 대응
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width  = Math.max(1, Math.floor(boxW * dpr));
  canvas.height = Math.max(1, Math.floor(boxH * dpr));
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // 배경
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, boxW, boxH);

  // 화면과 동일한 선형 변환 + 평행이동(shift 포함) 적용
  const { a,b,c,d } = linearForWorld();
  const e = W * k + shiftX;
  const f = (W + H) * k + shiftY;
  ctx.setTransform(a, b, c, d, e, f);

  /* ===== 1) 그리드(주 라인) ===== */
  ctx.save();
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  for (let x = offX; x <= offX + widthPx + 0.1; x += cell){
    ctx.beginPath(); ctx.moveTo(x, offY); ctx.lineTo(x, offY + heightPx); ctx.stroke();
  }
  for (let y = offY; y <= offY + heightPx + 0.1; y += cell){
    ctx.beginPath(); ctx.moveTo(offX, y); ctx.lineTo(offX + widthPx, y); ctx.stroke();
  }
  ctx.restore();

  /* ===== 2) 빨간 칠 ===== */
  ctx.save();
  ctx.fillStyle = redFill;
  for (const key of state.userPaint){
    const [x,y] = key.split(',').map(Number);
    if (x<minx || x>maxx || y<miny || y>maxy) continue;
    ctx.fillRect(x*cell, y*cell, cell, cell);
  }
  ctx.restore();

  /* ===== 3) 파란 칠 + 외곽선 ===== */
  ctx.save();
  ctx.fillStyle = blueFill;
  for (const key of painted){
    const [x,y] = key.split(',').map(Number);
    if (x<minx || x>maxx || y<miny || y>maxy) continue;
    ctx.fillRect(x*cell, y*cell, cell, cell);
  }
  for (const key of painted){
    const [x,y] = key.split(',').map(Number);
    if (x<minx || x>maxx || y<miny || y>maxy) continue;
    strokeCellPerimeter(ctx, painted, x, y, blueEdge, 2, false);
  }
  ctx.restore();

  /* ===== 4) 페인터 영역 점선(깃발/HQ) ===== */
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
    const x = ax*cell, y = ay*cell, w = (bx-ax+1)*cell, h = (by-ay+1)*cell;

    const inX = !(x+w < offX || x > offX + widthPx);
    const inY = !(y+h < offY || y > offY + heightPx);
    if (inX && inY){ ctx.strokeRect(x, y, w, h); }
  }
  ctx.restore();

  /* ===== 5) 블록 + 라벨(수평) ===== */
  for (const b of state.blocks){
    const st = styleForBlock(b, painted);
    const { cx, cy } = posToCell(b.left, b.top);
    const x = cx*cell, y = cy*cell, w = b.size*cell, h = b.size*cell;

    // 크롭 외부 스킵
    if (x > offX + widthPx || x + w < offX || y > offY + heightPx || y + h < offY) continue;

    // 박스
    ctx.save();
    ctx.fillStyle = st.fill;
    ctx.strokeStyle = st.stroke;
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();

    // 라벨 텍스트
    const labelEl = b.el?.querySelector('.label');
    let text =
      b.kind === 'flag'     ? '연맹깃발' :
      b.kind === 'hq'       ? '평원본부' :
      b.kind === 'city'     ? '도시' :
      b.kind === 'resource' ? '연맹자원' :
      b.kind === 'trap'     ? '사냥함정' : `${b.size}×${b.size}`;
    const t2 = (labelEl?.textContent || '').trim();
    if (b.kind === 'city' && t2) text = t2;

    // 라벨 수평 출력: 투영좌표를 구해 변환 해제 후 찍기
    const Xc = x + w/2;
    const Yc = y + h/2;
    const p = projectWithShift(W, H, shiftX, shiftY, Xc, Yc);

    ctx.save();
    ctx.setTransform(1,0,0,1,0,0); // 수평 텍스트
    ctx.font = 'bold 14px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#333';
    ctx.fillText(text, p.x, p.y);
    ctx.restore();
  }

  // PNG Blob 반환
  return await new Promise((resolve)=> canvas.toBlob(resolve, 'image/png'));
}
