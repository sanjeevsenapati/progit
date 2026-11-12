import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, AlertCircle, ChevronDown } from 'lucide-react';

export const CopyButton: React.FC<{
  value: string;
  label?: string;
  className?: string;
  disabled?: boolean;
}> = ({ value, label = 'Copy', className = '', disabled = false }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value || disabled) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={disabled || !value}
      className={`inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer ${className}`}
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
};

export const ToolError: React.FC<{ error: string | null }> = ({ error }) => {
  if (!error) return null;
  return (
    <div className="flex items-start space-x-2 p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-xs">
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span className="font-mono break-all">{error}</span>
    </div>
  );
};

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

export const ThemedSelect: React.FC<{
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  align?: 'left' | 'right';
  buttonClassName?: string;
  menuWidthClass?: string;
}> = ({
  value,
  options,
  onChange,
  ariaLabel,
  align = 'left',
  buttonClassName = '',
  menuWidthClass = 'min-w-[12rem]',
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value) || options[0];

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen(prev => !prev)}
        className={`inline-flex items-center justify-between space-x-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-hover text-xs font-semibold text-gray-800 dark:text-dark-text focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer ${buttonClassName}`}
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${
            open ? 'rotate-180 text-emerald-500' : ''
          }`}
        />
      </button>

      {open && (
        <div
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} mt-1.5 ${menuWidthClass} max-h-72 overflow-y-auto rounded-xl shadow-xl ring-1 ring-black/5 dark:ring-white/5 p-1.5 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border z-50 space-y-0.5`}
        >
          {options.map(opt => {
            const isActive = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold'
                    : 'text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover font-medium'
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate">{opt.label}</div>
                  {opt.hint && (
                    <div className="text-[11px] text-gray-400 dark:text-dark-muted truncate">
                      {opt.hint}
                    </div>
                  )}
                </div>
                {isActive && <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
