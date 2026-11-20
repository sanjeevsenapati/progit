import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Download, ImageIcon, Sparkles, Upload } from 'lucide-react';
import { ThemedSelect } from '../components/ToolUI';

export const ImageCompressorTool: React.FC = () => {
  const [origImageSrc, setOrigImageSrc] = useState<string>('');
  const [origBytes, setOrigBytes] = useState<number>(0);
  const [origDimensions, setOrigDimensions] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const [outputFormat, setOutputFormat] = useState<string>('image/webp');
  const [quality, setQuality] = useState<number>(0.8);
  const [maxWidth, setMaxWidth] = useState<number>(1920);

  const [compressedSrc, setCompressedSrc] = useState<string>('');
  const [compressedBytes, setCompressedBytes] = useState<number>(0);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOrigBytes(file.size);
    const reader = new FileReader();
    reader.onload = ev => {
      if (typeof ev.target?.result === 'string') {
        const src = ev.target.result;
        setOrigImageSrc(src);
        const img = new Image();
        img.onload = () => {
          setOrigDimensions({ w: img.width, h: img.height });
        };
        img.src = src;
      }
    };
    reader.readAsDataURL(file);
  };

  // Recompress when settings change
  useEffect(() => {
    if (!origImageSrc) return;

    const img = new Image();
    img.onload = () => {
      let targetW = img.width;
      let targetH = img.height;

      if (maxWidth > 0 && targetW > maxWidth) {
        const ratio = maxWidth / targetW;
        targetW = maxWidth;
        targetH = Math.round(targetH * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, targetW, targetH);
      const dataUrl = canvas.toDataURL(outputFormat, quality);
      setCompressedSrc(dataUrl);

      // Estimate compressed bytes from base64 string
      const head = 'data:' + outputFormat + ';base64,';
      const b64 = dataUrl.substring(head.length);
      const bytes = Math.round((b64.length * 3) / 4);
      setCompressedBytes(bytes);
    };
    img.src = origImageSrc;
  }, [origImageSrc, outputFormat, quality, maxWidth]);

  const savingsPct = useMemo(() => {
    if (origBytes === 0 || compressedBytes === 0) return 0;
    return Math.round(((origBytes - compressedBytes) / origBytes) * 1000) / 10;
  }, [origBytes, compressedBytes]);

  const handleDownload = () => {
    if (!compressedSrc) return;
    const ext = outputFormat === 'image/webp' ? 'webp' : outputFormat === 'image/jpeg' ? 'jpg' : 'png';
    const a = document.createElement('a');
    a.href = compressedSrc;
    a.download = `compressed-${Date.now()}.${ext}`;
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Upload & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-50 cursor-pointer font-semibold">
            <Upload className="w-3.5 h-3.5 text-emerald-500" />
            <span>Select Image</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileUpload} className="hidden" />
          </label>

          <button
            type="button"
            onClick={handleDownload}
            disabled={!compressedSrc}
            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Compressed</span>
          </button>
        </div>

        {origBytes > 0 && (
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-gray-400">Savings:</span>
            <span className="font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {savingsPct > 0 ? `-${savingsPct}%` : '0%'}
            </span>
          </div>
        )}
      </div>

      {/* Settings Grid */}
      <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div>
          <label className="font-semibold text-gray-500 block mb-1">Target Format</label>
          <ThemedSelect
            value={outputFormat}
            onChange={setOutputFormat}
            options={[
              { value: 'image/webp', label: 'WebP (Maximum Compression)' },
              { value: 'image/jpeg', label: 'JPEG (Standard)' },
              { value: 'image/png', label: 'PNG (Lossless)' },
            ]}
          />
        </div>

        <div>
          <div className="flex justify-between font-semibold text-gray-500 mb-1">
            <span>Quality Level</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{Math.round(quality * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            value={quality}
            onChange={e => setQuality(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-dark-border rounded cursor-pointer mt-2"
          />
        </div>

        <div>
          <label className="font-semibold text-gray-500 block mb-1">Max Resolution Width</label>
          <ThemedSelect
            value={String(maxWidth)}
            onChange={v => setMaxWidth(Number(v))}
            options={[
              { value: '0', label: 'Original Dimensions' },
              { value: '1920', label: 'Full HD (1920px)' },
              { value: '1280', label: 'HD (1280px)' },
              { value: '800', label: 'Web Medium (800px)' },
              { value: '400', label: 'Thumbnail (400px)' },
            ]}
          />
        </div>
      </div>

      {/* Side-by-Side Image Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Original */}
        <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-gray-700 dark:text-dark-text uppercase tracking-wider text-[11px]">
              Original Image
            </span>
            <span className="font-mono text-gray-400">
              {origDimensions.w > 0 ? `${origDimensions.w}×${origDimensions.h}px • ` : ''}
              {Math.round(origBytes / 1024)} KB
            </span>
          </div>
          <div className="h-64 rounded-lg bg-gray-50 dark:bg-dark-border/20 border border-gray-100 dark:border-dark-border flex items-center justify-center overflow-hidden">
            {origImageSrc ? (
              <img src={origImageSrc} alt="Original" className="max-h-full max-w-full object-contain" />
            ) : (
              <div className="text-center text-gray-400 space-y-1">
                <ImageIcon className="w-8 h-8 mx-auto stroke-1" />
                <p className="text-xs">Upload an image to start compressing</p>
              </div>
            )}
          </div>
        </div>

        {/* Compressed */}
        <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider text-[11px] flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Compressed Result</span>
            </span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {Math.round(compressedBytes / 1024)} KB
            </span>
          </div>
          <div className="h-64 rounded-lg bg-gray-50 dark:bg-dark-border/20 border border-gray-100 dark:border-dark-border flex items-center justify-center overflow-hidden">
            {compressedSrc ? (
              <img src={compressedSrc} alt="Compressed" className="max-h-full max-w-full object-contain" />
            ) : (
              <p className="text-xs text-gray-400">Awaiting image upload...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageCompressorTool;
