// File: app/static/js/objectLayer.js
/**
 * Object Layer management: CRUD operations for polygon-shaped layers.
 * These layers appear below blocks and can have adjustable edges.
 */

import { state } from './state.js';
import { renderObjectLayer } from './render.js';
import { queueSaveToURL } from './urlState.js';
import { saveCheckpoint } from './history.js';

let idCounter = 0;

/**
 * Generate a unique ID for an object layer item.
 * @returns {string}
 */
function generateId() {
  return `obj_${Date.now()}_${idCounter++}`;
}

/**
 * Create a new object layer item.
 * @param {number} left - Top-left x position in pixels
 * @param {number} top - Top-left y position in pixels
 * @param {number} baseWidth - Width in cells
 * @param {number} baseHeight - Height in cells
 * @param {string} [color] - Fill color (defaults to CSS variable)
 * @returns {import('./state.js').ObjectLayerItem}
 */
export function createObjectLayer(left, top, baseWidth, baseHeight, color = null) {
  const obj = {
    id: generateId(),
    left,
    top,
    baseWidth,
    baseHeight,
    color: color || null, // null means use default CSS color
    topEdge: new Array(baseWidth).fill(0),
    rightEdge: new Array(baseHeight).fill(0),
    bottomEdge: new Array(baseWidth).fill(0),
    leftEdge: new Array(baseHeight).fill(0),
    topExtSides: {},
    rightExtSides: {},
    bottomExtSides: {},
    leftExtSides: {},
  };

  state.objectLayers.push(obj);

  if (!state._restoring) {
    renderObjectLayer();
    queueSaveToURL();
    saveCheckpoint();
  }

  return obj;
}

/**
 * Delete an object layer item by ID.
 * @param {string} id
 */
export function deleteObjectLayer(id) {
  const idx = state.objectLayers.findIndex((o) => o.id === id);
  if (idx >= 0) {
    state.objectLayers.splice(idx, 1);

    // Clear selection if deleted
    if (state.selectedObjectId === id) {
      state.selectedObjectId = null;
    }

    if (!state._restoring) {
      renderObjectLayer();
      queueSaveToURL();
      saveCheckpoint();
    }
  }
}

/**
 * Update an object layer's position.
 * @param {string} id
 * @param {number} left
 * @param {number} top
 */
export function updateObjectLayerPosition(id, left, top) {
  const obj = state.objectLayers.find((o) => o.id === id);
  if (obj) {
    obj.left = left;
    obj.top = top;

    if (!state._restoring) {
      renderObjectLayer();
      queueSaveToURL();
      saveCheckpoint();
    }
  }
}

/**
 * Update an edge offset for an object layer.
 * @param {string} id - Object ID
 * @param {'top'|'right'|'bottom'|'left'} edge - Which edge
 * @param {number} index - Cell index on that edge
 * @param {number} offset - New offset value (positive = outward, negative = inward)
 */
export function updateObjectLayerEdge(id, edge, index, offset) {
  const obj = state.objectLayers.find((o) => o.id === id);
  if (!obj) return;

  const edgeKey = `${edge}Edge`;
  if (obj[edgeKey] && index >= 0 && index < obj[edgeKey].length) {
    obj[edgeKey][index] = offset;

    if (!state._restoring) {
      renderObjectLayer();
      queueSaveToURL();
      saveCheckpoint();
    }
  }
}

/**
 * Select an object layer for editing.
 * @param {string|null} id
 */
export function selectObjectLayer(id) {
  state.selectedObjectId = id;
  renderObjectLayer();
}

/**
 * Get the currently selected object layer.
 * @returns {import('./state.js').ObjectLayerItem|null}
 */
export function getSelectedObjectLayer() {
  if (!state.selectedObjectId) return null;
  return state.objectLayers.find((o) => o.id === state.selectedObjectId) || null;
}

/**
 * Find an object layer by ID.
 * @param {string} id
 * @returns {import('./state.js').ObjectLayerItem|null}
 */
export function findObjectLayer(id) {
  return state.objectLayers.find((o) => o.id === id) || null;
}
