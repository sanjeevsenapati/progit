// Pure TypeScript Cron parser for 5-field Linux + @macros and 6-field Quartz/Spring

export interface CronParseResult {
  valid: boolean;
  dialect: 'linux-5' | 'quartz-6';
  normalized: string;
  description: string;
  nextRuns: Date[];
  error?: string;
}

const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DOW_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

const DOW_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_LABELS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface FieldSpec {
  values: Set<number>;
  wildcard: boolean;
  raw: string;
}

function parseValue(token: string, min: number, max: number, names?: Record<string, number>): number {
  const lower = token.toLowerCase();
  if (names && lower in names) {
    return names[lower];
  }
  if (!/^\d+$/.test(token)) {
    throw new Error(`Invalid token "${token}"`);
  }
  let n = parseInt(token, 10);
  // Convert 7 to 0 for Sunday when max === 7 (DOW)
  if (max === 7 && n === 7) {
    n = 0;
  }
  if (n < min || n > max) {
    throw new Error(`Value ${n} out of range [${min}, ${max}]`);
  }
  return n;
}

function parseField(raw: string, min: number, max: number, names?: Record<string, number>): FieldSpec {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Empty cron field');

  // Support Quartz '?' as wildcard for DOM/DOW
  if (trimmed === '*' || trimmed === '?') {
    const all = new Set<number>();
    const cap = max === 7 ? 6 : max;
    for (let i = min; i <= cap; i++) all.add(i);
    return { values: all, wildcard: true, raw: trimmed };
  }

  const values = new Set<number>();
  const parts = trimmed.split(',');

  for (const part of parts) {
    if (!part) throw new Error(`Malformed list in "${trimmed}"`);
    const [rangePart, stepPart] = part.split('/');
    if (part.split('/').length > 2) {
      throw new Error(`Invalid step syntax "${part}"`);
    }

    let step = 1;
    if (stepPart !== undefined) {
      if (!/^\d+$/.test(stepPart) || parseInt(stepPart, 10) <= 0) {
        throw new Error(`Invalid step "${stepPart}"`);
      }
      step = parseInt(stepPart, 10);
    }

    let start: number;
    let end: number;

    if (rangePart === '*' || rangePart === '?') {
      start = min;
      end = max === 7 ? 6 : max;
    } else if (rangePart.includes('-')) {
      const bounds = rangePart.split('-');
      if (bounds.length !== 2) throw new Error(`Invalid range "${rangePart}"`);
      start = parseValue(bounds[0], min, max, names);
      end = parseValue(bounds[1], min, max, names);
      if (max === 7 && end === 0 && bounds[1] === '7') {
        // e.g. 5-7 -> Fri, Sat, Sun
        for (let v = start; v <= 6; v += step) values.add(v);
        if ((7 - start) % step === 0) values.add(0);
        continue;
      }
      if (start > end) {
        throw new Error(`Range start ${start} > end ${end} in "${rangePart}"`);
      }
    } else {
      const single = parseValue(rangePart, min, max, names);
      if (stepPart !== undefined) {
        start = single;
        end = max === 7 ? 6 : max;
      } else {
        values.add(single);
        continue;
      }
    }

    for (let v = start; v <= end; v += step) {
      values.add(max === 7 && v === 7 ? 0 : v);
    }
  }

  if (values.size === 0) {
    throw new Error(`Field "${trimmed}" matched no values`);
  }

  return { values, wildcard: false, raw: trimmed };
}

function describeFieldList(spec: FieldSpec, formatter?: (n: number) => string): string {
  const arr = Array.from(spec.values).sort((a, b) => a - b);
  return arr.map(v => (formatter ? formatter(v) : String(v))).join(', ');
}

function buildDescription(
  dialect: 'linux-5' | 'quartz-6',
  sec: FieldSpec | null,
  min: FieldSpec,
  hour: FieldSpec,
  dom: FieldSpec,
  month: FieldSpec,
  dow: FieldSpec
): string {
  const parts: string[] = [];

  if (dialect === 'quartz-6' && sec && !sec.wildcard) {
    if (sec.raw.startsWith('*/')) {
      parts.push(`Every ${sec.raw.slice(2)} seconds`);
    } else if (sec.values.size === 1 && Array.from(sec.values)[0] === 0) {
      // Standard top-of-minute
    } else {
      parts.push(`At second ${describeFieldList(sec)}`);
    }
  }

  if (min.wildcard && hour.wildcard) {
    parts.push(dialect === 'quartz-6' && sec && !sec.wildcard ? 'of every minute' : 'Every minute');
  } else if (min.raw.startsWith('*/') && hour.wildcard) {
    parts.push(`Every ${min.raw.slice(2)} minutes`);
  } else if (!min.wildcard && hour.wildcard) {
    parts.push(`At minute ${describeFieldList(min)} past every hour`);
  } else if (!min.wildcard && !hour.wildcard && min.values.size === 1 && hour.values.size === 1) {
    const h = Array.from(hour.values)[0];
    const m = Array.from(min.values)[0];
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    parts.push(`At ${hh}:${mm}`);
  } else {
    const minStr = min.wildcard ? 'every minute' : `minute ${describeFieldList(min)}`;
    const hrStr = hour.wildcard
      ? 'every hour'
      : hour.raw.startsWith('*/')
        ? `every ${hour.raw.slice(2)} hours`
        : `hour ${describeFieldList(hour)}`;
    parts.push(`At ${minStr} past ${hrStr}`);
  }

  if (!dom.wildcard) {
    parts.push(`on day ${describeFieldList(dom)} of the month`);
  }
  if (!month.wildcard) {
    parts.push(`in ${describeFieldList(month, v => MONTH_LABELS[v] || String(v))}`);
  }
  if (!dow.wildcard) {
    parts.push(`on ${describeFieldList(dow, v => DOW_LABELS[v] || String(v))}`);
  }

  return parts.join(', ');
}

