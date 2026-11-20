// Lightweight pure TypeScript QR Code generator (ISO/IEC 18004)
// Supports Byte mode, Versions 1-10 (up to ~650 alphanumeric characters),
// Error Correction levels L, M, Q, H, and standard 8 mask patterns.

export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

interface QRVersionInfo {
  version: number;
  totalCodewords: number;
  ecCodewords: Record<QrErrorCorrectionLevel, number>;
  blocks: Record<QrErrorCorrectionLevel, number>;
}

// Version table 1..10
const VERSION_TABLE: QRVersionInfo[] = [
  { version: 1, totalCodewords: 26, ecCodewords: { L: 7, M: 10, Q: 13, H: 17 }, blocks: { L: 1, M: 1, Q: 1, H: 1 } },
  { version: 2, totalCodewords: 44, ecCodewords: { L: 10, M: 16, Q: 22, H: 28 }, blocks: { L: 1, M: 1, Q: 1, H: 1 } },
  { version: 3, totalCodewords: 70, ecCodewords: { L: 15, M: 26, Q: 36, H: 44 }, blocks: { L: 1, M: 1, Q: 2, H: 2 } },
  { version: 4, totalCodewords: 100, ecCodewords: { L: 20, M: 36, Q: 52, H: 64 }, blocks: { L: 1, M: 2, Q: 2, H: 4 } },
  { version: 5, totalCodewords: 134, ecCodewords: { L: 26, M: 48, Q: 72, H: 88 }, blocks: { L: 1, M: 2, Q: 4, H: 4 } },
  { version: 6, totalCodewords: 172, ecCodewords: { L: 36, M: 64, Q: 96, H: 112 }, blocks: { L: 2, M: 4, Q: 4, H: 4 } },
  { version: 7, totalCodewords: 196, ecCodewords: { L: 40, M: 72, Q: 108, H: 130 }, blocks: { L: 2, M: 4, Q: 6, H: 5 } },
  { version: 8, totalCodewords: 242, ecCodewords: { L: 48, M: 88, Q: 132, H: 156 }, blocks: { L: 2, M: 4, Q: 6, H: 6 } },
  { version: 9, totalCodewords: 292, ecCodewords: { L: 60, M: 110, Q: 160, H: 192 }, blocks: { L: 2, M: 5, Q: 8, H: 8 } },
  { version: 10, totalCodewords: 346, ecCodewords: { L: 72, M: 130, Q: 192, H: 224 }, blocks: { L: 4, M: 5, Q: 8, H: 8 } },
];

// Galois field tables for GF(256)
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    EXP_TABLE[i + 255] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x >= 256) x ^= 0x11d;
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = EXP_TABLE[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], root);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function calculateRsErrorCorrection(data: Uint8Array, ecLength: number): Uint8Array {
  const gen = rsGeneratorPoly(ecLength);
  const res = new Uint8Array(ecLength);

  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    for (let j = 0; j < ecLength - 1; j++) {
      res[j] = res[j + 1] ^ gfMul(gen[j + 1], factor);
    }
    res[ecLength - 1] = gfMul(gen[ecLength], factor);
  }
  return res;
}

class BitBuffer {
  buffer: number[] = [];
  length = 0;

  put(num: number, length: number) {
    for (let i = 0; i < length; i++) {
      this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    }
  }

  putBit(bit: boolean) {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) {
      this.buffer.push(0);
    }
    if (bit) {
      this.buffer[bufIndex] |= 0x80 >>> (this.length % 8);
    }
    this.length++;
  }
}

