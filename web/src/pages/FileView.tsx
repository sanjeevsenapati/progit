import React, { useEffect, useState } from 'react';
import { api, Repository } from '../lib/api';
import { RepoNav } from '../components/RepoNav';
import { FileText, Copy, Download, Check, ChevronRight } from 'lucide-react';

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
          <div className="px-4 py-2.5 bg-gray-50 dark:bg-dark-hover/40 border-b border-gray-200 dark:border-dark-border flex items-center justify-between text-xs text-gray-600 dark:text-dark-muted">
            <div className="flex items-center space-x-2 font-mono">
              <FileText className="w-4 h-4 text-gray-400" />
              <span className="font-bold text-gray-900 dark:text-white">{fileName}</span>
              <span>•</span>
              <span>{lines.length} lines</span>
              <span>•</span>
              <span>{(size / 1024).toFixed(1)} KB</span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleCopy}
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy raw'}</span>
              </button>

              <a
                href={`/api/v1/repos/${owner}/${repoName}/raw?ref=${branch}&path=${filePath}`}
                download={fileName}
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Raw</span>
              </a>
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
    </div>
  );
};

