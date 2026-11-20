import React, { useMemo, useState } from 'react';
import { Check, Copy, Palette, Sparkles } from 'lucide-react';
import { CopyButton } from '../components/ToolUI';
import {
  RgbColor,
  clamp,
  generatePalette,
  getContrastRatio,
  hexToRgb,
  hslToRgb,
  rgbToCmyk,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
} from '../lib/color';

export const ColorPickerTool: React.FC = () => {
  const [rgb, setRgb] = useState<RgbColor>({ r: 16, g: 185, b: 129, a: 1 }); // #10b981 (Emerald)

  const hex = useMemo(() => rgbToHex(rgb, true), [rgb]);
  const hsl = useMemo(() => rgbToHsl(rgb), [rgb]);
  const hsv = useMemo(() => rgbToHsv(rgb), [rgb]);
  const cmyk = useMemo(() => rgbToCmyk(rgb), [rgb]);
  const palette = useMemo(() => generatePalette(rgb), [rgb]);

  // Contrast against White and Black
  const contrastWhite = useMemo(() => getContrastRatio(rgb, { r: 255, g: 255, b: 255 }), [rgb]);
  const contrastBlack = useMemo(() => getContrastRatio(rgb, { r: 0, g: 0, b: 0 }), [rgb]);

  const handleHexInput = (val: string) => {
    const parsed = hexToRgb(val);
    if (parsed) setRgb(parsed);
  };

  const updateHsl = (h: number, s: number, l: number) => {
    const nextRgb = hslToRgb({ h, s, l, a: rgb.a });
    setRgb(nextRgb);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Visual Picker & Sliders */}
        <div className="lg:col-span-5 space-y-4">
          {/* Large Color Swatch */}
          <div
            className="h-40 rounded-2xl border border-gray-200 dark:border-dark-border shadow-inner flex items-end p-4 relative overflow-hidden"
            style={{ backgroundColor: hex }}
          >
            <div className="bg-white/90 dark:bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 text-xs font-mono font-bold text-gray-800 dark:text-dark-text flex items-center space-x-2">
              <span>{hex.toUpperCase()}</span>
              <CopyButton value={hex} label="" className="!p-1 border-none shadow-none" />
            </div>
          </div>

          {/* Native HTML5 Color Picker */}
          <div className="flex items-center space-x-2">
            <input
              type="color"
              value={rgbToHex(rgb, false)}
              onChange={e => handleHexInput(e.target.value)}
              className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent p-0"
            />
            <input
              type="text"
              value={hex}
              onChange={e => handleHexInput(e.target.value)}
              className="w-full font-mono font-bold text-xs p-2.5 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-dark-text uppercase"
            />
          </div>

          {/* HSL Sliders */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-3 text-xs">
            {/* Hue */}
            <div className="space-y-1">
              <div className="flex justify-between font-semibold text-gray-600 dark:text-dark-text">
                <span>Hue</span>
                <span className="font-mono">{hsl.h}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                value={hsl.h}
                onChange={e => updateHsl(Number(e.target.value), hsl.s, hsl.l)}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
                }}
              />
            </div>

            {/* Saturation */}
            <div className="space-y-1">
              <div className="flex justify-between font-semibold text-gray-600 dark:text-dark-text">
                <span>Saturation</span>
                <span className="font-mono">{hsl.s}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={hsl.s}
                onChange={e => updateHsl(hsl.h, Number(e.target.value), hsl.l)}
                className="w-full h-2 bg-gray-200 dark:bg-dark-border rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Lightness */}
            <div className="space-y-1">
              <div className="flex justify-between font-semibold text-gray-600 dark:text-dark-text">
                <span>Lightness</span>
                <span className="font-mono">{hsl.l}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={hsl.l}
                onChange={e => updateHsl(hsl.h, hsl.s, Number(e.target.value))}
                className="w-full h-2 bg-gray-200 dark:bg-dark-border rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Alpha */}
            <div className="space-y-1">
              <div className="flex justify-between font-semibold text-gray-600 dark:text-dark-text">
                <span>Alpha</span>
                <span className="font-mono">{Math.round((rgb.a ?? 1) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={rgb.a ?? 1}
                onChange={e => setRgb(prev => ({ ...prev, a: Number(e.target.value) }))}
                className="w-full h-2 bg-gray-200 dark:bg-dark-border rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Right: Color Spaces & Contrast Analysis */}
        <div className="lg:col-span-7 space-y-4">
          {/* Format Representation Cards */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-2 text-xs">
            <span className="font-semibold text-gray-400 uppercase tracking-wider text-[11px] block">
              Color Space Values
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono">
              {[
                { label: 'HEX', val: hex },
                { label: 'RGB', val: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` },
                { label: 'RGBA', val: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${rgb.a ?? 1})` },
                { label: 'HSL', val: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` },
                { label: 'HSV', val: `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)` },
                { label: 'CMYK', val: `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)` },
              ].map(f => (
                <div key={f.label} className="p-2.5 rounded-lg border border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-dark-border/30 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-gray-400 uppercase block">{f.label}</span>
                    <span className="font-bold text-gray-800 dark:text-dark-text">{f.val}</span>
                  </div>
                  <CopyButton value={f.val} label="" className="!p-1 border-none" />
                </div>
              ))}
            </div>
          </div>

          {/* WCAG Contrast Ratio Checker */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-3 text-xs">
            <span className="font-semibold text-gray-400 uppercase tracking-wider text-[11px] block">
              WCAG 2.1 Accessibility Contrast Checker
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* White Contrast */}
              <div className="p-3 rounded-lg border border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-dark-border/20 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-700 dark:text-dark-text">On White (#FFF)</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{contrastWhite.toFixed(2)}:1</span>
                </div>
                <div className="flex gap-1.5 text-[10px] font-bold">
                  <span className={`px-1.5 py-0.5 rounded ${contrastWhite >= 4.5 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    AA {contrastWhite >= 4.5 ? 'Pass' : 'Fail'}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded ${contrastWhite >= 7 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    AAA {contrastWhite >= 7 ? 'Pass' : 'Fail'}
                  </span>
                </div>
              </div>

              {/* Black Contrast */}
              <div className="p-3 rounded-lg border border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-dark-border/20 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-700 dark:text-dark-text">On Black (#000)</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{contrastBlack.toFixed(2)}:1</span>
                </div>
                <div className="flex gap-1.5 text-[10px] font-bold">
                  <span className={`px-1.5 py-0.5 rounded ${contrastBlack >= 4.5 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    AA {contrastBlack >= 4.5 ? 'Pass' : 'Fail'}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded ${contrastBlack >= 7 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    AAA {contrastBlack >= 7 ? 'Pass' : 'Fail'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Tints & Shades Palette Swatches */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-2 text-xs">
            <span className="font-semibold text-gray-400 uppercase tracking-wider text-[11px] block">
              Tailwind-Style Shades & Tints
            </span>
            <div className="grid grid-cols-11 gap-1">
              {palette.map(step => (
                <div
                  key={step.label}
                  onClick={() => handleHexInput(step.hex)}
                  className="group cursor-pointer text-center space-y-1"
                  title={`${step.label}: ${step.hex}`}
                >
                  <div
                    className="h-10 rounded-md border border-black/10 transition-transform group-hover:scale-105"
                    style={{ backgroundColor: step.hex }}
                  />
                  <span className="text-[10px] text-gray-400 block font-mono">{step.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ColorPickerTool;
