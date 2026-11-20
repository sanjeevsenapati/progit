export interface RgbColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface HslColor {
  h: number;
  s: number;
  l: number;
  a?: number;
}

export interface HsvColor {
  h: number;
  s: number;
  v: number;
}

export interface CmykColor {
  c: number;
  m: number;
  y: number;
  k: number;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

export function hexToRgb(hex: string): RgbColor | null {
  let cleaned = hex.trim().replace(/^#/, '');
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map(c => c + c).join('') + 'ff';
  } else if (cleaned.length === 6) {
    cleaned += 'ff';
  } else if (cleaned.length === 4) {
    cleaned = cleaned.split('').map(c => c + c).join('');
  }
  if (cleaned.length !== 8 || !/^[0-9a-fA-F]{8}$/.test(cleaned)) {
    return null;
  }
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  const a = Math.round((parseInt(cleaned.substring(6, 8), 16) / 255) * 100) / 100;
  return { r, g, b, a };
}

export function rgbToHex(rgb: RgbColor, includeAlpha = false): string {
  const rHex = clamp(Math.round(rgb.r), 0, 255).toString(16).padStart(2, '0');
  const gHex = clamp(Math.round(rgb.g), 0, 255).toString(16).padStart(2, '0');
  const bHex = clamp(Math.round(rgb.b), 0, 255).toString(16).padStart(2, '0');
  if (includeAlpha && rgb.a !== undefined && rgb.a < 1) {
    const aHex = clamp(Math.round(rgb.a * 255), 0, 255).toString(16).padStart(2, '0');
    return `#${rHex}${gHex}${bHex}${aHex}`.toLowerCase();
  }
  return `#${rHex}${gHex}${bHex}`.toLowerCase();
}

export function rgbToHsl(rgb: RgbColor): HslColor {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
    a: rgb.a,
  };
}

export function hslToRgb(hsl: HslColor): RgbColor {
  const h = ((hsl.h % 360) + 360) % 360 / 360;
  const s = clamp(hsl.s, 0, 100) / 100;
  const l = clamp(hsl.l, 0, 100) / 100;

  if (s === 0) {
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray, a: hsl.a };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

  return { r, g, b, a: hsl.a };
}

export function rgbToHsv(rgb: RgbColor): HsvColor {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    v: Math.round(v * 100),
  };
}

export function rgbToCmyk(rgb: RgbColor): CmykColor {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const k = 1 - Math.max(r, g, b);
  if (k === 1) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }
  const c = (1 - r - k) / (1 - k);
  const m = (1 - g - k) / (1 - k);
  const y = (1 - b - k) / (1 - k);
  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100),
  };
}

// Relative luminance based on WCAG 2.1 definition
export function getRelativeLuminance(rgb: RgbColor): number {
  const srgb = [rgb.r, rgb.g, rgb.b].map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

// Contrast ratio between two colors according to WCAG 2.1
export function getContrastRatio(rgb1: RgbColor, rgb2: RgbColor): number {
  const lum1 = getRelativeLuminance(rgb1);
  const lum2 = getRelativeLuminance(rgb2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Generate color shades & tints
export function generatePalette(rgb: RgbColor): { hex: string; label: string }[] {
  const hsl = rgbToHsl(rgb);
  const steps = [
    { label: '50', l: 96 },
    { label: '100', l: 90 },
    { label: '200', l: 80 },
    { label: '300', l: 70 },
    { label: '400', l: 60 },
    { label: '500', l: 50 },
    { label: '600', l: 40 },
    { label: '700', l: 30 },
    { label: '800', l: 20 },
    { label: '900', l: 12 },
    { label: '950', l: 6 },
  ];

  return steps.map(s => {
    const targetHsl: HslColor = { h: hsl.h, s: hsl.s, l: s.l };
    const stepRgb = hslToRgb(targetHsl);
    return {
      hex: rgbToHex(stepRgb),
      label: s.label,
    };
  });
}
