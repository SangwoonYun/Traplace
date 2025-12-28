// File: app/static/js/importPNG.js
/**
 * Import PNG files and extract URI metadata from tEXt chunks.
 *
 * Pipeline:
 *  1) Read PNG file as ArrayBuffer
 *  2) Parse PNG chunks to find tEXt chunks
 *  3) Extract URI metadata if present
 *  4) Navigate to the extracted URI
 */

/**
 * Read a tEXt chunk from PNG data.
 * @param {ArrayBuffer} pngData PNG file data
 * @param {string} keyword Metadata keyword to search for (e.g., "URI")
 * @returns {string|null} The text value if found, null otherwise
 */
function readPngTextChunk(pngData, keyword) {
  const view = new Uint8Array(pngData);

  // PNG signature: 8 bytes
  const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  // Verify PNG signature
  for (let i = 0; i < 8; i++) {
    if (view[i] !== PNG_SIGNATURE[i]) {
      throw new Error('Invalid PNG file');
    }
  }

  // Read chunks
  let pos = 8; // skip signature
  const dataView = new DataView(view.buffer);

  while (pos < view.length) {
    // Chunk structure: length (4 bytes) + type (4 bytes) + data (length bytes) + crc (4 bytes)
    if (pos + 8 > view.length) break;

    const chunkLength = dataView.getUint32(pos, false); // big-endian
    const chunkType = String.fromCharCode(
      view[pos + 4],
      view[pos + 5],
      view[pos + 6],
      view[pos + 7],
    );

    // Check if this is a tEXt chunk
    if (chunkType === 'tEXt') {
      const chunkDataStart = pos + 8;
      const chunkDataEnd = chunkDataStart + chunkLength;

      if (chunkDataEnd > view.length) break;

      // Find null separator
      let nullPos = -1;
      for (let i = chunkDataStart; i < chunkDataEnd; i++) {
        if (view[i] === 0) {
          nullPos = i;
          break;
        }
      }

      if (nullPos !== -1) {
        // Extract keyword
        const keywordBytes = view.slice(chunkDataStart, nullPos);
        const chunkKeyword = new TextDecoder().decode(keywordBytes);

        // If keyword matches, extract text
        if (chunkKeyword === keyword) {
          const textBytes = view.slice(nullPos + 1, chunkDataEnd);
          return new TextDecoder().decode(textBytes);
        }
      }
    }

    // Check for IEND chunk (end of PNG)
    if (chunkType === 'IEND') break;

    // Move to next chunk
    pos += 4 + 4 + chunkLength + 4; // length + type + data + crc
  }

  return null;
}

/**
 * Import PNG file and restore state from embedded URI.
 * @param {File} file PNG file from file input
 * @returns {string} The extracted URI hash (for logging/debugging)
 */
export async function importPNG(file) {
  if (!file || !file.type.startsWith('image/png')) {
    throw new Error('Please select a valid PNG file');
  }

  const arrayBuffer = await file.arrayBuffer();
  const uri = readPngTextChunk(arrayBuffer, 'URI');

  if (!uri) {
    throw new Error('No URI metadata found in this PNG file');
  }

  // Extract hash from URI (everything after #)
  const hashIndex = uri.indexOf('#');
  if (hashIndex === -1) {
    throw new Error('No state data found in URI');
  }

  const hash = uri.slice(hashIndex + 1);
  if (!hash) {
    throw new Error('Empty state data in URI');
  }

  return hash;
}
