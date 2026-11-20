import React, { useMemo, useState } from 'react';
import { Barcode, Download, Sparkles } from 'lucide-react';
import { CopyButton, ThemedSelect } from '../components/ToolUI';
import { BarcodeFormat, generateBarcodeSvg } from '../lib/barcode';

export const BarcodeTool: React.FC = () => {
  const [format, setFormat] = useState<BarcodeFormat>('code128');
  const [text, setText] = useState<string>('PROGIT-2026-v119');
  const [height, setHeight] = useState<number>(80);
  const [moduleWidth, setModuleWidth] = useState<number>(2);
  const [showText, setShowText] = useState<boolean>(true);
  const [fgColor, setFgColor] = useState<string>('#000000');
  const [bgColor, setBgColor] = useState<string>('#ffffff');

  const svgString = useMemo(() => {
    return generateBarcodeSvg(text, format, {
      height,
      moduleWidth,
      showText,
      fgColor,
      bgColor,
    });
  }, [text, format, height, moduleWidth, showText, fgColor, bgColor]);

  const handleDownloadSvg = () => {
    if (!svgString) return;
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `barcode-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPng = () => {
    if (!svgString) return;
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width * 2 || 800;
      canvas.height = img.height * 2 || 300;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(2, 2);
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `barcode-${Date.now()}.png`;
        a.click();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <div className="space-y-4">
      {/* Top Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-gray-500">Symbology:</span>
          <div className="w-56">
            <ThemedSelect
              value={format}
              onChange={v => {
                setFormat(v as BarcodeFormat);
                if (v === 'ean13') setText('400638133393');
                else if (v === 'upca') setText('012345678905');
                else if (v === 'code39') setText('PROGIT-123');
                else setText('PROGIT-2026-v119');
              }}
              options={[
                { value: 'code128', label: 'Code 128 (High-Density)' },
                { value: 'code39', label: 'Code 39 (Alphanumeric)' },
                { value: 'ean13', label: 'EAN-13 (Retail Standard)' },
                { value: 'upca', label: 'UPC-A (12-Digit)' },
              ]}
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <CopyButton value={svgString} label="Copy SVG" />
          <button
            type="button"
            onClick={handleDownloadSvg}
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-50 text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5 text-sky-500" />
            <span>SVG</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadPng}
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            <span>PNG</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Inputs */}
        <div className="lg:col-span-6 space-y-4">
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-3 text-xs">
            <div>
              <label className="font-semibold text-gray-700 dark:text-dark-text block mb-1">
                Data Value to Encode
              </label>
              <input
                type="text"
                value={text}
                onChange={e => setText(e.target.value)}
                className="w-full font-mono text-xs p-2.5 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-[11px] text-gray-400 mt-1 block">
                {format === 'ean13' ? 'Requires 12 digits (check digit computed automatically)' : 'Standard ASCII / alphanumeric string'}
              </span>
            </div>

            {/* Sliders: Bar height & scale */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 dark:border-dark-border">
              <div className="space-y-1">
                <div className="flex justify-between text-gray-600 font-semibold">
                  <span>Bar Height</span>
                  <span className="font-mono">{height}px</span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="160"
                  value={height}
                  onChange={e => setHeight(Number(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 dark:bg-dark-border rounded cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-gray-600 font-semibold">
                  <span>Scale Width</span>
                  <span className="font-mono">{moduleWidth}px</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="4"
                  value={moduleWidth}
                  onChange={e => setModuleWidth(Number(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 dark:bg-dark-border rounded cursor-pointer"
                />
              </div>
            </div>

            {/* Show Text Checkbox & Colors */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-dark-border">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showText}
                  onChange={e => setShowText(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="font-semibold text-gray-700 dark:text-dark-text">Display Text Label</span>
              </label>

              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1.5">
                  <span className="text-gray-400">Bars:</span>
                  <input
                    type="color"
                    value={fgColor}
                    onChange={e => setFgColor(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                  />
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-gray-400">BG:</span>
                  <input
                    type="color"
                    value={bgColor}
                    onChange={e => setBgColor(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Preview */}
        <div className="lg:col-span-6 flex flex-col items-center justify-center p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-3">
          <div
            className="p-4 rounded-xl border border-gray-100 dark:border-dark-border shadow-sm flex items-center justify-center overflow-x-auto max-w-full"
            style={{ backgroundColor: bgColor }}
          >
            {svgString ? (
              <div dangerouslySetInnerHTML={{ __html: svgString }} />
            ) : (
              <p className="text-xs text-gray-400">Rendering barcode...</p>
            )}
          </div>

          <span className="text-[11px] font-mono text-gray-400 text-center uppercase tracking-wider">
            {format.toUpperCase()} Symbology Matrix
          </span>
        </div>
      </div>
    </div>
  );
};

export default BarcodeTool;
