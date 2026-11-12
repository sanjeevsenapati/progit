import React, { lazy } from 'react';

export type ToolboxCategoryId =
  | 'security'
  | 'formatters'
  | 'network'
  | 'cron-time'
  | 'converters'
  | 'text-code';

export interface ToolboxCategoryMeta {
  id: ToolboxCategoryId;
  name: string;
  subtitle: string;
  accentClass: string;
}

export interface ToolboxToolMeta {
  id: string;
  name: string;
  shortName: string;
  category: ToolboxCategoryId;
  description: string;
  keywords: string[];
  execution: 'local' | 'server';
}

export const TOOLBOX_CATEGORIES: ToolboxCategoryMeta[] = [
  {
    id: 'security',
    name: 'Security',
    subtitle: 'Passwords, JWT, Hash',
    accentClass: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40',
  },
  {
    id: 'formatters',
    name: 'Formatters',
    subtitle: 'JSON, XML, YAML',
    accentClass: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40',
  },
  {
    id: 'network',
    name: 'Network',
    subtitle: 'DNS Lookup (A, MX, TXT, PTR)',
    accentClass: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40',
  },
  {
    id: 'cron-time',
    name: 'Cron & Time',
    subtitle: 'Linux, Quartz, Spring',
    accentClass: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40',
  },
  {
    id: 'converters',
    name: 'Converters',
    subtitle: 'Base64, URL-safe, Files',
    accentClass: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40',
  },
  {
    id: 'text-code',
    name: 'Text & Code',
    subtitle: 'Diff, UUID v4/v7',
    accentClass: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40',
  },
];

export const TOOLBOX_TOOLS: ToolboxToolMeta[] = [
  {
    id: 'password',
    name: 'Password Generator',
    shortName: 'Password',
    category: 'security',
    description: 'Cryptographically secure passwords with custom charsets, batch mode, and entropy bits.',
    keywords: ['password', 'passphrase', 'random', 'entropy', 'secret', 'key'],
    execution: 'local',
  },
  {
    id: 'uuid',
    name: 'UUID Generator',
    shortName: 'UUID',
    category: 'text-code',
    description: 'Generate RFC 4122 v4 & time-ordered RFC 9562 v7 UUIDs in bulk with formatting options.',
    keywords: ['uuid', 'guid', 'v4', 'v7', 'identifier', 'bulk'],
    execution: 'local',
  },
  {
    id: 'base64',
    name: 'Base64 Encode / Decode',
    shortName: 'Base64',
    category: 'converters',
    description: 'UTF-8 safe Base64 and URL-safe Base64 encoding/decoding plus file-to-Base64 data URLs.',
    keywords: ['base64', 'encode', 'decode', 'urlsafe', 'utf8', 'file', 'dataurl'],
    execution: 'local',
  },
  {
    id: 'hash',
    name: 'Hash & Checksum Generator',
    shortName: 'Hash',
    category: 'security',
    description: 'Compute MD5, SHA-1, SHA-256, SHA-384, SHA-512, HMAC signatures, and file checksums.',
    keywords: ['hash', 'md5', 'sha1', 'sha256', 'sha384', 'sha512', 'hmac', 'checksum', 'digest'],
    execution: 'local',
  },
  {
    id: 'json',
    name: 'JSON Formatter & Validator',
    shortName: 'JSON Formatter',
    category: 'formatters',
    description: 'Pretty-print, minify, sort keys alphabetically, inspect stats, and pinpoint syntax errors.',
    keywords: ['json', 'format', 'pretty', 'minify', 'validate', 'lint', 'sort'],
    execution: 'local',
  },
  {
    id: 'xml',
    name: 'XML Formatter & Validator',
    shortName: 'XML Formatter',
    category: 'formatters',
    description: 'Validate well-formed XML natively in the browser, pretty-indent, or minify XML payloads.',
    keywords: ['xml', 'format', 'validate', 'indent', 'minify', 'svg', 'pom'],
    execution: 'local',
  },
  {
    id: 'yaml',
    name: 'YAML Formatter & Converter',
    shortName: 'YAML ↔ JSON',
    category: 'formatters',
    description: 'Validate and indent YAML or convert bidirectionally between YAML and JSON.',
    keywords: ['yaml', 'yml', 'json', 'convert', 'format', 'kubernetes', 'compose'],
    execution: 'local',
  },
  {
    id: 'jwt',
    name: 'JWT Decoder & Verifier',
    shortName: 'JWT Decoder',
    category: 'security',
    description: 'Inspect JWT header & claims, check exp/nbf timestamps, and verify HS256/384/512 locally.',
    keywords: ['jwt', 'token', 'bearer', 'decode', 'verify', 'hs256', 'claims'],
    execution: 'local',
  },
  {
    id: 'cron',
    name: 'Cron Parser & Next Runs',
    shortName: 'Cron Parser',
    category: 'cron-time',
    description: 'Explain 5-field Linux, macro, and 6-field Quartz/Spring cron schedules with upcoming runs.',
    keywords: ['cron', 'crontab', 'schedule', 'quartz', 'spring', 'timer', 'linux'],
    execution: 'local',
  },
  {
    id: 'dns',
    name: 'DNS Lookup',
    shortName: 'DNS Lookup',
    category: 'network',
    description: 'Query live A, AAAA, CNAME, MX, TXT, NS, and PTR records through bounded ProGit lookup.',
    keywords: ['dns', 'nslookup', 'dig', 'a', 'aaaa', 'mx', 'txt', 'cname', 'ns', 'ptr', 'domain'],
    execution: 'server',
  },
  {
    id: 'diff',
    name: 'Text Diff Viewer',
    shortName: 'Text Diff',
    category: 'text-code',
    description: 'Compare two snippets side-by-side or unified with whitespace ignore and line diff counts.',
    keywords: ['diff', 'compare', 'patch', 'unified', 'side by side', 'text'],
    execution: 'local',
  },
];

