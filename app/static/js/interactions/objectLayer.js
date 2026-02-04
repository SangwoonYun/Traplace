// File: app/static/js/interactions/objectLayer.js
/**
 * Object Layer Interactions:
 * - Click to select/deselect object layers
 * - Drag to move object layers
 * - Display and drag control points on edges
 * - Update edge offsets via dragging
 */

import { state, cellPx } from '../state.js';
import { rot, objectLayer, trash, palette } from '../dom.js';
import { clientToLocalRot, snapLocal } from '../transform.js';
import { renderObjectLayer, computePolygonPath } from '../render.js';
import { selectObjectLayer, deleteObjectLayer, findObjectLayer } from '../objectLayer.js';
import { queueSaveToURL } from '../urlState.js';
import { saveCheckpoint } from '../history.js';

/**
 * Check if the pointer is inside the trash zone.
 * @param {number} clientX
 * @param {number} clientY
 * @returns {boolean}
 */
function inTrashZone(clientX, clientY) {
  if (!trash) return false;
  const r = trash.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

/**
 * Check if the pointer is inside the palette area.
 * @param {number} clientX
 * @param {number} clientY
 * @returns {boolean}
 */
function inPaletteZone(clientX, clientY) {
  if (!palette) return false;
  const r = palette.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

/** @type {HTMLElement[]} */
let controlPoints = [];

/** Flag to prevent tile toggle during control point drag */
let isDraggingControlPoint = false;

/** Flag to prevent tile toggle during object drag */
let isDraggingObject = false;

/** Timestamp of last drag end to prevent click event immediately after drag */
let lastDragEndTime = 0;

/** Flag to track if actual movement occurred during drag */
let didMove = false;

/** Currently active label editor element */
let activeLabelEditor = null;

/**
 * Check if currently dragging object layer elements or editing a label.
 * Used by tileToggle to prevent red tile painting.
 * @returns {boolean}
 */
export function isObjectLayerDragging() {
  return isDraggingControlPoint || isDraggingObject || activeLabelEditor !== null;
}

/**
 * Check if a drag operation just ended (within 50ms).
 * Used to prevent click events that fire immediately after drag.
 * @returns {boolean}
 */
function wasDraggingRecently() {
  return Date.now() - lastDragEndTime < 50;
}

/**
 * Get the side offset for an extension cell.
 * @param {import('../state.js').ObjectLayerItem} obj
 * @param {string} mainEdge - 'top', 'right', 'bottom', 'left'
 * @param {number} cellIndex - Cell index on the main edge
 * @param {number} extIndex - Extension row index (0 = closest to base)
 * @param {'neg'|'pos'} side - 'neg' for left/top wall, 'pos' for right/bottom wall
 * @returns {number}
 */
function getExtSideOffset(obj, mainEdge, cellIndex, extIndex, side) {
  const key = `${mainEdge}ExtSides`;
  return obj[key]?.[cellIndex]?.[side]?.[extIndex] || 0;
}

/**
 * Set the side offset for an extension cell, creating the structure if needed.
 * @param {import('../state.js').ObjectLayerItem} obj
 * @param {string} mainEdge - 'top', 'right', 'bottom', 'left'
 * @param {number} cellIndex
 * @param {number} extIndex
 * @param {'neg'|'pos'} side
 * @param {number} value
 */
function setExtSideOffset(obj, mainEdge, cellIndex, extIndex, side, value) {
  const key = `${mainEdge}ExtSides`;
  if (!obj[key]) obj[key] = {};
  if (!obj[key][cellIndex]) obj[key][cellIndex] = { neg: [], pos: [] };
  const arr = obj[key][cellIndex][side];
  while (arr.length <= extIndex) arr.push(0);
  arr[extIndex] = value;
}

/**
 * Get the position for a control point on the actual extended/contracted edge.
 * The control point should be at the center of the extended cell's outer edge.
 * @param {import('../state.js').ObjectLayerItem} obj
 * @param {'top'|'right'|'bottom'|'left'} edge
 * @param {number} index
 * @param {number} cpx - cell size in pixels
 * @returns {{x: number, y: number}}
 */
function getControlPointPosition(obj, edge, index, cpx) {
  const offset = obj[`${edge}Edge`][index] || 0;

  switch (edge) {
    case 'top': {
      // Control point is at the center of the cell's top edge (which may be extended upward)
      const x = obj.left + index * cpx + cpx / 2;
      const y = obj.top - offset * cpx;
      return { x, y };
    }
    case 'right': {
      // Control point is at the center of the cell's right edge (which may be extended rightward)
      const x = obj.left + obj.baseWidth * cpx + offset * cpx;
      const y = obj.top + index * cpx + cpx / 2;
      return { x, y };
    }
    case 'bottom': {
      // Control point is at the center of the cell's bottom edge (which may be extended downward)
      const x = obj.left + index * cpx + cpx / 2;
      const y = obj.top + obj.baseHeight * cpx + offset * cpx;
      return { x, y };
    }
    case 'left': {
      // Control point is at the center of the cell's left edge (which may be extended leftward)
      const x = obj.left - offset * cpx;
      const y = obj.top + index * cpx + cpx / 2;
      return { x, y };
    }
    default:
      return { x: 0, y: 0 };
  }
}

/**
 * Create a control point element for a specific edge cell.
 * @param {import('../state.js').ObjectLayerItem} obj
 * @param {'top'|'right'|'bottom'|'left'} edge
 * @param {number} index
 * @returns {HTMLElement}
 */
function createControlPoint(obj, edge, index) {
  const cpx = cellPx();
  const pos = getControlPointPosition(obj, edge, index, cpx);

  const point = document.createElement('div');
  point.className = 'object-control-point';
  point.style.left = `${pos.x}px`;
  point.style.top = `${pos.y}px`;
  point.dataset.edge = edge;
  point.dataset.index = String(index);
  point.dataset.objectId = obj.id;

  setupControlPointDrag(point, obj, edge, index);

  return point;
}

/**
 * Get the position for a step control point (between two cells with different offsets).
 * @param {import('../state.js').ObjectLayerItem} obj
 * @param {'top-step'|'bottom-step'|'left-step'|'right-step'} stepType
 * @param {number} index - Index of the first cell (step is between index and index+1)
 * @param {number} cpx
 * @returns {{x: number, y: number}}
 */
function getStepControlPointPosition(obj, stepType, index, cpx) {
  const get = (arr, i) => arr[i] || 0;

  switch (stepType) {
    case 'top-step': {
      // Vertical step between top cells index and index+1
      const currOff = get(obj.topEdge, index);
      const nextOff = get(obj.topEdge, index + 1);
      const x = obj.left + (index + 1) * cpx;
      // Position at the midpoint of the step
      const y1 = obj.top - currOff * cpx;
      const y2 = obj.top - nextOff * cpx;
      return { x, y: (y1 + y2) / 2 };
    }
    case 'bottom-step': {
      // Vertical step between bottom cells index and index+1
      const currOff = get(obj.bottomEdge, index);
      const nextOff = get(obj.bottomEdge, index + 1);
      const x = obj.left + (index + 1) * cpx;
      const bottomY = obj.top + obj.baseHeight * cpx;
      const y1 = bottomY + currOff * cpx;
      const y2 = bottomY + nextOff * cpx;
      return { x, y: (y1 + y2) / 2 };
    }
    case 'right-step': {
      // Horizontal step between right cells index and index+1
      const currOff = get(obj.rightEdge, index);
      const nextOff = get(obj.rightEdge, index + 1);
      const rightX = obj.left + obj.baseWidth * cpx;
      const x1 = rightX + currOff * cpx;
      const x2 = rightX + nextOff * cpx;
      const y = obj.top + (index + 1) * cpx;
      return { x: (x1 + x2) / 2, y };
    }
    case 'left-step': {
      // Horizontal step between left cells index and index+1
      const currOff = get(obj.leftEdge, index);
      const nextOff = get(obj.leftEdge, index + 1);
      const x1 = obj.left - currOff * cpx;
      const x2 = obj.left - nextOff * cpx;
      const y = obj.top + (index + 1) * cpx;
      return { x: (x1 + x2) / 2, y };
    }
    default:
      return { x: 0, y: 0 };
  }
}

/**
 * Create a step control point element for the edge between two adjacent cells.
 * @param {import('../state.js').ObjectLayerItem} obj
 * @param {'top-step'|'bottom-step'|'left-step'|'right-step'} stepType
 * @param {number} index
 * @param {number} cpx
 * @returns {HTMLElement}
 */
function createStepControlPoint(obj, stepType, index, cpx) {
  const pos = getStepControlPointPosition(obj, stepType, index, cpx);

  const point = document.createElement('div');
  point.className = 'object-control-point object-control-point-step';
  point.style.left = `${pos.x}px`;
  point.style.top = `${pos.y}px`;
  point.dataset.stepType = stepType;
  point.dataset.index = String(index);
  point.dataset.objectId = obj.id;

  setupStepControlPointDrag(point, obj, stepType, index);

  return point;
}

/**
 * Setup drag behavior for a step control point.
 * Dragging adjusts both adjacent cells' offsets to "move" the step.
 * @param {HTMLElement} point
 * @param {import('../state.js').ObjectLayerItem} obj
 * @param {'top-step'|'bottom-step'|'left-step'|'right-step'} stepType
 * @param {number} index
 */
function setupStepControlPointDrag(point, obj, stepType, index) {
  point.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();

    isDraggingControlPoint = true;
    didMove = false;

    const cpx = cellPx();
    const edgeName = stepType.replace('-step', '');
    const edgeArray = obj[`${edgeName}Edge`];
    const startOffset1 = edgeArray[index] || 0;
    const startOffset2 = edgeArray[index + 1] || 0;
    const startLocal = clientToLocalRot(e.clientX, e.clientY);

    point.setPointerCapture(e.pointerId);

    const onMove = (moveEvent) => {
      const currentLocal = clientToLocalRot(moveEvent.clientX, moveEvent.clientY);
      console.log('dragging step control point', stepType, index);

      // Determine which direction this step can move
      // For top/bottom steps: horizontal movement changes which cell is extended
      // For left/right steps: vertical movement changes which cell is extended
      let delta;
      if (stepType === 'top-step' || stepType === 'bottom-step') {
        // Horizontal drag: adjust the step position (move cells between left/right)
        delta = Math.round((currentLocal.x - startLocal.x) / cpx);
      } else {
        // Vertical drag: adjust the step position (move cells between up/down)
        delta = Math.round((currentLocal.y - startLocal.y) / cpx);
      }

      if (delta !== 0) {
        didMove = true;
        // The step moves by changing which cells have which offset
        // If dragging right/down: the higher offset cell "grows"
        // If dragging left/up: the lower offset cell "grows"

        // For simplicity, we'll adjust the offsets to move the step
        // This is complex - for now, let's just equalize or swap offsets
        if (delta > 0) {
          // Move step right/down: extend the right/lower cell
          edgeArray[index] = startOffset2;
        } else if (delta < 0) {
          // Move step left/up: extend the left/upper cell
          edgeArray[index + 1] = startOffset1;
        }
      }

      // Update position
      const pos = getStepControlPointPosition(obj, stepType, index, cpx);
      point.style.left = `${pos.x}px`;
      point.style.top = `${pos.y}px`;

      // Update path
      const pathEl = objectLayer.querySelector(`path[data-id="${obj.id}"]`);
      if (pathEl) {
        pathEl.setAttribute('d', computePolygonPath(obj, cpx));
      }
    };

    const onUp = () => {
      isDraggingControlPoint = false;
      if (didMove) {
        lastDragEndTime = Date.now();
      }
      point.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      renderObjectLayer();
      refreshControlPoints();

      if (didMove) {
        queueSaveToURL();
        saveCheckpoint();
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

/**
 * Setup drag behavior for a control point.
 * @param {HTMLElement} point
 * @param {import('../state.js').ObjectLayerItem} obj
 * @param {'top'|'right'|'bottom'|'left'} edge
 * @param {number} index
 */
function setupControlPointDrag(point, obj, edge, index) {
  point.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();

    isDraggingControlPoint = true;
    didMove = false;

    const cpx = cellPx();
    const startOffset = obj[`${edge}Edge`][index] || 0;
    const startLocal = clientToLocalRot(e.clientX, e.clientY);

    // Capture pointer for smooth dragging
    point.setPointerCapture(e.pointerId);

    const onMove = (moveEvent) => {
      const currentLocal = clientToLocalRot(moveEvent.clientX, moveEvent.clientY);
      console.log('dragging control point', edge, index);

      // Calculate delta in cell units based on edge direction
      let delta;
      switch (edge) {
        case 'top':
          // Top edge: moving up (negative Y) increases offset
          delta = -Math.round((currentLocal.y - startLocal.y) / cpx);
          break;
        case 'bottom':
          // Bottom edge: moving down (positive Y) increases offset
          delta = Math.round((currentLocal.y - startLocal.y) / cpx);
          break;
        case 'left':
          // Left edge: moving left (negative X) increases offset
          delta = -Math.round((currentLocal.x - startLocal.x) / cpx);
          break;
        case 'right':
          // Right edge: moving right (positive X) increases offset
          delta = Math.round((currentLocal.x - startLocal.x) / cpx);
          break;
        default:
          delta = 0;
      }

      // Clamp to reasonable range (-10 to +10 cells)
      const newOffset = Math.max(-10, Math.min(10, startOffset + delta));
      if (newOffset !== startOffset) {
        didMove = true;
      }
      obj[`${edge}Edge`][index] = newOffset;

      // Truncate ExtSides arrays if the main edge offset was reduced
      const extKey = `${edge}ExtSides`;
      if (obj[extKey]?.[index]) {
        const entry = obj[extKey][index];
        const absOff = Math.max(0, newOffset);
        if (entry.neg) entry.neg.length = Math.min(entry.neg.length, absOff);
        if (entry.pos) entry.pos.length = Math.min(entry.pos.length, absOff);
        // Clean up empty entries
        if (!entry.neg.length && !entry.pos.length) {
          delete obj[extKey][index];
        }
      }

      // Update control point position
      const pos = getControlPointPosition(obj, edge, index, cpx);
      point.style.left = `${pos.x}px`;
      point.style.top = `${pos.y}px`;

      // Update only the path's d attribute instead of full re-render
      const pathEl = objectLayer.querySelector(`path[data-id="${obj.id}"]`);
      if (pathEl) {
        pathEl.setAttribute('d', computePolygonPath(obj, cpx));
      }
    };

    const onUp = () => {
      isDraggingControlPoint = false;
      if (didMove) {
        lastDragEndTime = Date.now();
      }
      point.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      // Full re-render on completion
      renderObjectLayer();

      // Refresh control points to show/hide step points based on new offsets
      refreshControlPoints();

      // Save state only if moved
      if (didMove) {
        queueSaveToURL();
        saveCheckpoint();
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

/**
 * Clear all control points from the DOM.
 */
function clearControlPoints() {
  for (const point of controlPoints) {
    point.remove();
  }
  controlPoints = [];
}

/**
 * Get the position for an extension/contraction side control point.
 * These are on the side walls of extended or contracted cells.
 * @param {import('../state.js').ObjectLayerItem} obj
 * @param {'top-left'|'top-right'|'bottom-left'|'bottom-right'|'left-top'|'left-bottom'|'right-top'|'right-bottom'} sideType
 * @param {number} cellIndex - Which cell on the main edge
 * @param {number} extIndex - Which cell of the extension/contraction (0 = closest to base)
 * @param {number} cpx
 * @param {boolean} [contracted=false] - If true, the point is inside the base (contraction)
 * @returns {{x: number, y: number}}
 */
function getExtensionSidePosition(obj, sideType, cellIndex, extIndex, cpx, contracted = false) {
  const mainEdge = sideType.split('-')[0];
  const wallDir = sideType.split('-')[1];
  const side = wallDir === 'left' || wallDir === 'top' ? 'neg' : 'pos';
  const sideOff = contracted ? 0 : getExtSideOffset(obj, mainEdge, cellIndex, extIndex, side);

  if (!contracted) {
    // Extension (outward from base) — position accounts for side offset
    switch (sideType) {
      case 'top-left': {
        const x = obj.left + cellIndex * cpx - sideOff * cpx;
        const y = obj.top - (extIndex + 0.5) * cpx;
        return { x, y };
      }
      case 'top-right': {
        const x = obj.left + (cellIndex + 1) * cpx + sideOff * cpx;
        const y = obj.top - (extIndex + 0.5) * cpx;
        return { x, y };
      }
      case 'bottom-left': {
        const x = obj.left + cellIndex * cpx - sideOff * cpx;
        const y = obj.top + obj.baseHeight * cpx + (extIndex + 0.5) * cpx;
        return { x, y };
      }
      case 'bottom-right': {
        const x = obj.left + (cellIndex + 1) * cpx + sideOff * cpx;
        const y = obj.top + obj.baseHeight * cpx + (extIndex + 0.5) * cpx;
        return { x, y };
      }
      case 'left-top': {
        const x = obj.left - (extIndex + 0.5) * cpx;
        const y = obj.top + cellIndex * cpx - sideOff * cpx;
        return { x, y };
      }
      case 'left-bottom': {
        const x = obj.left - (extIndex + 0.5) * cpx;
        const y = obj.top + (cellIndex + 1) * cpx + sideOff * cpx;
        return { x, y };
      }
      case 'right-top': {
        const x = obj.left + obj.baseWidth * cpx + (extIndex + 0.5) * cpx;
        const y = obj.top + cellIndex * cpx - sideOff * cpx;
        return { x, y };
      }
      case 'right-bottom': {
        const x = obj.left + obj.baseWidth * cpx + (extIndex + 0.5) * cpx;
        const y = obj.top + (cellIndex + 1) * cpx + sideOff * cpx;
        return { x, y };
      }
      default:
        return { x: 0, y: 0 };
    }
  } else {
    // Contraction (inward into base)
    switch (sideType) {
      case 'top-left': {
        const x = obj.left + cellIndex * cpx;
        const y = obj.top + (extIndex + 0.5) * cpx;
        return { x, y };
      }
      case 'top-right': {
        const x = obj.left + (cellIndex + 1) * cpx;
        const y = obj.top + (extIndex + 0.5) * cpx;
        return { x, y };
      }
      case 'bottom-left': {
        const x = obj.left + cellIndex * cpx;
        const y = obj.top + obj.baseHeight * cpx - (extIndex + 0.5) * cpx;
        return { x, y };
      }
      case 'bottom-right': {
        const x = obj.left + (cellIndex + 1) * cpx;
        const y = obj.top + obj.baseHeight * cpx - (extIndex + 0.5) * cpx;
        return { x, y };
      }
      case 'left-top': {
        const x = obj.left + (extIndex + 0.5) * cpx;
        const y = obj.top + cellIndex * cpx;
        return { x, y };
      }
      case 'left-bottom': {
        const x = obj.left + (extIndex + 0.5) * cpx;
        const y = obj.top + (cellIndex + 1) * cpx;
        return { x, y };
      }
      case 'right-top': {
        const x = obj.left + obj.baseWidth * cpx - (extIndex + 0.5) * cpx;
        const y = obj.top + cellIndex * cpx;
        return { x, y };
      }
      case 'right-bottom': {
        const x = obj.left + obj.baseWidth * cpx - (extIndex + 0.5) * cpx;
        const y = obj.top + (cellIndex + 1) * cpx;
        return { x, y };
      }
      default:
        return { x: 0, y: 0 };
    }
  }
}

/**
 * Create an extension/contraction side control point.
 * @param {import('../state.js').ObjectLayerItem} obj
 * @param {'top-left'|'top-right'|'bottom-left'|'bottom-right'|'left-top'|'left-bottom'|'right-top'|'right-bottom'} sideType
 * @param {number} cellIndex
 * @param {number} extIndex
 * @param {number} cpx
 * @param {boolean} [contracted=false]
 * @returns {HTMLElement}
 */
function createExtensionSidePoint(obj, sideType, cellIndex, extIndex, cpx, contracted = false) {
  const pos = getExtensionSidePosition(obj, sideType, cellIndex, extIndex, cpx, contracted);

  const point = document.createElement('div');
  point.className = 'object-control-point object-control-point-ext';
  point.style.left = `${pos.x}px`;
  point.style.top = `${pos.y}px`;
  point.dataset.sideType = sideType;
  point.dataset.cellIndex = String(cellIndex);
  point.dataset.extIndex = String(extIndex);
  point.dataset.objectId = obj.id;

  // Dragging a side point extends/contracts that wall outward by modifying
  // the ExtSides data for this extension cell.
  // e.g. 'top-left'(cellIndex=i, extIndex=j) → drag left/right,
  //   modifies topExtSides[i].neg[j]
  // e.g. 'top-right'(cellIndex=i, extIndex=j) → drag left/right,
  //   modifies topExtSides[i].pos[j]
  if (contracted) {
    // Contraction side points: control the same cell's main edge (unchanged)
    const mainEdge = sideType.split('-')[0];
    setupSidePointDrag(point, obj, mainEdge, cellIndex, mainEdge);
  } else {
    setupExtSideDrag(point, obj, sideType, cellIndex, extIndex);
  }

  return point;
}

/**
 * Setup drag behavior for a side control point.
 * Modifies the main edge's offset, but the drag direction follows the side wall.
 * e.g. 'top-left' side point: modifies topEdge, but drags along the left direction (X axis).
 * @param {HTMLElement} point
 * @param {import('../state.js').ObjectLayerItem} obj
 * @param {'top'|'right'|'bottom'|'left'} edge - Which edge array to modify
 * @param {number} index - Cell index on that edge
 * @param {'top'|'right'|'bottom'|'left'} dragDir - Drag direction (matches the side wall)
 */
function setupSidePointDrag(point, obj, edge, index, dragDir) {
  point.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();

    isDraggingControlPoint = true;
    didMove = false;

    const cpx = cellPx();
    const startOffset = obj[`${edge}Edge`][index] || 0;
    const startLocal = clientToLocalRot(e.clientX, e.clientY);

    point.setPointerCapture(e.pointerId);

    const onMove = (moveEvent) => {
      const currentLocal = clientToLocalRot(moveEvent.clientX, moveEvent.clientY);

      // Delta is calculated based on the side wall direction, not the main edge
      let delta;
      switch (dragDir) {
        case 'top':
          delta = -Math.round((currentLocal.y - startLocal.y) / cpx);
          break;
        case 'bottom':
          delta = Math.round((currentLocal.y - startLocal.y) / cpx);
          break;
        case 'left':
          delta = -Math.round((currentLocal.x - startLocal.x) / cpx);
          break;
        case 'right':
          delta = Math.round((currentLocal.x - startLocal.x) / cpx);
          break;
        default:
          delta = 0;
      }

      const newOffset = Math.max(-10, Math.min(10, startOffset + delta));
      if (newOffset !== startOffset) {
        didMove = true;
      }
      obj[`${edge}Edge`][index] = newOffset;

      // Update path shape
      const pathEl = objectLayer.querySelector(`path[data-id="${obj.id}"]`);
      if (pathEl) {
        pathEl.setAttribute('d', computePolygonPath(obj, cpx));
      }
    };

    const onUp = () => {
      isDraggingControlPoint = false;
      if (didMove) {
        lastDragEndTime = Date.now();
      }
      point.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      renderObjectLayer();
      refreshControlPoints();

      if (didMove) {
        queueSaveToURL();
        saveCheckpoint();
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

/**
 * Setup drag behavior for an extension side control point.
 * Dragging modifies the ExtSides data (secondary side offset).
 * @param {HTMLElement} point
 * @param {import('../state.js').ObjectLayerItem} obj
 * @param {string} sideType - e.g. 'top-left', 'right-bottom'
 * @param {number} cellIndex - Cell index on the main edge
 * @param {number} extIndex - Extension row index
 */
function setupExtSideDrag(point, obj, sideType, cellIndex, extIndex) {
  point.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();

    isDraggingControlPoint = true;
    didMove = false;

    const cpx = cellPx();
    const mainEdge = sideType.split('-')[0];
    const wallDir = sideType.split('-')[1];
    const side = wallDir === 'left' || wallDir === 'top' ? 'neg' : 'pos';
    const startOffset = getExtSideOffset(obj, mainEdge, cellIndex, extIndex, side);
    const startLocal = clientToLocalRot(e.clientX, e.clientY);

    point.setPointerCapture(e.pointerId);

    const onMove = (moveEvent) => {
      const currentLocal = clientToLocalRot(moveEvent.clientX, moveEvent.clientY);

      // Delta follows the wall direction (perpendicular to the main edge)
      let delta;
      switch (wallDir) {
        case 'left':
          delta = -Math.round((currentLocal.x - startLocal.x) / cpx);
          break;
        case 'right':
          delta = Math.round((currentLocal.x - startLocal.x) / cpx);
          break;
        case 'top':
          delta = -Math.round((currentLocal.y - startLocal.y) / cpx);
          break;
        case 'bottom':
          delta = Math.round((currentLocal.y - startLocal.y) / cpx);
          break;
        default:
          delta = 0;
      }

      const newOffset = Math.max(0, Math.min(10, startOffset + delta));
      if (newOffset !== startOffset) {
        didMove = true;
      }
      setExtSideOffset(obj, mainEdge, cellIndex, extIndex, side, newOffset);

      // Update control point position
      const pos = getExtensionSidePosition(obj, sideType, cellIndex, extIndex, cpx, false);
      point.style.left = `${pos.x}px`;
      point.style.top = `${pos.y}px`;

      // Update path shape
      const pathEl = objectLayer.querySelector(`path[data-id="${obj.id}"]`);
      if (pathEl) {
        pathEl.setAttribute('d', computePolygonPath(obj, cpx));
      }
    };

    const onUp = () => {
      isDraggingControlPoint = false;
      if (didMove) {
        lastDragEndTime = Date.now();
      }
      point.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      renderObjectLayer();
      refreshControlPoints();

      if (didMove) {
        queueSaveToURL();
        saveCheckpoint();
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

/**
 * Create control points for all edges of an object, including step edges
 * and extension side edges.
 * @param {import('../state.js').ObjectLayerItem} obj
 */
function createControlPoints(obj) {
  clearControlPoints();

  const cpx = cellPx();

  // Helper to get offset safely
  const get = (arr, i) => arr[i] || 0;

  // 1. Main edge control points (on the outer boundary of each cell)
  const edges = [
    { name: 'top', length: obj.baseWidth },
    { name: 'right', length: obj.baseHeight },
    { name: 'bottom', length: obj.baseWidth },
    { name: 'left', length: obj.baseHeight },
  ];

  for (const edge of edges) {
    for (let i = 0; i < edge.length; i++) {
      const point = createControlPoint(obj, edge.name, i);
      rot.appendChild(point);
      controlPoints.push(point);
    }
  }

  // 2. Extension/contraction side control points
  // For extended cells (offset > 0): points on the outward side walls
  // For contracted cells (offset < 0): points on the inward side walls (the "dent")

  /**
   * Helper to add side control points for one edge direction.
   * @param {number[]} edgeArr - The edge offset array
   * @param {number} length - Number of cells on this edge
   * @param {string} sideA - sideType for the "prev" side (left or top)
   * @param {string} sideB - sideType for the "next" side (right or bottom)
   */
  function addSidePoints(edgeArr, length, sideA, sideB) {
    for (let i = 0; i < length; i++) {
      const offset = get(edgeArr, i);
      const prevOff = i > 0 ? get(edgeArr, i - 1) : 0;
      const nextOff = i < length - 1 ? get(edgeArr, i + 1) : 0;

      if (offset > 0) {
        // Extension: outward side walls
        for (let ext = 0; ext < offset; ext++) {
          if (ext >= Math.max(0, prevOff)) {
            const pt = createExtensionSidePoint(obj, sideA, i, ext, cpx, false);
            rot.appendChild(pt);
            controlPoints.push(pt);
          }
        }
        for (let ext = 0; ext < offset; ext++) {
          if (ext >= Math.max(0, nextOff)) {
            const pt = createExtensionSidePoint(obj, sideB, i, ext, cpx, false);
            rot.appendChild(pt);
            controlPoints.push(pt);
          }
        }
      } else if (offset < 0) {
        // Contraction: inward side walls (the dent)
        const absOff = -offset;
        const absPrev = prevOff < 0 ? -prevOff : 0;
        const absNext = nextOff < 0 ? -nextOff : 0;

        for (let ext = 0; ext < absOff; ext++) {
          if (ext >= absPrev) {
            const pt = createExtensionSidePoint(obj, sideA, i, ext, cpx, true);
            rot.appendChild(pt);
            controlPoints.push(pt);
          }
        }
        for (let ext = 0; ext < absOff; ext++) {
          if (ext >= absNext) {
            const pt = createExtensionSidePoint(obj, sideB, i, ext, cpx, true);
            rot.appendChild(pt);
            controlPoints.push(pt);
          }
        }
      }
    }
  }

  addSidePoints(obj.topEdge, obj.baseWidth, 'top-left', 'top-right');
  addSidePoints(obj.bottomEdge, obj.baseWidth, 'bottom-left', 'bottom-right');
  addSidePoints(obj.leftEdge, obj.baseHeight, 'left-top', 'left-bottom');
  addSidePoints(obj.rightEdge, obj.baseHeight, 'right-top', 'right-bottom');
}

/**
 * Select an object layer and show its control points.
 * @param {string} id
 */
export function selectObject(id) {
  selectObjectLayer(id);
  const obj = findObjectLayer(id);
  if (obj) {
    createControlPoints(obj);
  }
}

/**
 * Deselect any selected object layer and hide control points.
 */
export function deselectObject() {
  selectObjectLayer(null);
  clearControlPoints();
}

/**
 * Delete the currently selected object layer.
 */
export function deleteSelectedObject() {
  if (state.selectedObjectId) {
    deleteObjectLayer(state.selectedObjectId);
    clearControlPoints();
  }
}

/**
 * Refresh control points for the currently selected object.
 * Call this after edge offsets change or after undo/redo.
 */
export function refreshControlPoints() {
  if (!state.selectedObjectId) {
    clearControlPoints();
    return;
  }

  const obj = findObjectLayer(state.selectedObjectId);
  if (obj) {
    createControlPoints(obj);
  } else {
    clearControlPoints();
  }
}

/** Track last click time and object for double-click detection */
let lastClickTime = 0;
let lastClickedId = null;

/**
 * Setup click handlers for object layer selection.
 */
export function setupObjectLayerInteraction() {
  if (!objectLayer) return;

  // Use event delegation for SVG paths - handle drag and selection
  objectLayer.addEventListener('pointerdown', (e) => {
    const originalPath = e.target.closest('path, text');
    if (originalPath && e.button === 0) {
      const id = originalPath.dataset.id;
      const obj = findObjectLayer(id);
      if (obj) {
        const now = Date.now();
        const isDoubleClick = lastClickedId === id && now - lastClickTime < 400;

        // Update click tracking
        lastClickTime = now;
        lastClickedId = id;

        // If double-click on already selected object, show label editor
        if (isDoubleClick && state.selectedObjectId === id) {
          e.stopPropagation();
          e.preventDefault();
          showLabelEditor(obj, e.clientX, e.clientY);
          return;
        }

        // Select the object (this re-renders and replaces the path element)
        selectObject(id);

        e.stopPropagation();
        e.preventDefault();

        // Get the new path element after re-render
        const path = objectLayer.querySelector(`path[data-id="${id}"]`);
        if (!path) return;

        isDraggingObject = true;
        didMove = false;

        const local = clientToLocalRot(e.clientX, e.clientY);
        const startX = local.x;
        const startY = local.y;
        const startLeft = obj.left;
        const startTop = obj.top;

        path.setPointerCapture(e.pointerId);
        path.style.cursor = 'grabbing';

        const onMove = (moveEvent) => {
          // Check if over trash/palette zone and highlight
          const overTrash = inTrashZone(moveEvent.clientX, moveEvent.clientY);
          const overPalette = inPaletteZone(moveEvent.clientX, moveEvent.clientY);
          trash?.classList.toggle('active', overTrash || overPalette);

          const currentLocal = clientToLocalRot(moveEvent.clientX, moveEvent.clientY);
          const dx = currentLocal.x - startX;
          const dy = currentLocal.y - startY;

          const newLeft = startLeft + dx;
          const newTop = startTop + dy;
          const size = Math.max(obj.baseWidth, obj.baseHeight);
          const snapped = snapLocal(newLeft, newTop, size);

          if (obj.left !== snapped.left || obj.top !== snapped.top) {
            didMove = true;
          }
          obj.left = snapped.left;
          obj.top = snapped.top;

          // Update path and label position without full re-render
          const cpx = cellPx();
          path.setAttribute('d', computePolygonPath(obj, cpx));

          // Update label position if present
          const labelEl = objectLayer.querySelector(`text[data-id="${id}"]`);
          if (labelEl) {
            const cx = obj.left + (obj.baseWidth * cpx) / 2;
            const cy = obj.top + (obj.baseHeight * cpx) / 2;
            labelEl.setAttribute('x', String(cx));
            labelEl.setAttribute('y', String(cy));
            labelEl.setAttribute(
              'transform',
              `translate(${cx}, ${cy}) scale(-1, -1) rotate(-45) translate(${-cx}, ${-cy})`,
            );
          }

          refreshControlPoints();
        };

        const onUp = (upEvent) => {
          isDraggingObject = false;
          trash?.classList.remove('active');

          // Check if dropped in trash/palette zone
          const droppingInTrash =
            inTrashZone(upEvent.clientX, upEvent.clientY) ||
            inPaletteZone(upEvent.clientX, upEvent.clientY);

          if (didMove) {
            lastDragEndTime = Date.now();
          }
          path.releasePointerCapture(e.pointerId);
          path.style.cursor = 'pointer';
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);

          if (droppingInTrash) {
            // Delete the object layer
            deleteObjectLayer(id);
            clearControlPoints();
            queueSaveToURL();
            saveCheckpoint();
          } else {
            // Full re-render on completion
            renderObjectLayer();

            // Save state only if moved
            if (didMove) {
              queueSaveToURL();
              saveCheckpoint();
            }
          }
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      }
    }
  });

  // Click on rot (but not on control points or object paths) to deselect
  rot.addEventListener('click', (e) => {
    // Don't deselect if clicking on control points
    if (e.target.closest('.object-control-point')) {
      return;
    }
    // Don't deselect if clicking on object layer paths
    if (e.target.closest('#objectLayer path')) {
      return;
    }
    // Don't deselect if clicking on blocks
    if (e.target.closest('.block')) {
      return;
    }
    // Don't deselect if we just finished dragging (with actual movement)
    if (wasDraggingRecently()) {
      return;
    }
    // Deselect
    deselectObject();
  });

  // Handle delete key for selected object
  document.addEventListener('keydown', (e) => {
    if (
      state.selectedObjectId &&
      (e.key === 'Delete' || e.key === 'Backspace') &&
      !e.target.matches('input, textarea, [contenteditable]')
    ) {
      e.preventDefault();
      deleteSelectedObject();
    }
  });
}

/**
 * Show a label editor input at the specified position.
 * @param {import('../state.js').ObjectLayerItem} obj
 * @param {number} clientX
 * @param {number} clientY
 */
function showLabelEditor(obj, clientX, clientY) {
  // Remove any existing editor
  hideLabelEditor();

  const cpx = cellPx();
  const centerX = obj.left + (obj.baseWidth * cpx) / 2;
  const centerY = obj.top + (obj.baseHeight * cpx) / 2;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'object-label-editor';
  input.value = obj.label || '';
  input.placeholder = `${obj.baseWidth}×${obj.baseHeight}`;
  input.style.left = `${centerX}px`;
  input.style.top = `${centerY}px`;

  const commitEdit = () => {
    const newLabel = input.value.trim();
    const defaultLabel = `${obj.baseWidth}×${obj.baseHeight}`;

    // Only set label if it's not empty and not the default
    if (newLabel && newLabel !== defaultLabel) {
      obj.label = newLabel;
    } else {
      obj.label = undefined;
    }

    hideLabelEditor();
    renderObjectLayer();
    refreshControlPoints();
    queueSaveToURL();
    saveCheckpoint();
  };

  // Prevent clicks on the editor from propagating to tile toggle or deselect
  input.addEventListener('pointerdown', (e) => e.stopPropagation());
  input.addEventListener('click', (e) => e.stopPropagation());

  input.addEventListener('blur', commitEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      hideLabelEditor();
    }
  });

  rot.appendChild(input);
  activeLabelEditor = input;

  // Focus and select all text
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

/**
 * Hide the label editor if active.
 */
function hideLabelEditor() {
  if (activeLabelEditor) {
    activeLabelEditor.remove();
    activeLabelEditor = null;
  }
}
