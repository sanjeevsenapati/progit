import React, { useEffect, useState } from 'react';
import { api, Repository } from '../lib/api';
import { RepoNav } from '../components/RepoNav';
import { 
  FileText, 
  Copy, 
  Download, 
  Check, 
  ChevronRight, 
  Edit2, 
  Trash2, 
  X, 
  AlertTriangle 
} from 'lucide-react';

interface FileViewProps {
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
}

export const FileView: React.FC<FileViewProps> = ({ owner, repo: repoName, branch, filePath }) => {
  const [repoData, setRepoData] = useState<Repository | null>(null);
  const [content, setContent] = useState('');
  const [size, setSize] = useState(0);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState(`Delete ${filePath}`);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const r = await api.getRepo(owner, repoName);
        setRepoData(r.repository);

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
      window.location.href = targetUrl;
    } catch (err: any) {
      alert(err.message || 'Failed to delete file');
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

  return (
    <div>
      <RepoNav repo={repoData} activeTab="code" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {/* Breadcrumb Path */}
        <div className="flex items-center space-x-1.5 text-sm font-semibold text-gray-600 dark:text-dark-muted">
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

        {/* File Viewer Box */}
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-4 py-2.5 bg-gray-50 dark:bg-dark-hover/40 border-b border-gray-200 dark:border-dark-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-gray-600 dark:text-dark-muted">
            <div className="flex items-center space-x-2 font-mono">
              <FileText className="w-4 h-4 text-gray-400" />
              <span className="font-bold text-gray-900 dark:text-white">{fileName}</span>
              <span>•</span>
              <span>{lines.length} lines</span>
              <span>•</span>
              <span>{(size / 1024).toFixed(1)} KB</span>
            </div>

            <div className="flex items-center space-x-2">
              {/* Edit file online */}
              <a
                href={`/${owner}/${repoName}/edit/${branch}/${filePath}`}
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text shadow-sm"
                title="Edit this file online"
              >
                <Edit2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Edit</span>
              </a>

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

              {/* Delete file */}
              <button
                onClick={() => setShowDeleteModal(true)}
                className="inline-flex items-center space-x-1 px-2 py-1 rounded border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 hover:bg-red-100 text-red-600 dark:text-red-400"
                title="Delete this file"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Line by Line Code */}
          <div className="overflow-x-auto text-xs font-mono">
            <table className="w-full text-left border-collapse">
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-dark-hover/50">
                    <td className="w-12 py-0.5 px-3 select-none text-right text-gray-400 border-r border-gray-100 dark:border-dark-border">
                      {idx + 1}
                    </td>
                    <td className="py-0.5 px-4 whitespace-pre text-gray-800 dark:text-dark-text">
                      {line}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-2xl max-w-md w-full shadow-xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-red-600 dark:text-red-400 font-bold text-sm">
                <AlertTriangle className="w-5 h-5" />
                <span>Delete file</span>
              </div>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-dark-muted">
              Are you sure you want to delete <span className="font-mono font-bold text-gray-900 dark:text-white">{filePath}</span> from branch <span className="font-mono font-semibold text-emerald-600">{branch}</span>?
            </p>

            <form onSubmit={handleDelete} className="space-y-4 pt-2">
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

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-dark-text bg-gray-100 dark:bg-dark-hover rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleting}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm disabled:opacity-50"
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
