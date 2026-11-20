export type LogSeverity = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE';

export interface ParsedLogEntry {
  id: number;
  raw: string;
  timestamp?: string;
  severity: LogSeverity;
  source?: string;
  message: string;
}

export interface LogPatternGroup {
  id: string;
  pattern: string;
  count: number;
  severity: LogSeverity;
  sample: string;
  percentage: number;
}

export function parseRawLogs(rawText: string): ParsedLogEntry[] {
  if (!rawText.trim()) return [];

  const lines = rawText.split(/\r?\n/);
  const entries: ParsedLogEntry[] = [];
  let currentEntry: ParsedLogEntry | null = null;
  let entryId = 1;

  for (const line of lines) {
    if (!line.trim()) continue;

    const detected = detectLogLine(line, entryId);
    if (detected) {
      if (currentEntry) entries.push(currentEntry);
      currentEntry = detected;
      entryId++;
    } else if (currentEntry) {
      // Continuation / stack trace line
      currentEntry.raw += '\n' + line;
      currentEntry.message += '\n' + line;
    } else {
      // First line without strict timestamp
      currentEntry = {
        id: entryId++,
        raw: line,
        severity: detectSeverity(line),
        message: line,
      };
    }
  }

  if (currentEntry) entries.push(currentEntry);
  return entries;
}

function detectLogLine(line: string, id: number): ParsedLogEntry | null {
  // ISO-8601 Timestamp format: 2026-11-20T09:15:00.123Z or 2026-11-20 09:15:00
  const isoMatch = line.match(/^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s+(?:\[(.*?)\]\s+)?(ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE)\s+(?:\[(.*?)\]\s+)?(?:\((.*?)\)\s+)?(.*)$/i);
  if (isoMatch) {
    const [, timestamp, src1, rawSev, src2, src3, message] = isoMatch;
    return {
      id,
      raw: line,
      timestamp,
      severity: normalizeSeverity(rawSev),
      source: src1 || src2 || src3 || undefined,
      message: message || '',
    };
  }

  // Syslog / Apache format: Nov 20 09:15:00 host app[123]: ...
  const syslogMatch = line.match(/^([A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2})\s+([^\s]+)\s+([^:]+):\s+(.*)$/);
  if (syslogMatch) {
    const [, timestamp, , app, message] = syslogMatch;
    return {
      id,
      raw: line,
      timestamp,
      severity: detectSeverity(line),
      source: app,
      message,
    };
  }

  // JSON log format
  if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
    try {
      const parsed = JSON.parse(line.trim());
      const ts = parsed.timestamp || parsed.time || parsed['@timestamp'] || parsed.date;
      const level = parsed.level || parsed.severity || parsed.log_level || 'INFO';
      const msg = parsed.message || parsed.msg || parsed.log || line;
      return {
        id,
        raw: line,
        timestamp: ts ? String(ts) : undefined,
        severity: normalizeSeverity(String(level)),
        source: parsed.service || parsed.logger || parsed.name,
        message: typeof msg === 'object' ? JSON.stringify(msg) : String(msg),
      };
    } catch {
      // Not valid JSON, continue
    }
  }

  return null;
}

function normalizeSeverity(sev: string): LogSeverity {
  const upper = sev.toUpperCase();
  if (upper.includes('ERR') || upper.includes('FATAL') || upper.includes('CRIT')) return 'ERROR';
  if (upper.includes('WARN')) return 'WARN';
  if (upper.includes('DEBUG')) return 'DEBUG';
  if (upper.includes('TRACE')) return 'TRACE';
  return 'INFO';
}

function detectSeverity(text: string): LogSeverity {
  const upper = text.toUpperCase();
  if (/\b(ERROR|FATAL|EXCEPTION|CRITICAL|PANIC|FAIL)\b/.test(upper)) return 'ERROR';
  if (/\b(WARN|WARNING)\b/.test(upper)) return 'WARN';
  if (/\b(DEBUG)\b/.test(upper)) return 'DEBUG';
  if (/\b(TRACE)\b/.test(upper)) return 'TRACE';
  return 'INFO';
}

// Log Pattern Extractor: Replaces dynamic variables with placeholder tokens
export function extractLogPatterns(entries: ParsedLogEntry[]): LogPatternGroup[] {
  if (entries.length === 0) return [];

  const patternMap = new Map<string, { count: number; sample: string; severity: LogSeverity }>();

  for (const entry of entries) {
    const abstracted = abstractLogMessage(entry.message || entry.raw);
    const existing = patternMap.get(abstracted);
    if (existing) {
      existing.count++;
      if (entry.severity === 'ERROR') existing.severity = 'ERROR';
    } else {
      patternMap.set(abstracted, {
        count: 1,
        sample: entry.raw.split('\n')[0],
        severity: entry.severity,
      });
    }
  }

  const total = entries.length;
  const groups: LogPatternGroup[] = [];
  let groupId = 1;

  for (const [pattern, val] of patternMap.entries()) {
    groups.push({
      id: `p-${groupId++}`,
      pattern,
      count: val.count,
      severity: val.severity,
      sample: val.sample,
      percentage: Math.round((val.count / total) * 1000) / 10,
    });
  }

  groups.sort((a, b) => b.count - a.count);
  return groups;
}

export function abstractLogMessage(msg: string): string {
  const firstLine = msg.split('\n')[0].trim();
  return firstLine
    // UUIDs
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '<UUID>')
    // IPv4 & IPv6
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?\b/g, '<IP>')
    .replace(/(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}/g, '<IPV6>')
    // Timestamps ISO/Syslog
    .replace(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '<TIMESTAMP>')
    // URLs
    .replace(/https?:\/\/[^\s"'>]+/g, '<URL>')
    // Hex hashes (SHA-256 / SHA-1)
    .replace(/\b[0-9a-fA-F]{24,64}\b/g, '<HASH>')
    // Quoted strings
    .replace(/"[^"]*"/g, '"<STR>"')
    .replace(/'[^']*'/g, "'<STR>'")
    // File paths
    .replace(/(?:\/[a-zA-Z0-9._-]+)+/g, '<PATH>')
    // Floating point / integers
    .replace(/\b\d+\.\d+\b/g, '<FLOAT>')
    .replace(/\b\d{2,}\b/g, '<NUM>')
    .replace(/\s+/g, ' ')
    .trim();
}
