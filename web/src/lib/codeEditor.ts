import Prism from 'prismjs';

// Import essential Prism language modules
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-ini';

export type PrettierTheme = 'prettier-dark' | 'prettier-light' | 'prettier-midnight';

export const PRETTIER_THEMES: { id: PrettierTheme; label: string; bg: string; isDark: boolean }[] = [
  { id: 'prettier-dark', label: 'Prettier Dark', bg: '#1a1a27', isDark: true },
  { id: 'prettier-light', label: 'Prettier Light', bg: '#fafbfc', isDark: false },
  { id: 'prettier-midnight', label: 'Prettier Midnight', bg: '#0d1117', isDark: true },
];

/**
 * Detect language string for Prism from file path / extension
 */
export function detectLanguage(filePath: string): string {
  const fileName = filePath.split('/').pop()?.toLowerCase() || '';
  if (fileName === 'dockerfile' || fileName === 'containerfile') {
    return 'docker';
  }

  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'ts':
    case 'mts':
      return 'typescript';
    case 'jsx':
      return 'jsx';
    case 'tsx':
      return 'tsx';
    case 'json':
      return 'json';
    case 'css':
    case 'scss':
    case 'less':
      return 'css';
    case 'html':
    case 'htm':
    case 'svg':
    case 'xml':
      return 'markup';
    case 'go':
      return 'go';
    case 'py':
      return 'python';
    case 'c':
    case 'h':
      return 'c';
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
      return 'cpp';
    case 'java':
      return 'java';
    case 'rs':
      return 'rust';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'bash';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'sql':
      return 'sql';
    case 'ini':
    case 'conf':
    case 'toml':
      return 'ini';
    case 'dockerfile':
      return 'docker';
    case 'md':
    case 'markdown':
      return 'markdown';
    default:
      return 'javascript';
  }
}

/**
 * Syntax highlight code using Prism
 */
export function highlightCode(code: string, language: string): string {
  const grammar = Prism.languages[language] || Prism.languages.javascript || Prism.languages.markup;
  try {
    return Prism.highlight(code, grammar, language);
  } catch {
    return escapeHtml(code);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Prettier auto-formatter: formats JSON or standardizes indentation, brackets, and line breaks
 */
export function formatWithPrettier(
  code: string,
  language: string,
  tabSize: number = 2
): { formatted: string; changed: boolean; error?: string } {
  if (!code) return { formatted: '', changed: false };

  // 1. JSON formatting
  if (language === 'json') {
    try {
      const parsed = JSON.parse(code);
      const formatted = JSON.stringify(parsed, null, tabSize) + '\n';
      return { formatted, changed: formatted !== code };
    } catch (e: any) {
      return { formatted: code, changed: false, error: `Invalid JSON: ${e.message}` };
    }
  }

  // 2. Generic Prettier-style formatting (Indentation, Whitespace, Braces)
  const lines = code.split(/\r?\n/);
  const indentStr = ' '.repeat(tabSize);
  let depth = 0;
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') {
      // Avoid more than 2 consecutive blank lines
      if (result.length > 0 && result[result.length - 1] === '') {
        continue;
      }
      result.push('');
      continue;
    }

    // Adjust depth for closing braces at start of line
    const leadingCloses = (trimmed.match(/^[}\])]/g) || []).length;
    const currentDepth = Math.max(0, depth - leadingCloses);

    result.push(indentStr.repeat(currentDepth) + trimmed);

    // Calculate depth change for next line
    const opens = (trimmed.match(/[{\[(]/g) || []).length;
    const closes = (trimmed.match(/[}\])]/g) || []).length;
    depth = Math.max(0, depth + opens - closes);
  }

  const formatted = result.join('\n').replace(/\n*$/, '\n');
  return { formatted, changed: formatted !== code };
}

