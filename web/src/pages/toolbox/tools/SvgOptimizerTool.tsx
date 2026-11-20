import React, { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Download, Eye, Sparkles, Upload } from 'lucide-react';
import { CopyButton, ToolError } from '../components/ToolUI';

const SAMPLE_SVG = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Created with Inkscape (http://www.inkscape.org/) -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" viewBox="0 0 100 100" width="100.000000" height="100.000000">
  <sodipodi:namedview id="base" pagecolor="#ffffff" bordercolor="#666666" />
  <metadata id="metadata5">
    <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
      <cc:Work xmlns:cc="http://creativecommons.org/ns#">
        <dc:format xmlns:dc="http://purl.org/dc/elements/1.1/">image/svg+xml</dc:format>
      </cc:Work>
    </rdf:RDF>
  </metadata>
  <g id="layer1" inkscape:groupmode="layer" inkscape:label="Layer 1">
    <circle cx="50.000000" cy="50.000000" r="42.500000" fill="#10b981" stroke="#047857" stroke-width="4.000000" />
    <path d="M 32.500000 50.000000 L 45.000000 62.500000 L 67.500000 37.500000" fill="none" stroke="#ffffff" stroke-width="6.000000" stroke-linecap="round" stroke-linejoin="round" />
  </g>
</svg>`;

export const SvgOptimizerTool: React.FC = () => {
  const [inputSvg, setInputSvg] = useState<string>(SAMPLE_SVG);
  const [removeComments, setRemoveComments] = useState<boolean>(true);
  const [removeMetadata, setRemoveMetadata] = useState<boolean>(true);
  const [removeEditorNamespaces, setRemoveEditorNamespaces] = useState<boolean>(true);
  const [roundDecimals, setRoundDecimals] = useState<number>(2);

  const { optimizedSvg, origBytes, optBytes, savingsPct, error } = useMemo(() => {
    const raw = inputSvg.trim();
    if (!raw) return { optimizedSvg: '', origBytes: 0, optBytes: 0, savingsPct: 0, error: null };

    try {
      let result = raw;

      // 1. Remove XML declaration & DOCTYPE
      result = result.replace(/<\?xml[\s\S]*?\?>/gi, '');
      result = result.replace(/<!DOCTYPE[\s\S]*?>/gi, '');

      // 2. Remove comments
      if (removeComments) {
        result = result.replace(/<!--[\s\S]*?-->/g, '');
      }

      // 3. Remove metadata, sodipodi, rdf tags
      if (removeMetadata) {
        result = result.replace(/<metadata[\s\S]*?<\/metadata>/gi, '');
        result = result.replace(/<sodipodi:namedview[\s\S]*?\/>/gi, '');
        result = result.replace(/<defs[\s\S]*?<\/defs>/gi, m => (m.trim() === '<defs></defs>' ? '' : m));
      }

      // 4. Remove editor namespace attributes (inkscape:*, sodipodi:*, xmlns:inkscape, etc.)
      if (removeEditorNamespaces) {
        result = result.replace(/\s+(?:xmlns:inkscape|xmlns:sodipodi|xmlns:sketch|xmlns:illustrator)="[^"]*"/gi, '');
        result = result.replace(/\s+(?:inkscape:[a-zA-Z-]+|sodipodi:[a-zA-Z-]+)="[^"]*"/gi, '');
      }

      // 5. Round numeric values in coordinates
      if (roundDecimals >= 0) {
        const factor = Math.pow(10, roundDecimals);
        result = result.replace(/(\d+\.\d{3,})/g, match => {
          const num = parseFloat(match);
          return (Math.round(num * factor) / factor).toString();
        });
      }

      // 6. Security sanitization: Strip dangerous script and event handler injection
      result = result
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');

      // 7. Minify whitespace
      result = result
        .replace(/>\s+</g, '><')
        .replace(/\s{2,}/g, ' ')
        .trim();

      const oBytes = new Blob([raw]).size;
      const nBytes = new Blob([result]).size;
      const pct = oBytes > 0 ? Math.round(((oBytes - nBytes) / oBytes) * 1000) / 10 : 0;

      return {
        optimizedSvg: result,
        origBytes: oBytes,
        optBytes: nBytes,
        savingsPct: pct,
        error: null,
      };
    } catch (err: any) {
      return { optimizedSvg: '', origBytes: 0, optBytes: 0, savingsPct: 0, error: err.message };
    }
  }, [inputSvg, removeComments, removeMetadata, removeEditorNamespaces, roundDecimals]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      if (typeof ev.target?.result === 'string') {
        setInputSvg(ev.target.result);
      }
    };
    reader.readAsText(file);
  };

  const handleDownload = () => {
    if (!optimizedSvg) return;
    const blob = new Blob([optimizedSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `optimized-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Top Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-50 cursor-pointer font-semibold">
            <Upload className="w-3.5 h-3.5 text-emerald-500" />
            <span>Upload SVG</span>
            <input type="file" accept=".svg" onChange={handleFileUpload} className="hidden" />
          </label>

          <button
            type="button"
            onClick={handleDownload}
            disabled={!optimizedSvg}
            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download SVG</span>
          </button>
        </div>

        <CopyButton value={optimizedSvg} label="Copy Optimized SVG" />
      </div>

      {/* Optimization Metric Badges */}
      <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center space-x-3">
          <div>
            <span className="text-gray-400 block text-[11px]">Original Size</span>
            <span className="font-mono font-bold text-gray-700 dark:text-dark-text">{origBytes} B</span>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400" />
          <div>
            <span className="text-gray-400 block text-[11px]">Optimized Size</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{optBytes} B</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500">Savings:</span>
          <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            -{savingsPct}% ({origBytes - optBytes} B saved)
          </span>
        </div>
      </div>

      {/* Editor & Preview Panes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Input SVG */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500 px-1">
            <span className="font-semibold uppercase tracking-wider">Raw SVG Markup</span>
            <span>{origBytes} bytes</span>
          </div>
          <textarea
            value={inputSvg}
            onChange={e => setInputSvg(e.target.value)}
            rows={16}
            className="w-full font-mono text-xs p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y leading-relaxed"
          />
        </div>

        {/* Right: Live Preview & Clean Code */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-gray-500 px-1">
              <span className="font-semibold uppercase tracking-wider flex items-center space-x-1.5">
                <Eye className="w-3.5 h-3.5 text-emerald-500" />
                <span>Rendered Vector Preview</span>
              </span>
            </div>

            <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg h-48 flex items-center justify-center overflow-hidden">
              {optimizedSvg ? (
                <img
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(optimizedSvg)}`}
                  alt="Optimized SVG preview"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <p className="text-xs text-gray-400">Invalid SVG</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-gray-500 px-1">
              <span className="font-semibold uppercase tracking-wider">Optimized Markup</span>
              <span>{optBytes} bytes</span>
            </div>
            <pre className="p-3.5 rounded-xl bg-gray-900 text-emerald-400 font-mono text-xs overflow-x-auto border border-gray-800 max-h-48 leading-relaxed">
              <code>{optimizedSvg}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SvgOptimizerTool;
