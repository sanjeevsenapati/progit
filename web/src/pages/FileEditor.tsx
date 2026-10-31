import React, { useEffect, useState } from 'react';
import { api, Repository } from '../lib/api';
import { RepoNav } from '../components/RepoNav';
import { MarkdownViewer } from '../components/MarkdownViewer';
import { 
  FileCode, 
  Eye, 
  Code, 
  GitCommit, 
  GitBranch, 
  ChevronRight, 
  AlertCircle,
  ArrowLeft
} from 'lucide-react';

interface FileEditorProps {
  owner: string;
  repo: string;
  branch?: string;
  filePath?: string;
  initialDirectory?: string;
  mode: 'new' | 'edit';
}

export const FileEditor: React.FC<FileEditorProps> = ({
  owner,
  repo: repoName,
  branch = 'main',
  filePath = '',
  initialDirectory = '',
  mode,
}) => {
  const [repoData, setRepoData] = useState<Repository | null>(null);
  const [pathInput, setPathInput] = useState(
    mode === 'edit'
      ? filePath
      : initialDirectory
      ? initialDirectory.replace(/\/+$/, '') + '/'
      : ''
  );
  const [content, setContent] = useState('');
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [commitMessage, setCommitMessage] = useState(
    mode === 'edit' ? `Update ${filePath}` : 'Create new file'
  );
  const [commitDescription, setCommitDescription] = useState('');
  const [commitTarget, setCommitTarget] = useState<'direct' | 'new-branch'>('direct');
  const [newBranchName, setNewBranchName] = useState(`${owner}-patch-1`);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const r = await api.getRepo(owner, repoName);
        setRepoData(r.repository);

        if (mode === 'edit' && filePath) {
          const b = await api.getBlob(owner, repoName, branch, filePath);
          setContent(b.content);
          setCommitMessage(`Update ${filePath}`);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load file');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [owner, repoName, branch, filePath, mode]);

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPath = pathInput.trim().replace(/^\/+/, '');
    if (!cleanPath) {
      alert('Please provide a file name');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const fullMessage = commitDescription
        ? `${commitMessage.trim()}\n\n${commitDescription.trim()}`
        : commitMessage.trim();

      const newBranch = commitTarget === 'new-branch' ? newBranchName.trim() : undefined;

      const res = await api.saveFile(owner, repoName, cleanPath, {
        branch,
        new_branch: newBranch,
        content,
        message: fullMessage || (mode === 'edit' ? `Update ${cleanPath}` : `Create ${cleanPath}`),
      });

      // Redirect back to blob view
      const targetBranch = res.branch || branch;
      window.location.href = `/${owner}/${repoName}/blob/${targetBranch}/${cleanPath}`;
    } catch (err: any) {
      setError(err.message || 'Failed to commit changes');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !repoData) {
    return (
      <div className="py-20 text-center text-sm text-gray-400">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        Loading editor...
      </div>
    );
  }

  if (!repoData) {
    return <div className="py-20 text-center text-sm">Repository not found</div>;
  }

  const isMarkdown = pathInput.toLowerCase().endsWith('.md');
  const lines = content.split('\n');

  return (
    <div>
      <RepoNav repo={repoData} activeTab="code" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Navigation & File Path */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-2 text-sm font-semibold flex-wrap">
            <a
              href={`/${owner}/${repoName}/tree/${branch}`}
              className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              <span>{repoName}</span>
            </a>
            <span className="text-gray-400">/</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-dark-text">
              <GitBranch className="w-3 h-3 mr-1 text-emerald-600" />
              {branch}
            </span>
            <span className="text-gray-400">/</span>

            {/* Path Input */}
            <div className="flex items-center">
              <input
                type="text"
                required
                disabled={mode === 'edit'}
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                placeholder="name your file... (e.g. src/app.js)"
                className="px-3 py-1 text-sm font-mono rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-80 min-w-[240px] sm:min-w-[320px]"
              />
            </div>
          </div>

          {/* Edit / Preview Tabs */}
          <div className="flex space-x-1 p-1 rounded-lg bg-gray-100 dark:bg-dark-hover border border-gray-200 dark:border-dark-border text-xs font-semibold self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab('edit')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md transition-colors ${
                activeTab === 'edit'
                  ? 'bg-white dark:bg-dark-surface shadow-sm text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-gray-600 dark:text-dark-muted hover:text-gray-900'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md transition-colors ${
                activeTab === 'preview'
                  ? 'bg-white dark:bg-dark-surface shadow-sm text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-gray-600 dark:text-dark-muted hover:text-gray-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-xs font-semibold text-red-700 dark:text-red-400 flex items-center">
            <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Editor Box */}
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 dark:bg-dark-hover/40 border-b border-gray-200 dark:border-dark-border flex items-center justify-between text-xs text-gray-500 dark:text-dark-muted">
            <span className="font-mono">{lines.length} lines</span>
            <span className="text-[11px]">UTF-8 • Unix (LF)</span>
          </div>

          {activeTab === 'edit' ? (
            <div className="flex">
              {/* Line Numbers */}
              <div className="select-none py-4 px-3 text-right text-xs font-mono text-gray-400 dark:text-dark-muted border-r border-gray-100 dark:border-dark-border bg-gray-50/50 dark:bg-dark-hover/20">
                {lines.map((_, i) => (
                  <div key={i} className="leading-6">
                    {i + 1}
                  </div>
                ))}
              </div>

              {/* Textarea */}
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Type your code or documentation here..."
                rows={Math.max(16, lines.length + 2)}
                className="flex-1 p-4 font-mono text-xs leading-6 bg-transparent text-gray-900 dark:text-white focus:outline-none resize-y"
                style={{ tabSize: 2 }}
              />
            </div>
          ) : (
            <div className="p-6 min-h-[300px]">
              {isMarkdown ? (
                <MarkdownViewer content={content || '*No content to preview*'} />
              ) : (
                <pre className="text-xs font-mono p-4 rounded bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-dark-text overflow-x-auto leading-relaxed">
                  <code>{content || '// Empty file'}</code>
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Commit Changes Box */}
        <form onSubmit={handleCommit} className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm p-6 space-y-4">
          <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center space-x-2">
            <GitCommit className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>Commit changes</span>
          </h2>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                Commit summary
              </label>
              <input
                type="text"
                required
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                Extended description (optional)
              </label>
              <textarea
                rows={3}
                value={commitDescription}
                onChange={(e) => setCommitDescription(e.target.value)}
                placeholder="Add an optional extended description..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Target Branch selection */}
            <div className="pt-2 border-t border-gray-100 dark:border-dark-border/40 space-y-2 text-xs">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="commit-target"
                  checked={commitTarget === 'direct'}
                  onChange={() => setCommitTarget('direct')}
                  className="text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-gray-800 dark:text-white font-medium">
                  Commit directly to the <span className="font-mono font-bold text-emerald-600">{branch}</span> branch
                </span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="commit-target"
                  checked={commitTarget === 'new-branch'}
                  onChange={() => setCommitTarget('new-branch')}
                  className="text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-gray-800 dark:text-white font-medium">
                  Create a <span className="font-semibold">new branch</span> for this commit and start a pull request
                </span>
              </label>

              {commitTarget === 'new-branch' && (
                <div className="pl-6 pt-1">
                  <input
                    type="text"
                    required
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder="branch-name"
                    className="w-64 px-3 py-1.5 text-xs font-mono rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-gray-100 dark:border-dark-border/40">
            <a
              href={`/${owner}/${repoName}/tree/${branch}`}
              className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-dark-text bg-gray-100 dark:bg-dark-hover rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </a>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
            >
              {saving ? 'Committing...' : mode === 'edit' ? 'Commit changes' : 'Commit new file'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

