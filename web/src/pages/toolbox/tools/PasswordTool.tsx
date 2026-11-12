import React, { useState, useCallback, useEffect } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { CopyButton } from '../components/ToolUI';

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?/';
const AMBIGUOUS = new Set(['0', 'O', 'o', '1', 'l', 'I']);

function secureRandomIndex(max: number): number {
  const arr = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  let r = 0;
  do {
    window.crypto.getRandomValues(arr);
    r = arr[0];
  } while (r >= limit);
  return r % max;
}

function generatePassword(
  length: number,
  opts: { upper: boolean; lower: boolean; digits: boolean; symbols: boolean; excludeAmbiguous: boolean }
): { password: string; poolSize: number } {
  const pools: string[] = [];
  const filterAmbiguous = (chars: string) =>
    opts.excludeAmbiguous ? [...chars].filter(c => !AMBIGUOUS.has(c)).join('') : chars;

  if (opts.upper) pools.push(filterAmbiguous(UPPER));
  if (opts.lower) pools.push(filterAmbiguous(LOWER));
  if (opts.digits) pools.push(filterAmbiguous(DIGITS));
  if (opts.symbols) pools.push(filterAmbiguous(SYMBOLS));

  const nonEmptyPools = pools.filter(p => p.length > 0);
  if (nonEmptyPools.length === 0) {
    return { password: '', poolSize: 0 };
  }

  const combined = nonEmptyPools.join('');
  const chars: string[] = [];

  // Guarantee at least one character from each selected character class
  for (const p of nonEmptyPools) {
    if (chars.length < length) {
      chars.push(p[secureRandomIndex(p.length)]);
    }
  }
  while (chars.length < length) {
    chars.push(combined[secureRandomIndex(combined.length)]);
  }

  // Fisher-Yates shuffle using crypto random
  for (let i = chars.length - 1; i > 0; i--) {
    const j = secureRandomIndex(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }

  return { password: chars.join(''), poolSize: combined.length };
}

export const PasswordTool: React.FC = () => {
  const [length, setLength] = useState(20);
  const [count, setCount] = useState(1);
  const [upper, setUpper] = useState(true);
  const [lower, setLower] = useState(true);
  const [digits, setDigits] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);
  const [passwords, setPasswords] = useState<string[]>([]);
  const [entropyBits, setEntropyBits] = useState(0);

  const regenerate = useCallback(() => {
    const list: string[] = [];
    let poolSize = 0;
    const clampedCount = Math.max(1, Math.min(25, count));
    for (let i = 0; i < clampedCount; i++) {
      const res = generatePassword(length, { upper, lower, digits, symbols, excludeAmbiguous });
      if (res.password) list.push(res.password);
      poolSize = res.poolSize;
    }
    setPasswords(list);
    setEntropyBits(poolSize > 1 ? Math.round(length * Math.log2(poolSize)) : 0);
  }, [length, count, upper, lower, digits, symbols, excludeAmbiguous]);

  useEffect(() => {
    regenerate();
  }, [regenerate]);

  const strength =
    entropyBits >= 90
      ? { label: 'Very Strong', color: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500 w-full' }
      : entropyBits >= 65
        ? { label: 'Strong', color: 'text-sky-600 dark:text-sky-400', bar: 'bg-sky-500 w-4/5' }
        : entropyBits >= 45
          ? { label: 'Moderate', color: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500 w-3/5' }
          : { label: 'Weak', color: 'text-red-600 dark:text-red-400', bar: 'bg-red-500 w-1/3' };

  const joined = passwords.join('\n');

  return (
    <div className="space-y-5">
      {/* Options Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-dark-muted">
              Length: <span className="text-gray-900 dark:text-white font-mono">{length}</span>
            </label>
            <input
              type="number"
              min={8}
              max={128}
              value={length}
              onChange={e => setLength(Math.max(8, Math.min(128, parseInt(e.target.value || '8', 10))))}
              className="w-16 px-2 py-1 text-xs font-mono rounded-md border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
            />
          </div>
          <input
            type="range"
            min={8}
            max={128}
            value={length}
            onChange={e => setLength(parseInt(e.target.value, 10))}
            className="w-full accent-emerald-600"
          />

          <div className="flex items-center justify-between pt-1">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-dark-muted">
              Batch Count
            </label>
            <input
              type="number"
              min={1}
              max={25}
              value={count}
              onChange={e => setCount(Math.max(1, Math.min(25, parseInt(e.target.value || '1', 10))))}
              className="w-20 px-2 py-1 text-xs font-mono rounded-md border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { label: 'Uppercase (A-Z)', checked: upper, set: setUpper },
            { label: 'Lowercase (a-z)', checked: lower, set: setLower },
            { label: 'Numbers (0-9)', checked: digits, set: setDigits },
            { label: 'Symbols (!@#$%)', checked: symbols, set: setSymbols },
          ].map(item => (
            <label
              key={item.label}
              className="flex items-center space-x-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={item.checked}
                onChange={e => item.set(e.target.checked)}
                className="accent-emerald-600 rounded"
              />
              <span className="font-medium text-gray-700 dark:text-dark-text">{item.label}</span>
            </label>
          ))}
          <label className="col-span-2 flex items-center space-x-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface cursor-pointer select-none">
            <input
              type="checkbox"
              checked={excludeAmbiguous}
              onChange={e => setExcludeAmbiguous(e.target.checked)}
              className="accent-emerald-600 rounded"
            />
            <span className="font-medium text-gray-700 dark:text-dark-text">Exclude ambiguous characters (0, O, o, 1, l, I)</span>
          </label>
        </div>
      </div>

      {/* Strength & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span className={strength.color}>{strength.label}</span>
            <span className="text-gray-400 font-mono">({entropyBits} bits entropy)</span>
          </div>
          <div className="w-28 h-1.5 bg-gray-200 dark:bg-dark-hover rounded-full overflow-hidden">
            <div className={`h-full transition-all ${strength.bar}`} />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={regenerate}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Regenerate</span>
          </button>
          <CopyButton value={joined} label={count > 1 ? 'Copy All' : 'Copy'} />
        </div>
      </div>

      {/* Generated Output */}
      {passwords.length === 0 ? (
        <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-700 dark:text-amber-300">
          Select at least one character set above to generate a password.
        </div>
      ) : (
        <div className="space-y-2">
          {passwords.map((pwd, idx) => (
            <div
              key={`${idx}-${pwd.slice(0, 6)}`}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg"
            >
              <code className="font-mono text-sm sm:text-base text-gray-900 dark:text-white break-all select-all">
                {pwd}
              </code>
              {passwords.length > 1 && <CopyButton value={pwd} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PasswordTool;
