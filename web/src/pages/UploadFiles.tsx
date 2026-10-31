import React, { useEffect, useRef, useState } from 'react';
import { api, Repository } from '../lib/api';
import { RepoNav } from '../components/RepoNav';
import { 
  UploadCloud, 
  File, 
  Folder, 
  X, 
  GitCommit, 
  GitBranch, 
  ArrowLeft, 
  AlertCircle,
  CheckCircle2
} from 'lucide-react';

interface UploadFilesProps {
  owner: string;
  repo: string;
  branch?: string;
  initialPath?: string;
}

interface StagedFile {
  file: File;
  relativePath: string;
  size: number;
}

export const UploadFiles: React.FC<UploadFilesProps> = ({
  owner,
  repo: repoName,
  branch = 'main',
  initialPath = '',
}) => {
  const [repoData, setRepoData] = useState<Repository | null>(null);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [commitMessage, setCommitMessage] = useState('Upload files');
  const [commitDescription, setCommitDescription] = useState('');
  const [commitTarget, setCommitTarget] = useState<'direct' | 'new-branch'>('direct');
  const [newBranchName, setNewBranchName] = useState(`${owner}-patch-1`);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const r = await api.getRepo(owner, repoName);
        setRepoData(r.repository);
      } catch (err: any) {
        setError(err.message || 'Failed to load repository');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [owner, repoName]);

  const addFiles = (files: FileList | File[], isFolder = false) => {
    const list: StagedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      // If folder upload via webkitRelativePath, preserve it
      const relPath = f.webkitRelativePath || f.name;
      list.push({
        file: f,
        relativePath: relPath,
        size: f.size,
      });
    }

    setStagedFiles((prev) => {
      const combined = [...prev, ...list];
      // Deduplicate by relativePath
      const uniqueMap = new Map<string, StagedFile>();
      combined.forEach((item) => uniqueMap.set(item.relativePath, item));
      const nextList = Array.from(uniqueMap.values());
      if (nextList.length > 0 && commitMessage === 'Upload files') {
        setCommitMessage(
          nextList.length === 1
            ? `Upload ${nextList[0].relativePath}`
            : `Upload ${nextList.length} files`
        );
      }
      return nextList;
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (relPath: string) => {
    setStagedFiles((prev) => prev.filter((f) => f.relativePath !== relPath));
  };

  const clearAll = () => {
    setStagedFiles([]);
    setCommitMessage('Upload files');
  };

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stagedFiles.length === 0) {
      alert('Please choose or drop files to upload');
      return;
    }

    try {
      setUploading(true);
      setError('');

      const formData = new FormData();
      formData.append('branch', branch);
      if (commitTarget === 'new-branch' && newBranchName.trim()) {
        formData.append('new_branch', newBranchName.trim());
      }
      formData.append('path', initialPath);
      const fullMessage = commitDescription
        ? `${commitMessage.trim()}\n\n${commitDescription.trim()}`
        : commitMessage.trim();
      formData.append('message', fullMessage || `Upload ${stagedFiles.length} files`);

      const relativePaths: string[] = [];
      stagedFiles.forEach((sf) => {
        formData.append('files', sf.file, sf.file.name);
        relativePaths.push(sf.relativePath);
      });
      formData.append('relative_paths', JSON.stringify(relativePaths));

      const res = await api.uploadFiles(owner, repoName, formData);

      // Redirect back to tree
      const targetBranch = res.branch || branch;
      const targetPath = initialPath ? `/${initialPath}` : '';
      window.location.href = `/${owner}/${repoName}/tree/${targetBranch}${targetPath}`;
    } catch (err: any) {
      setError(err.message || 'Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  if (loading && !repoData) {
    return (
      <div className="py-20 text-center text-sm text-gray-400">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        Loading uploader...
      </div>
    );
  }

  if (!repoData) {
    return <div className="py-20 text-center text-sm">Repository not found</div>;
  }

  const totalSize = stagedFiles.reduce((acc, f) => acc + f.size, 0);

  return (
    <div>
      <RepoNav repo={repoData} activeTab="code" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center space-x-2 text-sm font-semibold flex-wrap">
          <a
            href={`/${owner}/${repoName}/tree/${branch}${initialPath ? '/' + initialPath : ''}`}
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
          {initialPath && (
            <>
              <span className="text-gray-400">/</span>
              <span className="font-mono text-gray-700 dark:text-gray-300">{initialPath}</span>
            </>
          )}
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-xs font-semibold text-red-700 dark:text-red-400 flex items-center">
            <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Drag and Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-2xl p-10 text-center transition-colors ${
            isDragging
              ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
              : 'border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:border-gray-400'
          }`}
        >
          <UploadCloud className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-900 dark:text-white">
            Drag files here to add them to your repository
          </h3>
          <p className="text-xs text-gray-500 dark:text-dark-muted mt-1">
            Upload files or entire folders directly to branch <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">{branch}</span>
          </p>

          <div className="flex items-center justify-center space-x-3 mt-5">
            <input
              type="file"
              multiple
              ref={fileInputRef}
              onChange={(e) => e.target.files && addFiles(e.target.files)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text shadow-sm"
            >
              Choose your files
            </button>

            {/* Folder Upload */}
            <input
              type="file"
              multiple
              // @ts-ignore
              webkitdirectory=""
              ref={folderInputRef}
              onChange={(e) => e.target.files && addFiles(e.target.files, true)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text shadow-sm flex items-center space-x-1.5"
            >
              <Folder className="w-3.5 h-3.5 text-amber-500" />
              <span>Choose folder</span>
            </button>
          </div>
        </div>

        {/* Staged Files List */}
        {stagedFiles.length > 0 && (
          <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-hover/40 flex items-center justify-between text-xs font-semibold">
              <span className="text-gray-700 dark:text-dark-text flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Files to be uploaded ({stagedFiles.length})</span>
                <span className="text-gray-400 font-normal">
                  • {(totalSize / 1024).toFixed(1)} KB total
                </span>
              </span>
              <button
                type="button"
                onClick={clearAll}
                className="text-red-600 hover:text-red-700 text-xs font-medium"
              >
                Clear all
              </button>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-dark-border/40 max-h-72 overflow-y-auto">
              {stagedFiles.map((sf) => (
                <div
                  key={sf.relativePath}
                  className="px-5 py-2.5 flex items-center justify-between text-xs hover:bg-gray-50 dark:hover:bg-dark-hover/30"
                >
                  <div className="flex items-center space-x-2 truncate pr-4">
                    <File className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="font-mono text-gray-800 dark:text-gray-200 truncate">
                      {sf.relativePath}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 shrink-0">
                    <span className="text-[11px] text-gray-400">
                      {(sf.size / 1024).toFixed(1)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(sf.relativePath)}
                      className="text-gray-400 hover:text-red-600 transition-colors"
                      title="Remove file"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Commit Changes Box */}
        <form
          onSubmit={handleCommit}
          className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm p-6 space-y-4"
        >
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
              href={`/${owner}/${repoName}/tree/${branch}${initialPath ? '/' + initialPath : ''}`}
              className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-dark-text bg-gray-100 dark:bg-dark-hover rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </a>
            <button
              type="submit"
              disabled={uploading || stagedFiles.length === 0}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors flex items-center space-x-1.5"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>{uploading ? 'Uploading & Committing...' : `Commit ${stagedFiles.length} files`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

