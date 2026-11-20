import React, { lazy } from 'react';

export type ToolboxCategoryId =
  | 'security'
  | 'formatters'
  | 'database'
  | 'network'
  | 'cron-time'
  | 'converters'
  | 'text-code'
  | 'dev-tools';

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
    id: 'database',
    name: 'Database',
    subtitle: 'SQL, Connection Strings, JDBC',
    accentClass: 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40',
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
  {
    id: 'dev-tools',
    name: 'Developer Tools',
    subtitle: 'Diagrams, Regex, Logs, Generators',
    accentClass: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40',
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
  {
    id: 'sql-formatter',
    name: 'SQL Formatter',
    shortName: 'SQL Formatter',
    category: 'database',
    description: 'Format SQL queries cleanly across PostgreSQL, MySQL, SQLite, T-SQL, and Oracle dialects.',
    keywords: ['sql', 'format', 'formatter', 'database', 'query', 'postgres', 'mysql', 'oracle', 'sqlite'],
    execution: 'local',
  },
  {
    id: 'sql-beautifier',
    name: 'SQL Beautifier',
    shortName: 'SQL Beautifier',
    category: 'database',
    description: 'Improve SQL readability with aligned clause rivers, CTE/CASE formatting presets, and fullscreen view.',
    keywords: ['sql', 'beautify', 'beautifier', 'pretty', 'align', 'readable', 'cte', 'database'],
    execution: 'local',
  },
  {
    id: 'sql-minifier',
    name: 'SQL Minifier',
    shortName: 'SQL Minifier',
    category: 'database',
    description: 'Compact SQL queries into single-line strings while safely preserving literals and optional comments.',
    keywords: ['sql', 'minify', 'minifier', 'compact', 'compress', 'single line', 'database'],
    execution: 'local',
  },
  {
    id: 'sql-validator',
    name: 'SQL Validator',
    shortName: 'SQL Validator',
    category: 'database',
    description: 'Validate SQL syntax, parentheses/quote balance, clause order, dialect rules, and DML safety warnings.',
    keywords: ['sql', 'validate', 'validator', 'syntax', 'lint', 'check', 'parser', 'database'],
    execution: 'local',
  },
  {
    id: 'conn-string',
    name: 'Connection String Builder',
    shortName: 'Conn String',
    category: 'database',
    description: 'Build and parse connection strings for PostgreSQL, MySQL, JDBC, SQL Server, Oracle, SQLite, MongoDB & Redis.',
    keywords: ['connection string', 'dsn', 'database', 'postgresql', 'mysql', 'jdbc', 'mongodb', 'redis', 'oracle', 'sqlite'],
    execution: 'local',
  },
  {
    id: 'jdbc-url',
    name: 'JDBC URL Generator',
    shortName: 'JDBC URL',
    category: 'database',
    description: 'Generate Java JDBC URLs with Driver class, Spring Boot HikariCP configs, Maven/Gradle coordinates & Java code.',
    keywords: ['jdbc', 'java', 'spring', 'hikari', 'maven', 'gradle', 'postgresql', 'mysql', 'oracle', 'sqlserver', 'h2'],
    execution: 'local',
  },
  {
    id: 'mermaid-editor',
    name: 'Mermaid Live Editor',
    shortName: 'Mermaid Editor',
    category: 'dev-tools',
    description: 'Create flowcharts, sequence diagrams, state machines, and pie charts with live preview and SVG/PNG export.',
    keywords: ['mermaid', 'flowchart', 'sequence', 'diagram', 'chart', 'architecture', 'uml', 'svg'],
    execution: 'local',
  },
  {
    id: 'regex-library',
    name: 'Regex Library',
    shortName: 'Regex Library',
    category: 'dev-tools',
    description: 'Searchable repository of reusable production regular expressions with interactive match tester and breakdown.',
    keywords: ['regex', 'regexp', 'pattern', 'test', 'matcher', 'email', 'url', 'ipv4', 'semver', 'uuid'],
    execution: 'local',
  },
  {
    id: 'snippet-manager',
    name: 'Code Snippet Manager',
    shortName: 'Snippets',
    category: 'dev-tools',
    description: 'Save, organize, search, and manage reusable code snippets locally in your browser with tag filtering and JSON backup.',
    keywords: ['snippet', 'code', 'manager', 'gist', 'notes', 'templates', 'save', 'vault'],
    execution: 'local',
  },
  {
    id: 'json-path',
    name: 'JSON Path Tester',
    shortName: 'JSONPath',
    category: 'dev-tools',
    description: 'Test JSONPath expressions with real-time evaluation, recursive descent, array slicing, and predicate filters.',
    keywords: ['jsonpath', 'json', 'path', 'query', 'filter', 'extract', 'tester'],
    execution: 'local',
  },
  {
    id: 'xpath-tester',
    name: 'XPath Tester',
    shortName: 'XPath Tester',
    category: 'dev-tools',
    description: 'Test XML XPath expressions against XML documents with matching node highlighting, count metrics, and serialization.',
    keywords: ['xpath', 'xml', 'query', 'pom', 'rss', 'nodes', 'tester'],
    execution: 'local',
  },
  {
    id: 'sql-explainer',
    name: 'SQL Query Explainer',
    shortName: 'SQL Explainer',
    category: 'dev-tools',
    description: 'Explain SQL queries, step through logical execution phases, inspect clause mechanics, and get performance tips.',
    keywords: ['sql', 'explain', 'query', 'performance', 'ast', 'database', 'optimization', 'index'],
    execution: 'local',
  },
  {
    id: 'stack-explainer',
    name: 'Stack Trace Explainer',
    shortName: 'Stack Trace',
    category: 'dev-tools',
    description: 'Parse Java, Python, Node.js, and Go application stack traces to pinpoint root cause frames and remedial code fixes.',
    keywords: ['stack trace', 'error', 'exception', 'panic', 'java', 'python', 'nodejs', 'debug'],
    execution: 'local',
  },
  {
    id: 'error-search',
    name: 'Error Code Search',
    shortName: 'Error Search',
    category: 'dev-tools',
    description: 'Search common HTTP status codes, Linux/POSIX errno & signals, Java exceptions, and Docker/Git error solutions.',
    keywords: ['error', 'code', 'http', 'linux', 'errno', 'java', 'docker', 'git', 'status'],
    execution: 'local',
  },
  {
    id: 'log-analyzer',
    name: 'Log Analyzer',
    shortName: 'Log Analyzer',
    category: 'dev-tools',
    description: 'Parse, search, and filter application logs with severity breakdown badges, text/regex search, and log file export.',
    keywords: ['log', 'logs', 'analyzer', 'filter', 'severity', 'error', 'debug', 'tail'],
    execution: 'local',
  },
  {
    id: 'log-pattern',
    name: 'Log Pattern Extractor',
    shortName: 'Log Patterns',
    category: 'dev-tools',
    description: 'Identify repeated patterns in high-volume log streams by clustering lines with dynamic token substitution.',
    keywords: ['log', 'pattern', 'clustering', 'templates', 'frequency', 'mining', 'extractor'],
    execution: 'local',
  },
  {
    id: 'csv-viewer',
    name: 'CSV Viewer',
    shortName: 'CSV Viewer',
    category: 'dev-tools',
    description: 'View, sort, filter, and paginate large CSV and TSV files with auto delimiter detection and JSON export.',
    keywords: ['csv', 'tsv', 'viewer', 'table', 'spreadsheet', 'grid', 'export'],
    execution: 'local',
  },
  {
    id: 'markdown-editor',
    name: 'Markdown Editor',
    shortName: 'Markdown',
    category: 'dev-tools',
    description: 'Edit and preview GitHub-flavored Markdown in split-pane or full views with formatting toolbar and .md download.',
    keywords: ['markdown', 'editor', 'preview', 'gfm', 'html', 'docs', 'readme'],
    execution: 'local',
  },
  {
    id: 'md-table',
    name: 'Markdown Table Generator',
    shortName: 'Markdown Table',
    category: 'dev-tools',
    description: 'Interactive spreadsheet table generator with column alignment, dynamic rows/cols, presets, and Markdown text copy.',
    keywords: ['markdown', 'table', 'generator', 'grid', 'columns', 'alignment', 'gfm'],
    execution: 'local',
  },
  {
    id: 'color-picker',
    name: 'Color Picker',
    shortName: 'Color Picker',
    category: 'dev-tools',
    description: 'Convert between HEX, RGB, HSL, HSV, and CMYK with WCAG 2.1 contrast checking and Tailwind shade palettes.',
    keywords: ['color', 'picker', 'hex', 'rgb', 'hsl', 'contrast', 'wcag', 'palette'],
    execution: 'local',
  },
  {
    id: 'css-gradient',
    name: 'CSS Gradient Generator',
    shortName: 'CSS Gradient',
    category: 'dev-tools',
    description: 'Generate linear, radial, and conic CSS gradients with angle controls, draggable color stops, and modern presets.',
    keywords: ['gradient', 'css', 'linear', 'radial', 'conic', 'background', 'generator', 'style'],
    execution: 'local',
  },
  {
    id: 'svg-optimizer',
    name: 'SVG Optimizer',
    shortName: 'SVG Optimizer',
    category: 'dev-tools',
    description: 'Clean SVG markup by removing editor namespaces, comments, and redundant metadata with real-time byte savings.',
    keywords: ['svg', 'optimize', 'minify', 'clean', 'vector', 'compress'],
    execution: 'local',
  },
  {
    id: 'qr-generator',
    name: 'QR Code Generator',
    shortName: 'QR Code',
    category: 'dev-tools',
    description: 'Generate customizable, high-resolution QR codes for URLs, plain text, and Wi-Fi credentials with PNG/SVG export.',
    keywords: ['qr', 'qrcode', 'generator', 'wifi', 'url', 'matrix', 'svg', 'png'],
    execution: 'local',
  },
  {
    id: 'barcode-generator',
    name: 'Barcode Generator',
    shortName: 'Barcode',
    category: 'dev-tools',
    description: 'Generate Code 128, Code 39, EAN-13, and UPC-A linear barcodes with check digit calculation and SVG rendering.',
    keywords: ['barcode', 'code128', 'code39', 'ean13', 'upca', 'symbology', 'svg'],
    execution: 'local',
  },
  {
    id: 'image-compressor',
    name: 'Image Compressor',
    shortName: 'Compressor',
    category: 'dev-tools',
    description: 'Client-side image compression and resizing for PNG, JPEG, and WebP with before/after comparison and byte savings.',
    keywords: ['image', 'compress', 'resize', 'webp', 'jpeg', 'png', 'shrink'],
    execution: 'local',
  },
  {
    id: 'favicon-generator',
    name: 'Favicon Generator',
    shortName: 'Favicon',
    category: 'dev-tools',
    description: 'Generate complete multi-resolution website icon suites (16px to 512px) with browser tab preview and HTML tags.',
    keywords: ['favicon', 'icon', 'apple-touch-icon', 'manifest', 'tab', 'website'],
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
  'sql-formatter': lazy(() => import('./tools/SqlFormatterTool')),
  'sql-beautifier': lazy(() => import('./tools/SqlBeautifierTool')),
  'sql-minifier': lazy(() => import('./tools/SqlMinifierTool')),
  'sql-validator': lazy(() => import('./tools/SqlValidatorTool')),
  'conn-string': lazy(() => import('./tools/ConnectionStringTool')),
  'jdbc-url': lazy(() => import('./tools/JdbcUrlTool')),
  'mermaid-editor': lazy(() => import('./tools/MermaidEditorTool')),
  'regex-library': lazy(() => import('./tools/RegexLibraryTool')),
  'snippet-manager': lazy(() => import('./tools/CodeSnippetTool')),
  'json-path': lazy(() => import('./tools/JsonPathTool')),
  'xpath-tester': lazy(() => import('./tools/XPathTool')),
  'sql-explainer': lazy(() => import('./tools/SqlQueryExplainerTool')),
  'stack-explainer': lazy(() => import('./tools/StackTraceExplainerTool')),
  'error-search': lazy(() => import('./tools/ErrorCodeSearchTool')),
  'log-analyzer': lazy(() => import('./tools/LogAnalyzerTool')),
  'log-pattern': lazy(() => import('./tools/LogPatternExtractorTool')),
  'csv-viewer': lazy(() => import('./tools/CsvViewerTool')),
  'markdown-editor': lazy(() => import('./tools/MarkdownEditorTool')),
  'md-table': lazy(() => import('./tools/MarkdownTableTool')),
  'color-picker': lazy(() => import('./tools/ColorPickerTool')),
  'css-gradient': lazy(() => import('./tools/CssGradientTool')),
  'svg-optimizer': lazy(() => import('./tools/SvgOptimizerTool')),
  'qr-generator': lazy(() => import('./tools/QrCodeTool')),
  'barcode-generator': lazy(() => import('./tools/BarcodeTool')),
  'image-compressor': lazy(() => import('./tools/ImageCompressorTool')),
  'favicon-generator': lazy(() => import('./tools/FaviconGeneratorTool')),
};

export function getLazyToolComponent(toolId: string): React.LazyExoticComponent<React.ComponentType> | null {
  return TOOL_COMPONENT_MAP[toolId] || null;
}

