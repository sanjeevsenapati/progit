import React, { useMemo, useState } from 'react';
import { Copy, Plus, Sparkles, Trash2 } from 'lucide-react';
import { CopyButton, ThemedSelect } from '../components/ToolUI';

interface ColorStop {
  id: string;
  color: string;
  pos: number;
}

const PRESET_GRADIENTS: Record<string, { label: string; type: 'linear' | 'radial' | 'conic'; angle: number; stops: ColorStop[] }> = {
  emeraldSea: {
    label: 'Emerald Aura',
    type: 'linear',
    angle: 135,
    stops: [
      { id: '1', color: '#10b981', pos: 0 },
      { id: '2', color: '#047857', pos: 50 },
      { id: '3', color: '#064e3b', pos: 100 },
    ],
  },
  hyper: {
    label: 'Hyper Neon',
    type: 'linear',
    angle: 90,
    stops: [
      { id: '1', color: '#ec4899', pos: 0 },
      { id: '2', color: '#8b5cf6', pos: 50 },
      { id: '3', color: '#3b82f6', pos: 100 },
    ],
  },
  sunset: {
    label: 'Sunset Glow',
    type: 'linear',
    angle: 45,
    stops: [
      { id: '1', color: '#f59e0b', pos: 0 },
      { id: '2', color: '#ef4444', pos: 50 },
      { id: '3', color: '#7c3aed', pos: 100 },
    ],
  },
  oceanic: {
    label: 'Oceanic Blue',
    type: 'radial',
    angle: 0,
    stops: [
      { id: '1', color: '#38bdf8', pos: 0 },
      { id: '2', color: '#0284c7', pos: 60 },
      { id: '3', color: '#0c4a6e', pos: 100 },
    ],
  },
};

export const CssGradientTool: React.FC = () => {
  const [gradientType, setGradientType] = useState<'linear' | 'radial' | 'conic'>('linear');
  const [angle, setAngle] = useState<number>(135);
  const [stops, setStops] = useState<ColorStop[]>(PRESET_GRADIENTS.emeraldSea.stops);
  const [presetKey, setPresetKey] = useState<string>('emeraldSea');

  const cssString = useMemo(() => {
    const sortedStops = [...stops].sort((a, b) => a.pos - b.pos);
    const stopsStr = sortedStops.map(s => `${s.color} ${s.pos}%`).join(', ');

    if (gradientType === 'linear') {
      return `linear-gradient(${angle}deg, ${stopsStr})`;
    }
    if (gradientType === 'radial') {
      return `radial-gradient(circle at center, ${stopsStr})`;
    }
    return `conic-gradient(from ${angle}deg, ${stopsStr})`;
  }, [gradientType, angle, stops]);

  const addStop = () => {
    if (stops.length >= 6) return;
    const newStop: ColorStop = {
      id: `stop-${Date.now()}`,
      color: '#ffffff',
      pos: Math.round(stops[stops.length - 1].pos / 2),
    };
    setStops(prev => [...prev, newStop]);
  };

  const removeStop = (id: string) => {
    if (stops.length <= 2) return;
    setStops(prev => prev.filter(s => s.id !== id));
  };

  const updateStopColor = (id: string, color: string) => {
    setStops(prev => prev.map(s => (s.id === id ? { ...s, color } : s)));
  };

  const updateStopPos = (id: string, pos: number) => {
    setStops(prev => prev.map(s => (s.id === id ? { ...s, pos } : s)));
  };

  return (
    <div className="space-y-4">
      {/* Top Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-gray-500">Preset:</span>
          <div className="w-52">
            <ThemedSelect
              value={presetKey}
              onChange={val => {
                setPresetKey(val);
                if (PRESET_GRADIENTS[val]) {
                  setGradientType(PRESET_GRADIENTS[val].type);
                  setAngle(PRESET_GRADIENTS[val].angle);
                  setStops(PRESET_GRADIENTS[val].stops);
                }
              }}
              options={Object.entries(PRESET_GRADIENTS).map(([k, v]) => ({ value: k, label: v.label }))}
            />
          </div>

          <div className="inline-flex rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg p-0.5">
            {(['linear', 'radial', 'conic'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setGradientType(t)}
                className={`px-2.5 py-1 rounded text-xs font-semibold capitalize ${
                  gradientType === t
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-600 dark:text-dark-muted hover:text-gray-900'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <CopyButton value={`background: ${cssString};`} label="Copy CSS" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Interactive Preview */}
        <div className="lg:col-span-6 space-y-3">
          <div
            className="h-64 rounded-2xl border border-gray-200 dark:border-dark-border shadow-inner flex flex-col items-center justify-center p-6 text-white text-center relative overflow-hidden transition-all"
            style={{ background: cssString }}
          >
            <div className="bg-black/30 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20">
              <h4 className="font-bold text-sm">ProGit Gradient Preview</h4>
              <p className="text-[11px] opacity-80 mt-0.5 font-mono">{cssString}</p>
            </div>
          </div>

          {/* Angle Slider (Linear / Conic) */}
          {gradientType !== 'radial' && (
            <div className="p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-1.5 text-xs">
              <div className="flex justify-between font-semibold text-gray-700 dark:text-dark-text">
                <span>Gradient Angle</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{angle}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                value={angle}
                onChange={e => setAngle(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 dark:bg-dark-border rounded-lg appearance-none cursor-pointer"
              />
            </div>
          )}

          {/* Generated CSS Snippet */}
          <div className="p-3 rounded-xl bg-gray-900 text-emerald-400 font-mono text-xs border border-gray-800 break-all leading-relaxed">
            <code>background: {cssString};</code>
          </div>
        </div>

        {/* Right: Color Stops Editor */}
        <div className="lg:col-span-6 space-y-3">
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-700 dark:text-dark-text uppercase tracking-wider text-[11px]">
                Color Stops ({stops.length}/6)
              </span>
              <button
                type="button"
                onClick={addStop}
                disabled={stops.length >= 6}
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Stop</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {stops.map(s => (
                <div
                  key={s.id}
                  className="p-3 rounded-xl border border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-dark-border/20 flex items-center space-x-3"
                >
                  <input
                    type="color"
                    value={s.color}
                    onChange={e => updateStopColor(s.id, e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                  />

                  <input
                    type="text"
                    value={s.color}
                    onChange={e => updateStopColor(s.id, e.target.value)}
                    className="w-24 p-1.5 font-mono text-xs font-bold rounded border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-800 dark:text-dark-text uppercase"
                  />

                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between text-[11px] text-gray-500 font-mono">
                      <span>Position</span>
                      <span>{s.pos}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={s.pos}
                      onChange={e => updateStopPos(s.id, Number(e.target.value))}
                      className="w-full h-1.5 bg-gray-200 dark:bg-dark-border rounded appearance-none cursor-pointer"
                    />
                  </div>

                  {stops.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeStop(s.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                      title="Remove Stop"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CssGradientTool;
