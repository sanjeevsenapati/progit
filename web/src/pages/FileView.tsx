import React, { useEffect, useState } from 'react';
import { api, Repository } from '../lib/api';
import { navigate } from '../lib/router';
import { RepoNav } from '../components/RepoNav';
import { MarkdownViewer } from '../components/MarkdownViewer';
import { showToast } from '../components/ModalDialog';
import { 
  detectLanguage, 
  highlightCode, 
  PRETTIER_THEMES, 
  PrettierTheme 
} from '../lib/codeEditor';
import { 
  FileText, 
  Copy, 
  Download, 
  Check, 
  ChevronRight, 
  Edit2, 
  Trash2, 
  X, 
  AlertTriangle,
  Palette,
  Sparkles,
  BookOpen,
  Code
} from 'lucide-react';

interface FileViewProps {
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
}

export const FileView: React.FC<FileViewProps> = ({ owner, repo: repoName, branch, filePath }) => {
  const [repoData, setRepoData] = useState<Repository | null>(() => api.getCachedRepo(owner, repoName)?.repository || null);
  const [content, setContent] = useState('');
  const [size, setSize] = useState(0);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [canWrite, setCanWrite] = useState(false);
  const [prettierTheme, setPrettierTheme] = useState<PrettierTheme>('prettier-dark');

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState(`Delete ${filePath}`);
  const [deleting, setDeleting] = useState(false);

  // Markdown view mode
  const isMarkdown = filePath.toLowerCase().endsWith('.md');
  const [viewMode, setViewMode] = useState<'rendered' | 'source'>(isMarkdown ? 'rendered' : 'source');

  useEffect(() => {
    async function load() {
      try {
        const r = await api.getRepo(owner, repoName);
        setRepoData(r.repository);
        setCanWrite(Boolean(r.can_write || r.permissions?.write));

        const b = await api.getBlob(owner, repoName, branch, filePath);
        setContent(b.content);
        setSize(b.size);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [owner, repoName, branch, filePath]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setDeleting(true);
      await api.deleteFile(owner, repoName, filePath, {
        branch,
        message: deleteMessage.trim() || `Delete ${filePath}`,
      });
      // Redirect back to parent directory or tree
      const parentDir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
      const targetUrl = parentDir ? `/${owner}/${repoName}/tree/${branch}/${parentDir}` : `/${owner}/${repoName}/tree/${branch}`;
      navigate(targetUrl);
    } catch (err: any) {
      showToast(err.message || 'Failed to delete file', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading && !repoData) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading file...</div>;
  }

  if (!repoData) {
    return <div className="py-20 text-center text-sm">Repository not found</div>;
  }

  const lines = content.split('\n');
  const pathParts = filePath.split('/');
  const fileName = pathParts[pathParts.length - 1];
  const language = detectLanguage(filePath);

  return (
    <div>
      <RepoNav repo={repoData} activeTab="code" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {/* Breadcrumb Path & Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-1.5 text-sm font-semibold text-gray-600 dark:text-dark-muted flex-wrap">
            <a href={`/${owner}/${repoName}`} className="text-emerald-600 dark:text-emerald-400 hover:underline">
              {repoName}
            </a>
            {pathParts.map((part, idx) => {
              const isLast = idx === pathParts.length - 1;
              const sub = pathParts.slice(0, idx + 1).join('/');
              return (
                <React.Fragment key={sub}>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                  {isLast ? (
                    <span className="text-gray-900 dark:text-white font-bold">{part}</span>
                  ) : (
                    <a
                      href={`/${owner}/${repoName}/tree/${branch}/${sub}`}
                      className="text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      {part}
                    </a>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* If Markdown, Render vs Source switcher */}
          {isMarkdown && (
            <div className="flex space-x-1 p-1 rounded-lg bg-gray-100 dark:bg-dark-hover border border-gray-200 dark:border-dark-border text-xs font-semibold self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setViewMode('rendered')}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-colors ${
                  viewMode === 'rendered'
                    ? 'bg-white dark:bg-dark-surface shadow-sm text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'text-gray-600 dark:text-dark-muted hover:text-gray-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('source')}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-colors ${
                  viewMode === 'source'
                    ? 'bg-white dark:bg-dark-surface shadow-sm text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'text-gray-600 dark:text-dark-muted hover:text-gray-900'
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                <span>Code</span>
              </button>
            </div>
          )}
        </div>

        {/* File Viewer Box */}
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-md overflow-hidden">
          {/* Header */}
          <div className="px-4 py-2.5 bg-gray-50 dark:bg-[#14161f] border-b border-gray-200 dark:border-dark-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-gray-600 dark:text-dark-muted">
            <div className="flex items-center space-x-2 font-mono">
              <FileText className="w-4 h-4 text-gray-400" />
              <span className="font-bold text-gray-900 dark:text-white">{fileName}</span>
              <span>•</span>
              <span>{lines.length} lines</span>
              <span>•</span>
              <span>{(size / 1024).toFixed(1)} KB</span>
              <span>•</span>
              <span className="capitalize">{language}</span>
            </div>

            <div className="flex items-center space-x-2.5">
              {/* Prettier Theme Picker */}
              <div className="flex items-center space-x-1.5 border-r border-gray-200 dark:border-dark-border pr-2.5">
                <Palette className="w-3.5 h-3.5 text-gray-400" />
                <select
                  value={prettierTheme}
                  onChange={(e) => setPrettierTheme(e.target.value as PrettierTheme)}
                  className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                >
                  {PRETTIER_THEMES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Edit file online (restricted to users with write access) */}
              {canWrite && (
                <a
                  href={`/${owner}/${repoName}/edit/${branch}/${filePath}`}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text shadow-sm"
                  title="Edit this file online with Prettier Editor"
                >
                  <Edit2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Edit</span>
                </a>
              )}

              {/* Copy Raw */}
              <button
                onClick={handleCopy}
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              {/* Raw Download */}
              <a
                href={`/api/v1/repos/${owner}/${repoName}/raw?ref=${branch}&path=${filePath}`}
                download={fileName}
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Raw</span>
              </a>

              {/* Delete file (restricted to users with write access) */}
              {canWrite && (
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="inline-flex items-center space-x-1 px-2 py-1 rounded border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 hover:bg-red-100 text-red-600 dark:text-red-400"
                  title="Delete this file"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* File Content Rendering */}
          {isMarkdown && viewMode === 'rendered' ? (
            <div className="p-6">
              <MarkdownViewer content={content || '*Empty file*'} />
            </div>
          ) : (
            <div className={`overflow-x-auto text-xs font-mono transition-colors ${prettierTheme}`}>
              <div className="flex py-2">
                {/* Line Numbers */}
                <div
                  className={`select-none py-2 px-3 text-right border-r ${
                    prettierTheme === 'prettier-light'
                      ? 'border-gray-200 text-gray-400 bg-gray-50'
                      : 'border-white/10 text-gray-500 bg-black/20'
                  }`}
                  style={{ minWidth: '3.5rem' }}
                >
                  {lines.map((_, idx) => (
                    <div key={idx} className="leading-6">
                      {idx + 1}
                    </div>
                  ))}
                </div>

                {/* Prettier Syntax Highlighted Code */}
                <pre className="py-2 px-4 leading-6 flex-1 overflow-x-auto bg-transparent">
                  <code
                    dangerouslySetInnerHTML={{
                      __html: highlightCode(content || '', language),
                    }}
                  />
                </pre>
              </div>
            </div>
          )}

          {/* Footer Bar */}
          <div className="px-4 py-1.5 bg-gray-50 dark:bg-[#14161f] border-t border-gray-200 dark:border-dark-border flex items-center justify-between text-[11px] text-gray-500 dark:text-dark-muted font-mono">
            <div className="flex items-center space-x-3">
              <span>{lines.length} lines</span>
              <span>•</span>
              <span>{(size / 1024).toFixed(1)} KB</span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="inline-flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                <Sparkles className="w-3 h-3" />
                <span>Prettier Theme</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl max-w-md w-full shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-dark-border pb-3">
              <div className="flex items-center space-x-2 text-red-600 dark:text-red-400 font-bold text-sm">
                <AlertTriangle className="w-5 h-5" />
                <span>Delete file</span>
              </div>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-dark-text leading-relaxed">
              Are you sure you want to delete <span className="font-mono font-bold text-gray-900 dark:text-white">{filePath}</span> from branch <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{branch}</span>?
            </p>

            <form onSubmit={handleDelete} className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                  Commit message
                </label>
                <input
                  type="text"
                  required
                  value={deleteMessage}
                  onChange={(e) => setDeleteMessage(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-gray-200 dark:border-dark-border">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-border/60 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleting}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {deleting ? 'Deleting...' : 'Commit deletion'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
