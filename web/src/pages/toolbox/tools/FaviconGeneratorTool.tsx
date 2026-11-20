import React, { useEffect, useMemo, useState } from 'react';
import { Download, Globe, ImageIcon, Sparkles, Upload } from 'lucide-react';
import { CopyButton } from '../components/ToolUI';

interface FaviconSize {
  name: string;
  size: number;
  rel: string;
  desc: string;
  dataUrl?: string;
}

const FAVICON_SIZES: FaviconSize[] = [
  { name: 'favicon-16x16.png', size: 16, rel: 'icon', desc: 'Standard browser tab icon' },
  { name: 'favicon-32x32.png', size: 32, rel: 'icon', desc: 'Retina / high-DPI desktop tab icon' },
  { name: 'favicon-48x48.png', size: 48, rel: 'icon', desc: 'Windows taskbar icon' },
  { name: 'apple-touch-icon.png', size: 180, rel: 'apple-touch-icon', desc: 'iOS home screen bookmark' },
  { name: 'android-chrome-192x192.png', size: 192, rel: 'icon', desc: 'Android Web App Manifest icon' },
  { name: 'android-chrome-512x512.png', size: 512, rel: 'icon', desc: 'PWA Splash Screen & App Store' },
];

export const FaviconGeneratorTool: React.FC = () => {
  const [sourceImg, setSourceImg] = useState<string>('');
  const [generatedSizes, setGeneratedSizes] = useState<FaviconSize[]>(FAVICON_SIZES);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      if (typeof ev.target?.result === 'string') {
        setSourceImg(ev.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Render icons onto canvases of various dimensions
  useEffect(() => {
    if (!sourceImg) return;
    const img = new Image();
    img.onload = () => {
      const updated = FAVICON_SIZES.map(item => {
        const canvas = document.createElement('canvas');
        canvas.width = item.size;
        canvas.height = item.size;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, item.size, item.size);
          return { ...item, dataUrl: canvas.toDataURL('image/png') };
        }
        return item;
      });
      setGeneratedSizes(updated);
    };
    img.src = sourceImg;
  }, [sourceImg]);

  const htmlSnippet = useMemo(() => {
    return `<!-- Recommended Favicon HTML Tags -->
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#10b981">`;
  }, []);

  const downloadIcon = (item: FaviconSize) => {
    if (!item.dataUrl) return;
    const a = document.createElement('a');
    a.href = item.dataUrl;
    a.download = item.name;
    a.click();
  };

  const preview32 = generatedSizes.find(s => s.size === 32)?.dataUrl || sourceImg;

  return (
    <div className="space-y-4">
      {/* Upload Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-50 cursor-pointer font-semibold text-xs">
          <Upload className="w-3.5 h-3.5 text-emerald-500" />
          <span>Upload Logo / Image</span>
          <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
        </label>

        <CopyButton value={htmlSnippet} label="Copy HTML Tags" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Simulated Browser Tab Mockup */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-3">
            <span className="font-bold text-gray-700 dark:text-dark-text uppercase tracking-wider text-[11px] block">
              Simulated Browser Tab Preview
            </span>

            {/* Browser Window Mockup */}
            <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-gray-100 dark:bg-dark-bg overflow-hidden shadow-sm">
              <div className="flex items-center space-x-1.5 px-3 py-2 bg-gray-200 dark:bg-dark-border/60">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>

                {/* Tab */}
                <div className="flex items-center space-x-2 ml-4 px-3 py-1 rounded-t-lg bg-white dark:bg-dark-bg text-xs font-medium text-gray-800 dark:text-dark-text border-t border-x border-gray-200 dark:border-dark-border">
                  {preview32 ? (
                    <img src={preview32} alt="Favicon" className="w-3.5 h-3.5 rounded-sm object-contain" />
                  ) : (
                    <Globe className="w-3.5 h-3.5 text-emerald-500" />
                  )}
                  <span className="truncate max-w-[120px]">ProGit — DevOps</span>
                </div>
              </div>

              <div className="p-6 bg-white dark:bg-dark-bg/50 flex items-center justify-center min-h-[120px]">
                {preview32 ? (
                  <div className="text-center space-y-2">
                    <img src={preview32} alt="Favicon" className="w-16 h-16 mx-auto rounded-2xl shadow-md" />
                    <p className="text-xs text-gray-500 font-mono">32×32 Web Icon</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Upload image to preview tab icon</p>
                )}
              </div>
            </div>
          </div>

          {/* HTML Snippet Box */}
          <div className="p-3.5 rounded-xl bg-gray-900 border border-gray-800 text-xs font-mono text-emerald-400 space-y-2">
            <span className="text-gray-400 text-[10px] uppercase font-bold block">
              HTML &lt;head&gt; Integration Snippet
            </span>
            <pre className="overflow-x-auto text-[11px] leading-relaxed">
              <code>{htmlSnippet}</code>
            </pre>
          </div>
        </div>

        {/* Right: Generated Resolution Icons List */}
        <div className="lg:col-span-7 space-y-2.5">
          <span className="font-bold text-gray-700 dark:text-dark-text uppercase tracking-wider text-[11px] block">
            Generated Multi-Resolution Icons
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {generatedSizes.map(item => (
              <div
                key={item.name}
                className="p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg flex items-center justify-between text-xs"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-dark-border/40 flex items-center justify-center overflow-hidden border border-gray-200 dark:border-dark-border">
                    {item.dataUrl ? (
                      <img src={item.dataUrl} alt={item.name} className="max-w-full max-h-full object-contain" />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                  <div>
                    <h5 className="font-bold text-gray-800 dark:text-dark-text font-mono text-[11px]">{item.name}</h5>
                    <span className="text-[10px] text-gray-400 block">{item.desc}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => downloadIcon(item)}
                  disabled={!item.dataUrl}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-dark-border hover:bg-gray-50 text-gray-600 dark:text-dark-text disabled:opacity-30"
                  title="Download PNG"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FaviconGeneratorTool;