export function parseCronExpression(expr: string, timezone: 'local' | 'utc' = 'local', count = 10): CronParseResult {
  const trimmed = expr.trim();
  if (!trimmed) {
    return {
      valid: false,
      dialect: 'linux-5',
      normalized: '',
      description: '',
      nextRuns: [],
      error: 'Enter a cron expression to evaluate.',
    };
  }

  const expanded = MACROS[trimmed.toLowerCase()] || trimmed;
  const fields = expanded.split(/\s+/);

  if (fields.length !== 5 && fields.length !== 6) {
    return {
      valid: false,
      dialect: fields.length === 6 ? 'quartz-6' : 'linux-5',
      normalized: expanded,
      description: '',
      nextRuns: [],
      error: `Expected 5 fields (Linux) or 6 fields (Quartz/Spring), got ${fields.length}.`,
    };
  }

  try {
    const isQuartz = fields.length === 6;
    const dialect: 'linux-5' | 'quartz-6' = isQuartz ? 'quartz-6' : 'linux-5';

    const secSpec = isQuartz ? parseField(fields[0], 0, 59) : null;
    const offset = isQuartz ? 1 : 0;

    const minSpec = parseField(fields[offset], 0, 59);
    const hourSpec = parseField(fields[offset + 1], 0, 23);
    const domSpec = parseField(fields[offset + 2], 1, 31);
    const monthSpec = parseField(fields[offset + 3], 1, 12, MONTH_NAMES);
    const dowSpec = parseField(fields[offset + 4], 0, 7, DOW_NAMES);

    const dayMatch = (dayOfMonth: number, dayOfWeek: number): boolean => {
      if (domSpec.wildcard && dowSpec.wildcard) return true;
      if (domSpec.wildcard) return dowSpec.values.has(dayOfWeek);
      if (dowSpec.wildcard) return domSpec.values.has(dayOfMonth);
      // Standard cron OR semantics when both DOM and DOW are restricted
      return domSpec.values.has(dayOfMonth) || dowSpec.values.has(dayOfWeek);
    };

    const nextRuns: Date[] = [];
    const now = new Date();
    const cursor = new Date(now.getTime());

    if (isQuartz) {
      cursor.setUTCMilliseconds(0);
      cursor.setTime(cursor.getTime() + 1000);
    } else {
      if (timezone === 'utc') {
        cursor.setUTCSeconds(0, 0);
      } else {
        cursor.setSeconds(0, 0);
      }
      cursor.setTime(cursor.getTime() + 60000);
    }

    // Bounded search (max 4 years ahead or ~150k steps)
    const maxLimitMs = now.getTime() + 4 * 365 * 24 * 3600 * 1000;
    let steps = 0;

    const getParts = (d: Date) =>
      timezone === 'utc'
        ? {
            year: d.getUTCFullYear(),
            month: d.getUTCMonth() + 1,
            dom: d.getUTCDate(),
            dow: d.getUTCDay(),
            hour: d.getUTCHours(),
            min: d.getUTCMinutes(),
            sec: d.getUTCSeconds(),
          }
        : {
            year: d.getFullYear(),
            month: d.getMonth() + 1,
            dom: d.getDate(),
            dow: d.getDay(),
            hour: d.getHours(),
            min: d.getMinutes(),
            sec: d.getSeconds(),
          };

    while (nextRuns.length < count && cursor.getTime() < maxLimitMs && steps < 250000) {
      steps++;
      const p = getParts(cursor);

      if (!monthSpec.values.has(p.month)) {
        // Jump to next day/start of next hour cleanly
        if (timezone === 'utc') {
          cursor.setUTCDate(cursor.getUTCDate() + 1);
          cursor.setUTCHours(0, 0, 0, 0);
        } else {
          cursor.setDate(cursor.getDate() + 1);
          cursor.setHours(0, 0, 0, 0);
        }
        continue;
      }

      if (!dayMatch(p.dom, p.dow)) {
        if (timezone === 'utc') {
          cursor.setUTCDate(cursor.getUTCDate() + 1);
          cursor.setUTCHours(0, 0, 0, 0);
        } else {
          cursor.setDate(cursor.getDate() + 1);
          cursor.setHours(0, 0, 0, 0);
        }
        continue;
      }

      if (!hourSpec.values.has(p.hour)) {
        if (timezone === 'utc') {
          cursor.setUTCHours(cursor.getUTCHours() + 1, 0, 0, 0);
        } else {
          cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
        }
        continue;
      }

      if (!minSpec.values.has(p.min)) {
        if (timezone === 'utc') {
          cursor.setUTCMinutes(cursor.getUTCMinutes() + 1, 0, 0);
        } else {
          cursor.setMinutes(cursor.getMinutes() + 1, 0, 0);
        }
        continue;
      }

      if (secSpec && !secSpec.values.has(p.sec)) {
        cursor.setTime(cursor.getTime() + 1000);
        continue;
      }

      nextRuns.push(new Date(cursor.getTime()));
      cursor.setTime(cursor.getTime() + (isQuartz ? 1000 : 60000));
    }

    return {
      valid: true,
      dialect,
      normalized: expanded,
      description: buildDescription(dialect, secSpec, minSpec, hourSpec, domSpec, monthSpec, dowSpec),
      nextRuns,
    };
  } catch (err: unknown) {
    return {
      valid: false,
      dialect: fields.length === 6 ? 'quartz-6' : 'linux-5',
      normalized: expanded,
      description: '',
      nextRuns: [],
      error: err instanceof Error ? err.message : 'Invalid cron expression',
    };
  }
}
