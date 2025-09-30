import { cell } from './state.js';
import { world, rot } from './dom.js';

export function clientToLocalRot(clientX, clientY){
  const worldRect = world.getBoundingClientRect();
  const style = getComputedStyle(rot);
  const m = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform);
  const T = new DOMMatrix().translateSelf(worldRect.left, worldRect.top).multiply(m);
  const inv = T.inverse();
  const p = new DOMPoint(clientX, clientY).matrixTransform(inv);
  return { x: p.x, y: p.y };
}

export function snapLocal(left, top, size){
  let gx = Math.round(left / cell) * cell;
  let gy = Math.round(top  / cell) * cell;
  const maxLeft = world.clientWidth  - size * cell;
  const maxTop  = world.clientHeight - size * cell;
  gx = Math.max(0, Math.min(gx, maxLeft));
  gy = Math.max(0, Math.min(gy, maxTop));
  return { left: gx, top: gy };
}

export function posToCell(left, top){ return { cx: Math.round(left / cell), cy: Math.round(top / cell) }; }

export function pointToCell(px, py){
  let cx = Math.floor(px / cell);
  let cy = Math.floor(py / cell);
  cx = Math.max(0, Math.min(cx, Math.ceil(world.clientWidth/cell)-1));
  cy = Math.max(0, Math.min(cy, Math.ceil(world.clientHeight/cell)-1));
  return {cx, cy};
}

export const keyOf = (x,y)=>`${x},${y}`;

export function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

