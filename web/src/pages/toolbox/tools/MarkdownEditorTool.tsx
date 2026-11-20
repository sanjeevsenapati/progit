import React, { useMemo, useState } from 'react';
import {
  Bold,
  Code,
  Download,
  Eye,
  Heading1,
  Heading2,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  Sparkles,
  Table,
} from 'lucide-react';
import { CopyButton } from '../components/ToolUI';

const SAMPLE_MD = `# ProGit 1.19.0 Release Notes

Welcome to the **ProGit** developer productivity suite!

## Features Included
- **Repository Forking**: Create same-account repository forks with custom naming.
- **OIDC SSO**: End-to-end integration with Keycloak, Auth0, and ZTrust.
- **Developer Toolbox**: 20+ offline developer productivity utilities.

### Quick Example
\`\`\`bash
# Start ProGit server locally
./bin/progit serve --port 3000
\`\`\`

> *ProTip*: All developer tools operate client-side with 100% data privacy.

| Component | Status | Language |
| :--- | :--- | :--- |
| Core API | Active | Go 1.24 |
| Web UI | Active | React 19 |
| Toolbox | Active | TypeScript |`;

export const MarkdownEditorTool: React.FC = () => {
  const [markdown, setMarkdown] = useState<string>(SAMPLE_MD);
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split');

  const insertText = (before: string, after = '') => {
    const textarea = document.getElementById('md-textarea') as HTMLTextAreaElement;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = markdown.substring(start, end) || 'text';
    const replacement = `${before}${selected}${after}`;
    const next = markdown.substring(0, start) + replacement + markdown.substring(end);
    setMarkdown(next);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 50);
  };

  // Basic GitHub-flavored markdown renderer
  const renderedHtml = useMemo(() => {
    const lines = markdown.split(/\r?\n/);
    let html = '';
    let inCode = false;
    let codeContent = '';
    let inList = false;
    let inTable = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code blocks
      if (line.trim().startsWith('```')) {
        if (inCode) {
          html += `<pre class="bg-gray-900 text-emerald-400 p-3 rounded-lg overflow-x-auto my-3 font-mono text-xs"><code>${escapeHtml(codeContent)}</code></pre>`;
          codeContent = '';
          inCode = false;
        } else {
          inCode = true;
        }
        continue;
      }
      if (inCode) {
        codeContent += (codeContent ? '\n' : '') + line;
        continue;
      }

      // Headers
      if (line.startsWith('# ')) {
        html += `<h1 class="text-2xl font-bold mt-4 mb-2 pb-1 border-b border-gray-200 dark:border-dark-border">${parseInline(line.slice(2))}</h1>`;
        continue;
      }
      if (line.startsWith('## ')) {
        html += `<h2 class="text-xl font-bold mt-3 mb-2 pb-1 border-b border-gray-100 dark:border-dark-border/60">${parseInline(line.slice(3))}</h2>`;
        continue;
      }
      if (line.startsWith('### ')) {
        html += `<h3 class="text-lg font-bold mt-3 mb-1">${parseInline(line.slice(4))}</h3>`;
        continue;
      }

      // Blockquotes
      if (line.startsWith('> ')) {
        html += `<blockquote class="border-l-4 border-emerald-500 pl-3 my-2 text-gray-600 dark:text-dark-muted italic bg-emerald-50/30 dark:bg-emerald-950/20 py-1 rounded-r">${parseInline(line.slice(2))}</blockquote>`;
        continue;
      }

      // Lists
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        if (!inList) {
          html += '<ul class="list-disc list-inside space-y-1 my-2">';
          inList = true;
        }
        html += `<li>${parseInline(line.trim().slice(2))}</li>`;
        continue;
      } else if (inList) {
        html += '</ul>';
        inList = false;
      }

      // Tables
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        if (line.includes('---')) continue; // Separator
        const cells = line.split('|').slice(1, -1).map(c => c.trim());
        if (!inTable) {
          html += '<div class="overflow-x-auto my-3"><table class="w-full text-left border-collapse border border-gray-200 dark:border-dark-border text-xs">';
          html += '<thead><tr class="bg-gray-50 dark:bg-dark-border/40">';
          cells.forEach(c => (html += `<th class="p-2 border border-gray-200 dark:border-dark-border font-bold">${parseInline(c)}</th>`));
          html += '</tr></thead><tbody>';
          inTable = true;
        } else {
          html += '<tr class="hover:bg-gray-50 dark:hover:bg-dark-hover">';
          cells.forEach(c => (html += `<td class="p-2 border border-gray-200 dark:border-dark-border font-mono">${parseInline(c)}</td>`));
          html += '</tr>';
        }
        continue;
      } else if (inTable) {
        html += '</tbody></table></div>';
        inTable = false;
      }

      // Plain paragraphs
      if (line.trim()) {
        html += `<p class="my-2 leading-relaxed">${parseInline(line)}</p>`;
      }
    }

    if (inList) html += '</ul>';
    if (inTable) html += '</tbody></table></div>';
    return html;
  }, [markdown]);

  const wordCount = useMemo(() => {
    return markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
  }, [markdown]);

  const handleDownloadMd = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `document-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      {/* Markdown Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-xs">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => insertText('**', '**')}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-dark-hover"
            title="Bold"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertText('*', '*')}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-dark-hover"
            title="Italic"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertText('# ')}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-dark-hover"
            title="Heading 1"
          >
            <Heading1 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertText('## ')}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-dark-hover"
            title="Heading 2"
          >
            <Heading2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertText('> ')}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-dark-hover"
            title="Quote"
          >
            <Quote className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertText('`', '`')}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-dark-hover"
            title="Inline Code"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertText('- ')}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-dark-hover"
            title="List"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertText('| Header 1 | Header 2 |\n| :--- | :--- |\n| Value 1 | Value 2 |\n')}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-dark-hover"
            title="Table"
          >
            <Table className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertText('[', '](https://example.com)')}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-dark-hover"
            title="Link"
          >
            <Link className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg p-0.5">
            {(['split', 'edit', 'preview'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`px-2 py-1 rounded text-[11px] font-semibold capitalize ${
                  viewMode === mode
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-600 dark:text-dark-muted hover:text-gray-900'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <CopyButton value={markdown} label="Copy MD" />
          <CopyButton value={renderedHtml} label="Copy HTML" />
          <button
            type="button"
            onClick={handleDownloadMd}
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-50 text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5 text-sky-500" />
            <span>.md</span>
          </button>
        </div>
      </div>

      {/* Editor & Preview Panes */}
      <div className={`grid gap-4 ${viewMode === 'split' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        {(viewMode === 'split' || viewMode === 'edit') && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-gray-500 px-1">
              <span className="font-semibold uppercase tracking-wider">Markdown Source</span>
              <span>{wordCount} words • {markdown.length} chars</span>
            </div>
            <textarea
              id="md-textarea"
              value={markdown}
              onChange={e => setMarkdown(e.target.value)}
              rows={20}
              className="w-full font-mono text-xs p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y leading-relaxed"
            />
          </div>
        )}

        {(viewMode === 'split' || viewMode === 'preview') && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-gray-500 px-1">
              <span className="font-semibold uppercase tracking-wider flex items-center space-x-1">
                <Eye className="w-3.5 h-3.5 text-emerald-500" />
                <span>Live Rendered Preview</span>
              </span>
              <span className="text-gray-400">GitHub Flavored</span>
            </div>
            <div
              className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg min-h-[440px] max-h-[600px] overflow-y-auto text-gray-800 dark:text-dark-text text-xs leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

function sanitizeHref(url: string): string {
  const clean = url.trim();
  // Allow safe protocols only: http, https, mailto, tel, or fragment/relative paths
  if (/^(https?:|mailto:|tel:|#)/i.test(clean)) {
    return clean.replace(/"/g, '&quot;');
  }
  if (/^(\/|\.\/|\.\.\/)/.test(clean)) {
    return clean.replace(/"/g, '&quot;');
  }
  return '#';
}

function parseInline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-gray-100 dark:bg-dark-border px-1 py-0.5 rounded font-mono text-[11px]">$1</code>')
    .replace(/\[(.*?)\]\((.*?)\)/g, (_, label, href) => {
      const safeHref = sanitizeHref(href);
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="text-emerald-600 dark:text-emerald-400 underline">${label}</a>`;
    });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default MarkdownEditorTool;
