import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface MenuCoords {
  top?: number;
  bottom?: number;
  left: number;
  minWidth: number;
  maxHeight: number;
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
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value) || options[0];

  const updatePosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const gap = 6;
    const margin = 8;
    const preferredMaxHeight = 288; // Tailwind max-h-72

    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - gap - margin);
    const spaceAbove = Math.max(0, rect.top - gap - margin);
    const measuredHeight = menuRef.current
      ? Math.min(menuRef.current.scrollHeight + 4, preferredMaxHeight)
      : Math.min(options.length * 36 + 16, preferredMaxHeight);

    const openUpward = spaceBelow < measuredHeight && spaceAbove > spaceBelow;
    const maxHeight = Math.min(
      preferredMaxHeight,
      Math.max(120, openUpward ? spaceAbove : spaceBelow)
    );

    const menuWidth = menuRef.current
      ? Math.max(menuRef.current.offsetWidth, rect.width)
      : Math.max(rect.width, 192);

    let left = align === 'right' ? rect.right - menuWidth : rect.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - menuWidth - margin));

    if (openUpward) {
      setCoords({
        bottom: window.innerHeight - rect.top + gap,
        left,
        minWidth: rect.width,
        maxHeight,
      });
    } else {
      setCoords({
        top: rect.bottom + gap,
        left,
        minWidth: rect.width,
        maxHeight,
      });
    }
  }, [align, options.length]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updatePosition();
    const raf = window.requestAnimationFrame(updatePosition);
    return () => window.cancelAnimationFrame(raf);
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        rootRef.current &&
        !rootRef.current.contains(target) &&
        (!menuRef.current || !menuRef.current.contains(target))
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onReposition = () => updatePosition();

    document.addEventListener('mousedown', onDocMouseDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, updatePosition]);

  const menuNode =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{
              position: 'fixed',
              top: coords?.top,
              bottom: coords?.bottom,
              left: coords?.left ?? -9999,
              minWidth: coords?.minWidth,
              maxHeight: coords?.maxHeight ?? 288,
              zIndex: 9999,
              visibility: coords ? 'visible' : 'hidden',
            }}
            className={`${menuWidthClass} overflow-y-auto rounded-xl shadow-xl ring-1 ring-black/5 dark:ring-white/5 p-1.5 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border space-y-0.5`}
          >
            {options.map(opt => {
              const isActive = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isActive}
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
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
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

      {menuNode}
    </div>
  );
};
