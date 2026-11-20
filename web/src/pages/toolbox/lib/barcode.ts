// Lightweight Barcode generator for Code 128, Code 39, EAN-13, and UPC-A
export type BarcodeFormat = 'code128' | 'code39' | 'ean13' | 'upca';

// Code 128 pattern table (107 patterns, each 11 modules wide, stop pattern is 13)
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

export function encodeCode128(text: string): { modules: boolean[]; text: string } {
  // Start with Code Set B (Start B = 104)
  const codeValues: number[] = [104];
  let checksum = 104;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32;
    if (code >= 0 && code <= 95) {
      codeValues.push(code);
      checksum += code * (i + 1);
    }
  }

  const checkDigit = checksum % 103;
  codeValues.push(checkDigit);
  codeValues.push(106); // STOP pattern

  const modules: boolean[] = [];
  for (let idx = 0; idx < codeValues.length; idx++) {
    const pattern = CODE128_PATTERNS[codeValues[idx]];
    let isBar = true;
    for (const char of pattern) {
      const width = parseInt(char, 10);
      for (let w = 0; w < width; w++) {
        modules.push(isBar);
      }
      isBar = !isBar;
    }
  }

  return { modules, text };
}

// Code 39
const CODE39_MAP: Record<string, string> = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
  '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
  '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
  'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
  'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
  'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
  'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
  'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
  'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
  '-': '010000101', '.': '110000100', ' ': '011000100', '*': '010010100',
  '$': '010101000', '/': '010100010', '+': '010001010', '%': '000101010',
};

export function encodeCode39(text: string): { modules: boolean[]; text: string } {
  const upper = `*${text.toUpperCase()}*`;
  const modules: boolean[] = [];

  for (let i = 0; i < upper.length; i++) {
    const char = upper[i];
    const pattern = CODE39_MAP[char] || CODE39_MAP['-'];
    for (let p = 0; p < 9; p++) {
      const isBar = p % 2 === 0;
      const isWide = pattern[p] === '1';
      const width = isWide ? 3 : 1;
      for (let w = 0; w < width; w++) {
        modules.push(isBar);
      }
    }
    // Inter-character space
    if (i < upper.length - 1) {
      modules.push(false);
    }
  }

  return { modules, text: upper.replace(/\*/g, '') };
}

// EAN-13
const EAN_L = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];
const EAN_G = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111',
];
const EAN_R = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100',
];
const EAN_PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];

export function encodeEan13(raw: string): { modules: boolean[]; text: string } {
  let digits = raw.replace(/\D/g, '').slice(0, 12);
  while (digits.length < 12) digits += '0';

  // Calculate check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  const fullText = digits + checkDigit.toString();

  const firstDigit = parseInt(fullText[0], 10);
  const parity = EAN_PARITY[firstDigit];

  const modules: boolean[] = [];
  // Left guard
  modules.push(true, false, true);

  // Left 6 digits
  for (let i = 1; i <= 6; i++) {
    const d = parseInt(fullText[i], 10);
    const pattern = parity[i - 1] === 'L' ? EAN_L[d] : EAN_G[d];
    for (const b of pattern) modules.push(b === '1');
  }

  // Center guard
  modules.push(false, true, false, true, false);

  // Right 6 digits
  for (let i = 7; i <= 12; i++) {
    const d = parseInt(fullText[i], 10);
    const pattern = EAN_R[d];
    for (const b of pattern) modules.push(b === '1');
  }

  // Right guard
  modules.push(true, false, true);

  return { modules, text: fullText };
}

export function generateBarcodeSvg(
  text: string,
  format: BarcodeFormat,
  options: {
    height?: number;
    moduleWidth?: number;
    showText?: boolean;
    fgColor?: string;
    bgColor?: string;
  } = {}
): string {
  const {
    height = 80,
    moduleWidth = 2,
    showText = true,
    fgColor = '#000000',
    bgColor = '#ffffff',
  } = options;

  let encoded: { modules: boolean[]; text: string };
  try {
    switch (format) {
      case 'code39':
        encoded = encodeCode39(text || 'PROGIT-123');
        break;
      case 'ean13':
        encoded = encodeEan13(text || '400638133393');
        break;
      case 'upca':
        encoded = encodeEan13('0' + (text.replace(/\D/g, '').slice(0, 11) || '01234567890'));
        break;
      case 'code128':
      default:
        encoded = encodeCode128(text || 'ProGit-2026');
        break;
    }
  } catch {
    encoded = encodeCode128('ERROR');
  }

  const quietZone = 10 * moduleWidth;
  const barWidth = encoded.modules.length * moduleWidth;
  const totalWidth = barWidth + quietZone * 2;
  const totalHeight = height + (showText ? 24 : 0);

  let bars = '';
  let inBar = false;
  let barStart = 0;

  for (let i = 0; i < encoded.modules.length; i++) {
    const isBar = encoded.modules[i];
    if (isBar && !inBar) {
      inBar = true;
      barStart = i;
    } else if (!isBar && inBar) {
      inBar = false;
      const x = quietZone + barStart * moduleWidth;
      const w = (i - barStart) * moduleWidth;
      bars += `<rect x="${x}" y="8" width="${w}" height="${height}" fill="${fgColor}"/>`;
    }
  }
  if (inBar) {
    const x = quietZone + barStart * moduleWidth;
    const w = (encoded.modules.length - barStart) * moduleWidth;
    bars += `<rect x="${x}" y="8" width="${w}" height="${height}" fill="${fgColor}"/>`;
  }

  const textElement = showText
    ? `<text x="${totalWidth / 2}" y="${height + 20}" font-family="monospace, sans-serif" font-size="13" font-weight="bold" text-anchor="middle" fill="${fgColor}">${encoded.text}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}">
  <rect width="100%" height="100%" fill="${bgColor}"/>
  ${bars}
  ${textElement}
</svg>`;
}