export const FAVORITES_STORAGE_KEY = 'progit_toolbox_favorites';
export const RECENT_STORAGE_KEY = 'progit_toolbox_recent';

export function getToolById(id?: string): ToolboxToolMeta | undefined {
  if (!id) return undefined;
  return TOOLBOX_TOOLS.find(t => t.id === id);
}

export function getCategoryById(id: ToolboxCategoryId): ToolboxCategoryMeta | undefined {
  return TOOLBOX_CATEGORIES.find(c => c.id === id);
}

export function readStoredIds(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && !!getToolById(item));
  } catch {
    return [];
  }
}

export function writeStoredIds(key: string, ids: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

export function toggleFavoriteToolId(toolId: string): string[] {
  const existing = readStoredIds(FAVORITES_STORAGE_KEY);
  const next = existing.includes(toolId)
    ? existing.filter(id => id !== toolId)
    : [toolId, ...existing];
  writeStoredIds(FAVORITES_STORAGE_KEY, next);
  return next;
}

export function recordRecentToolId(toolId: string): string[] {
  if (!getToolById(toolId)) return readStoredIds(RECENT_STORAGE_KEY);
  const existing = readStoredIds(RECENT_STORAGE_KEY);
  const next = [toolId, ...existing.filter(id => id !== toolId)].slice(0, 8);
  writeStoredIds(RECENT_STORAGE_KEY, next);
  return next;
}

// Level-2 dynamic imports: each tool lives in its own async chunk
const TOOL_COMPONENT_MAP: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  password: lazy(() => import('./tools/PasswordTool')),
  uuid: lazy(() => import('./tools/UuidTool')),
  base64: lazy(() => import('./tools/Base64Tool')),
  hash: lazy(() => import('./tools/HashTool')),
  json: lazy(() => import('./tools/JsonTool')),
  xml: lazy(() => import('./tools/XmlTool')),
  yaml: lazy(() => import('./tools/YamlTool')),
  jwt: lazy(() => import('./tools/JwtTool')),
  cron: lazy(() => import('./tools/CronTool')),
  dns: lazy(() => import('./tools/DnsTool')),
  diff: lazy(() => import('./tools/DiffTool')),
};

export function getLazyToolComponent(toolId: string): React.LazyExoticComponent<React.ComponentType> | null {
  return TOOL_COMPONENT_MAP[toolId] || null;
}