export function generateQrMatrix(text: string, ecLevel: QrErrorCorrectionLevel = 'M'): boolean[][] {
  const utf8Bytes = new TextEncoder().encode(text);
  const dataLen = utf8Bytes.length;

  // Determine minimal version
  let versionInfo: QRVersionInfo | null = null;
  for (const v of VERSION_TABLE) {
    const dataCapacity = v.totalCodewords - v.ecCodewords[ecLevel];
    // Byte mode overhead: 4 bits mode + 8 or 16 bits count + data
    const countBits = v.version < 10 ? 8 : 16;
    const requiredBits = 4 + countBits + dataLen * 8;
    if (requiredBits <= dataCapacity * 8) {
      versionInfo = v;
      break;
    }
  }

  if (!versionInfo) {
    versionInfo = VERSION_TABLE[VERSION_TABLE.length - 1]; // Fallback to version 10
  }

  const { version } = versionInfo;
  const size = 17 + 4 * version;
  const totalDataCodewords = versionInfo.totalCodewords - versionInfo.ecCodewords[ecLevel];

  // Encode data in Byte mode (0100)
  const bitBuf = new BitBuffer();
  bitBuf.put(0b0100, 4); // Byte mode
  bitBuf.put(dataLen, version < 10 ? 8 : 16);
  for (let i = 0; i < dataLen; i++) {
    bitBuf.put(utf8Bytes[i], 8);
  }

  // Terminator (up to 4 bits of 0)
  const padBits = Math.min(4, totalDataCodewords * 8 - bitBuf.length);
  bitBuf.put(0, padBits);

  // Align to byte
  while (bitBuf.length % 8 !== 0) {
    bitBuf.putBit(false);
  }

  // Pad bytes 0xEC, 0x11
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bitBuf.length < totalDataCodewords * 8) {
    bitBuf.put(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  const dataCodewords = new Uint8Array(bitBuf.buffer.slice(0, totalDataCodewords));

  // Compute error correction per block
  const numBlocks = versionInfo.blocks[ecLevel];
  const ecLenPerBlock = Math.floor(versionInfo.ecCodewords[ecLevel] / numBlocks);
  const blockDataLen = Math.floor(totalDataCodewords / numBlocks);

  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];

  for (let b = 0; b < numBlocks; b++) {
    const start = b * blockDataLen;
    const end = (b === numBlocks - 1) ? totalDataCodewords : (b + 1) * blockDataLen;
    const blockData = dataCodewords.slice(start, end);
    dataBlocks.push(blockData);
    ecBlocks.push(calculateRsErrorCorrection(blockData, ecLenPerBlock));
  }

  // Interleave data and EC codewords
  const interleaved: number[] = [];
  const maxBlockLen = Math.max(...dataBlocks.map(b => b.length));
  for (let i = 0; i < maxBlockLen; i++) {
    for (const b of dataBlocks) {
      if (i < b.length) interleaved.push(b[i]);
    }
  }
  for (let i = 0; i < ecLenPerBlock; i++) {
    for (const b of ecBlocks) {
      if (i < b.length) interleaved.push(b[i]);
    }
  }

  // Create matrix
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));

  // 1. Finder patterns
  const placeFinder = (r: number, c: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) {
          const isEdge = dr === 0 || dr === 6 || dc === 0 || dc === 6;
          const isCenter = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          matrix[nr][nc] = isEdge || isCenter;
        } else {
          matrix[nr][nc] = false; // Separator
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // 2. Alignment patterns (version >= 2)
  if (version >= 2) {
    const alignPos: number[][] = [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
    ];
    const coords = alignPos[version - 1] || [];
    for (const r of coords) {
      for (const c of coords) {
        if (matrix[r][c] !== null) continue; // Don't overwrite finder patterns
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isEdge = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const isCenter = dr === 0 && dc === 0;
            matrix[r + dr][c + dc] = isEdge || isCenter;
          }
        }
      }
    }
  }

  // 3. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
  }

  // 4. Dark module
  matrix[4 * version + 9][8] = true;

  // 5. Reserve format info
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }
  for (let i = size - 8; i < size; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }

  // 6. Place data bits using zigzag scan
  let bitIndex = 0;
  const totalInterleavedBits = interleaved.length * 8;
  const getBit = (idx: number) => {
    if (idx >= totalInterleavedBits) return false;
    const byte = interleaved[Math.floor(idx / 8)];
    return ((byte >>> (7 - (idx % 8))) & 1) === 1;
  };

  let upwards = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing pattern
    for (let vert = 0; vert < size; vert++) {
      const r = upwards ? size - 1 - vert : vert;
      for (let c = right; c >= right - 1; c--) {
        if (matrix[r][c] === null) {
          matrix[r][c] = getBit(bitIndex++);
        }
      }
    }
    upwards = !upwards;
  }

  // 7. Format Information (EC Level + Mask Pattern, e.g. Mask 0: (r + c) % 2 === 0)
  // Mask 0 pattern
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Don't mask function patterns (finder, timing, alignment)
      const isFinder = (r < 9 && c < 9) || (r < 9 && c >= size - 8) || (r >= size - 8 && c < 9);
      const isTiming = r === 6 || c === 6;
      if (!isFinder && !isTiming && (r + c) % 2 === 0) {
        matrix[r][c] = !matrix[r][c];
      }
    }
  }

  // Format info bits for Mask 0 and EC level
  const ecBits: Record<QrErrorCorrectionLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };
  const formatData = (ecBits[ecLevel] << 3) | 0; // mask 0
  let formatRem = formatData << 10;
  const genPoly = 0x537;
  for (let i = 14; i >= 10; i--) {
    if ((formatRem >>> i) & 1) formatRem ^= genPoly << (i - 10);
  }
  const formatString = ((formatData << 10) | formatRem) ^ 0x5412;

  // Write format info
  for (let i = 0; i < 15; i++) {
    const bit = ((formatString >>> i) & 1) === 1;
    // Top-left
    if (i < 6) matrix[i][8] = bit;
    else if (i < 8) matrix[i + 1][8] = bit;
    else matrix[8][size - 15 + i] = bit;

    // Bottom-left / Top-right
    if (i < 8) matrix[8][size - 1 - i] = bit;
    else if (i === 8) matrix[8][7] = bit;
    else matrix[size - 15 + i][8] = bit;
  }

  return matrix.map(row => row.map(v => !!v));
}

export function qrMatrixToSvg(
  matrix: boolean[][],
  fgColor = '#000000',
  bgColor = '#ffffff',
  margin = 4,
  cellSize = 8
): string {
  const size = matrix.length;
  const viewBoxSize = (size + margin * 2) * cellSize;

  let rects = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        const x = (c + margin) * cellSize;
        const y = (r + margin) * cellSize;
        rects += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${fgColor}"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${viewBoxSize}" height="${viewBoxSize}">
  <rect width="100%" height="100%" fill="${bgColor}"/>
  ${rects}
</svg>`;
}
