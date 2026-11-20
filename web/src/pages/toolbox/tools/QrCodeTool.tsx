import React, { useMemo, useState } from 'react';
import { Download, Globe, Mail, Phone, QrCode, Sparkles, Type, Wifi } from 'lucide-react';
import { CopyButton, ThemedSelect } from '../components/ToolUI';
import { QrErrorCorrectionLevel, generateQrMatrix, qrMatrixToSvg } from '../lib/qrcode';

type DataType = 'url' | 'text' | 'wifi' | 'email';

export const QrCodeTool: React.FC = () => {
  const [dataType, setDataType] = useState<DataType>('url');
  const [textVal, setTextVal] = useState<string>('https://progit.dev');
  const [ecLevel, setEcLevel] = useState<QrErrorCorrectionLevel>('M');
  const [fgColor, setFgColor] = useState<string>('#000000');
  const [bgColor, setBgColor] = useState<string>('#ffffff');

  // WiFi helper state
  const [wifiSsid, setWifiSsid] = useState('Office-ProGit');
  const [wifiPass, setWifiPass] = useState('SecurePass2026');
  const [wifiAuth, setWifiAuth] = useState('WPA');

  // Compute payload text
  const payload = useMemo(() => {
    if (dataType === 'wifi') {
      return `WIFI:S:${wifiSsid};T:${wifiAuth};P:${wifiPass};;`;
    }
    return textVal;
  }, [dataType, textVal, wifiSsid, wifiPass, wifiAuth]);

  // Generate SVG string
  const svgString = useMemo(() => {
    try {
      const matrix = generateQrMatrix(payload || 'progit', ecLevel);
      return qrMatrixToSvg(matrix, fgColor, bgColor, 4, 8);
    } catch {
      return '';
    }
  }, [payload, ecLevel, fgColor, bgColor]);

  const handleDownloadSvg = () => {
    if (!svgString) return;
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qrcode-${Date.now()}.svg`;
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
      canvas.width = 600;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, 600, 600);
        ctx.drawImage(img, 0, 0, 600, 600);
        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `qrcode-${Date.now()}.png`;
        a.click();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <div className="space-y-4">
      {/* Type Selector Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { id: 'url', label: 'Website URL', icon: Globe },
            { id: 'text', label: 'Plain Text', icon: Type },
            { id: 'wifi', label: 'Wi-Fi Network', icon: Wifi },
          ].map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setDataType(t.id as DataType)}
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  dataType === t.id
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
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
        {/* Left: Configuration Inputs */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-3 text-xs">
            {dataType === 'wifi' ? (
              <div className="space-y-3">
                <div>
                  <label className="font-semibold text-gray-700 dark:text-dark-text block mb-1">Wi-Fi SSID</label>
                  <input
                    type="text"
                    value={wifiSsid}
                    onChange={e => setWifiSsid(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-700 dark:text-dark-text block mb-1">Password</label>
                  <input
                    type="text"
                    value={wifiPass}
                    onChange={e => setWifiPass(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="font-semibold text-gray-700 dark:text-dark-text block mb-1">
                  {dataType === 'url' ? 'Target Web URL' : 'Text Content'}
                </label>
                <textarea
                  value={textVal}
                  onChange={e => setTextVal(e.target.value)}
                  rows={4}
                  className="w-full font-mono text-xs p-3 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            )}

            {/* Error Correction & Colors */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-gray-100 dark:border-dark-border">
              <div>
                <label className="font-semibold text-gray-500 block mb-1">EC Level</label>
                <ThemedSelect
                  value={ecLevel}
                  onChange={v => setEcLevel(v as QrErrorCorrectionLevel)}
                  options={[
                    { value: 'L', label: 'Low (7%)' },
                    { value: 'M', label: 'Medium (15%)' },
                    { value: 'Q', label: 'Quartile (25%)' },
                    { value: 'H', label: 'High (30%)' },
                  ]}
                />
              </div>

              <div>
                <label className="font-semibold text-gray-500 block mb-1">Foreground</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={fgColor}
                    onChange={e => setFgColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                  />
                  <input
                    type="text"
                    value={fgColor}
                    onChange={e => setFgColor(e.target.value)}
                    className="w-full p-1.5 font-mono text-xs rounded border border-gray-200 dark:border-dark-border uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-gray-500 block mb-1">Background</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={bgColor}
                    onChange={e => setBgColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                  />
                  <input
                    type="text"
                    value={bgColor}
                    onChange={e => setBgColor(e.target.value)}
                    className="w-full p-1.5 font-mono text-xs rounded border border-gray-200 dark:border-dark-border uppercase"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Live QR Code Preview */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-3">
          <div
            className="p-4 rounded-xl border border-gray-100 dark:border-dark-border shadow-sm flex items-center justify-center"
            style={{ backgroundColor: bgColor }}
          >
            {svgString ? (
              <div
                className="w-56 h-56 flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: svgString }}
              />
            ) : (
              <p className="text-xs text-gray-400">Rendering QR Code...</p>
            )}
          </div>

          <span className="text-[11px] font-mono text-gray-400 text-center">
            ISO/IEC 18004 Standard QR Matrix
          </span>
        </div>
      </div>
    </div>
  );
};

export default QrCodeTool;
