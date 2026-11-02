import React, { useEffect, useState } from 'react';
import { api, Repository, TreeEntry, Commit } from '../lib/api';
import { RepoNav } from '../components/RepoNav';
import { MarkdownViewer } from '../components/MarkdownViewer';
import { showToast } from '../components/ModalDialog';
import { 
  GitBranch, 
  Folder, 
  FileText, 
  Download, 
  Copy, 
  Check, 
  Terminal, 
  BookOpen, 
  FileCode,
  ChevronRight,
  Clock,
  Plus,
  ChevronDown,
  UploadCloud,
  FilePlus,
  History,
  GitCommit
} from 'lucide-react';

interface RepoCodeProps {
  owner: string;
  repo: string;
  initialPath?: string;
}

function formatRelativeTime(dateInput: string | Date | number): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffInSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));

  if (diffInSeconds < 5) return 'just now';
  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInSeconds / 86400);
  if (diffInDays < 30) return `${diffInDays}d ago`;
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths}mo ago`;
  return `${Math.floor(diffInDays / 365)}y ago`;
}

export const RepoCode: React.FC<RepoCodeProps> = ({ owner, repo: repoName, initialPath = '' }) => {
  const [repoData, setRepoData] = useState<Repository | null>(null);
  const [isStarred, setIsStarred] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState('main');
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [readme, setReadme] = useState<string | null>(null);
  const [latestCommit, setLatestCommit] = useState<Commit | null>(null);
  const [totalCommits, setTotalCommits] = useState<number>(0);
  const [copiedSha, setCopiedSha] = useState(false);
  const [cloneHTTP, setCloneHTTP] = useState('');
  const [cloneSSH, setCloneSSH] = useState('');
  const [cloneTab, setCloneTab] = useState<'http' | 'ssh'>('http');
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [showAddFileModal, setShowAddFileModal] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [branchFilter, setBranchFilter] = useState('');
  const [creatingBranch, setCreatingBranch] = useState(false);

  useEffect(() => {
    async function loadRepo() {
      try {
        const data = await api.getRepo(owner, repoName);
        setRepoData(data.repository);
        setIsStarred(data.is_starred);
        setCanWrite(Boolean(data.can_write || data.permissions?.write));
        setBranches(data.branches || ['main']);
        const branch = data.branches?.[0] || 'main';
        if (data.branches?.length > 0) {
          setCurrentBranch(branch);
        }
        setCloneHTTP(data.clone_url_http);
        setCloneSSH(data.clone_url_ssh);

        const treeData = await api.getTree(owner, repoName, branch, initialPath);
        setEntries(treeData.entries || []);
        setReadme(treeData.readme || null);
        if (treeData.latest_commit) {
          setLatestCommit(treeData.latest_commit);
          setTotalCommits(treeData.total_commits || 1);
        } else {
          try {
            const commits = await api.getCommits(owner, repoName, branch);
            if (commits && commits.length > 0) {
              setLatestCommit(commits[0]);
              setTotalCommits(commits.length);
            }
          } catch {}
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadRepo();
  }, [owner, repoName, initialPath]);

  const handleBranchChange = async (newBranch: string) => {
    setCurrentBranch(newBranch);
    setLoading(true);
    try {
      const treeData = await api.getTree(owner, repoName, newBranch, initialPath);
      setEntries(treeData.entries || []);
      setReadme(treeData.readme || null);
      if (treeData.latest_commit) {
        setLatestCommit(treeData.latest_commit);
        setTotalCommits(treeData.total_commits || 1);
      } else {
        try {
          const commits = await api.getCommits(owner, repoName, newBranch);
          if (commits && commits.length > 0) {
            setLatestCommit(commits[0]);
            setTotalCommits(commits.length);
          } else {
            setLatestCommit(null);
            setTotalCommits(0);
          }
        } catch {}
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStar = async () => {
    if (!repoData) return;
    try {
      const res = await api.toggleStar(owner, repoName);
      setIsStarred(res.starred);
      setRepoData(prev => prev ? { ...prev, num_stars: res.num_stars } : null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyClone = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleQuickCreateBranch = async (name: string) => {
    const cleanName = name.trim();
    if (!cleanName || creatingBranch) return;
    try {
      setCreatingBranch(true);
      await api.createBranch(owner, repoName, cleanName, currentBranch);
      setBranches(prev => [...prev, cleanName]);
      setShowBranchDropdown(false);
      setBranchFilter('');
      showToast(`Branch "${cleanName}" created`, 'success');
      handleBranchChange(cleanName);
    } catch (err: any) {
      showToast(err.message || 'Failed to create branch', 'error');
    } finally {
      setCreatingBranch(false);
    }
  };

  if (loading && !repoData) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading repository...</div>;
  }

  if (!repoData) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Repository not found</h2>
      </div>
    );
  }

  const pathSegments = initialPath ? initialPath.split('/').filter(Boolean) : [];

  return (
    <div>
      <RepoNav
        repo={repoData}
        isStarred={isStarred}
        onToggleStar={handleToggleStar}
        activeTab="code"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Controls: Branch Switcher & Clone Popover */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            {/* Branch Selector Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                className="inline-flex items-center space-x-2 px-3 py-1.5 text-sm font-semibold rounded-lg bg-gray-50 dark:bg-dark-surface border border-gray-300 dark:border-dark-border text-gray-800 dark:text-white hover:bg-gray-100 dark:hover:bg-dark-hover shadow-xs transition-colors"
              >
                <GitBranch className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-mono text-xs sm:text-sm">{currentBranch}</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>

              {showBranchDropdown && (
                <div className="absolute left-0 mt-1 w-72 rounded-xl bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border shadow-xl z-50 overflow-hidden">
                  <div className="p-2.5 border-b border-gray-100 dark:border-dark-border flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-900 dark:text-white">Switch branches</span>
                    <button
                      type="button"
                      onClick={() => setShowBranchDropdown(false)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-white text-base leading-none p-1 rounded-lg transition-colors"
                    >
                      ×
                    </button>
                  </div>

                  {/* Filter input */}
                  <div className="p-2 border-b border-gray-100 dark:border-dark-border">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Find or create a branch..."
                      value={branchFilter}
                      onChange={(e) => setBranchFilter(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                  </div>

                  {/* Quick create branch option if filter doesn't match existing */}
                  {canWrite && branchFilter.trim() && !branches.includes(branchFilter.trim()) && (
                    <button
                      type="button"
                      disabled={creatingBranch}
                      onClick={() => handleQuickCreateBranch(branchFilter.trim())}
                      className="w-full p-2.5 text-left text-xs bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-b border-gray-100 dark:border-dark-border flex items-center space-x-2 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">
                        Create branch <strong className="font-mono">{branchFilter.trim()}</strong> from <span className="font-mono">{currentBranch}</span>
                      </span>
                    </button>
                  )}

                  {/* Branch List */}
                  <div className="max-h-56 overflow-y-auto divide-y divide-gray-50 dark:divide-dark-border/40">
                    {branches
                      .filter((b) => b.toLowerCase().includes(branchFilter.toLowerCase()))
                      .map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => {
                            setShowBranchDropdown(false);
                            setBranchFilter('');
                            handleBranchChange(b);
                          }}
                          className={`w-full px-3 py-2 text-left text-xs font-mono flex items-center justify-between hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors ${
                            b === currentBranch
                              ? 'text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50/30 dark:bg-emerald-950/10'
                              : 'text-gray-700 dark:text-dark-text'
                          }`}
                        >
                          <span className="truncate">{b}</span>
                          {b === currentBranch && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                        </button>
                      ))}
                  </div>

                  {/* Footer link to full branches page */}
                  <div className="p-2 bg-gray-50 dark:bg-dark-hover/40 border-t border-gray-100 dark:border-dark-border text-center">
                    <a
                      href={`/${owner}/${repoName}/branches`}
                      className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      View all branches ({branches.length})
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Direct Link to all branches */}
            <a
              href={`/${owner}/${repoName}/branches`}
              className="hidden sm:inline-flex items-center space-x-1.5 text-xs font-semibold text-gray-500 dark:text-dark-muted hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              <GitBranch className="w-4 h-4" />
              <span>{branches.length} branches</span>
            </a>

            {/* Breadcrumb Path */}
            <div className="flex items-center space-x-1.5 text-sm sm:text-base font-semibold">
              <a href={`/${owner}/${repoName}`} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                {repoName}
              </a>
              {pathSegments.map((segment, idx) => {
                const subPath = pathSegments.slice(0, idx + 1).join('/');
                return (
                  <React.Fragment key={subPath}>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                    <a
                      href={`/${owner}/${repoName}/tree/${currentBranch}/${subPath}`}
                      className="text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      {segment}
                    </a>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Add File Dropdown (restricted to repo owner / collaborators with write access) */}
            {canWrite && (
              <div className="relative">
                <button
                  onClick={() => setShowAddFileModal(!showAddFileModal)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text font-semibold text-sm shadow-xs transition-colors"
                >
                  <span>Add file</span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>

                {showAddFileModal && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl shadow-xl bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border p-1.5 text-xs z-50 divide-y divide-gray-100 dark:divide-dark-border/40">
                    <div className="py-1">
                      <a
                        href={`/${owner}/${repoName}/new/${currentBranch}${initialPath ? '/' + initialPath : ''}`}
                        className="flex items-center space-x-2 px-3 py-2 rounded-lg text-gray-700 dark:text-dark-text hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-700 dark:hover:text-emerald-400 font-medium text-xs"
                      >
                        <FilePlus className="w-4 h-4 text-emerald-600" />
                        <span>Create new file</span>
                      </a>
                    </div>
                    <div className="py-1">
                      <a
                        href={`/${owner}/${repoName}/upload/${currentBranch}${initialPath ? '/' + initialPath : ''}`}
                        className="flex items-center space-x-2 px-3 py-2 rounded-lg text-gray-700 dark:text-dark-text hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-700 dark:hover:text-emerald-400 font-medium text-xs"
                      >
                        <UploadCloud className="w-4 h-4 text-emerald-600" />
                        <span>Upload files</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Clone Popover Button */}
            <div className="relative">
              <button
                onClick={() => setShowCloneModal(!showCloneModal)}
                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-xs transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Code</span>
              </button>

            {showCloneModal && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl shadow-2xl bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border p-4 text-xs z-50 space-y-3">
                <div className="flex space-x-2 border-b border-gray-200 dark:border-dark-border pb-2">
                  <button
                    onClick={() => setCloneTab('http')}
                    className={`font-semibold pb-1 border-b-2 transition-colors ${
                      cloneTab === 'http'
                        ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-dark-muted dark:hover:text-dark-text'
                    }`}
                  >
                    HTTPS / HTTP
                  </button>
                  <button
                    onClick={() => setCloneTab('ssh')}
                    className={`font-semibold pb-1 border-b-2 transition-colors ${
                      cloneTab === 'ssh'
                        ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-dark-muted dark:hover:text-dark-text'
                    }`}
                  >
                    SSH
                  </button>
                </div>

                <div className="flex items-center space-x-1.5">
                  <input
                    type="text"
                    readOnly
                    value={cloneTab === 'http' ? cloneHTTP : cloneSSH}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-xs font-mono text-gray-800 dark:text-dark-text select-all"
                  />
                  <button
                    onClick={() => handleCopyClone(cloneTab === 'http' ? cloneHTTP : cloneSSH)}
                    className="p-1.5 rounded-lg border border-gray-300 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-hover"
                    title="Copy URL"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-gray-500" />}
                  </button>
                </div>

                <p className="text-xs text-gray-500 dark:text-dark-muted">
                  Use Git or checkout with SVN using the web URL.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

        {/* File Tree Table & GitHub-Style Latest Commit Banner */}
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm overflow-hidden">
          {/* Latest Commit Bar (GitHub Style) */}
          {latestCommit ? (
            <div className="px-4 py-3 bg-gray-50/90 dark:bg-dark-hover/40 border-b border-gray-200 dark:border-dark-border flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm">
              {/* Left: Avatar + Author + Commit message */}
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 font-bold flex items-center justify-center shrink-0 border border-emerald-300 dark:border-emerald-800 text-xs shadow-2xs">
                  {latestCommit.author ? latestCommit.author.charAt(0).toUpperCase() : 'U'}
                </div>
                <div className="flex items-center space-x-2 truncate">
                  <a
                    href={`/${latestCommit.author || owner}`}
                    className="font-bold text-gray-900 dark:text-white hover:underline shrink-0"
                  >
                    {latestCommit.author || owner}
                  </a>
                  <a
                    href={`/${owner}/${repoName}/commit/${latestCommit.sha}`}
                    className="text-gray-700 dark:text-dark-text hover:text-emerald-600 dark:hover:text-emerald-400 truncate hover:underline"
                    title={latestCommit.message}
                  >
                    {latestCommit.message}
                  </a>
                </div>
              </div>

              {/* Right: Short SHA + Copy + Relative Time + Total Commits link */}
              <div className="flex items-center space-x-3 shrink-0 text-xs text-gray-500 dark:text-dark-muted self-end md:self-center">
                <div className="flex items-center space-x-1 font-mono">
                  <a
                    href={`/${owner}/${repoName}/commit/${latestCommit.sha}`}
                    className="px-2 py-0.5 rounded-md bg-white dark:bg-dark-hover hover:bg-gray-100 dark:hover:bg-dark-border text-gray-800 dark:text-dark-text border border-gray-200 dark:border-dark-border text-xs hover:underline shadow-2xs"
                    title="View commit details"
                  >
                    {latestCommit.short_sha || latestCommit.sha.slice(0, 7)}
                  </a>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(latestCommit.sha);
                      setCopiedSha(true);
                      setTimeout(() => setCopiedSha(false), 2000);
                    }}
                    className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-dark-hover text-gray-400 hover:text-gray-700 dark:hover:text-dark-text transition-colors"
                    title="Copy full SHA"
                  >
                    {copiedSha ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                <span
                  className="flex items-center text-gray-500 dark:text-dark-muted"
                  title={new Date(latestCommit.timestamp).toLocaleString()}
                >
                  <Clock className="w-3.5 h-3.5 mr-1 text-gray-400" />
                  {formatRelativeTime(latestCommit.timestamp)}
                </span>

                <a
                  href={`/${owner}/${repoName}/commits/${currentBranch}`}
                  className="flex items-center space-x-1 font-semibold text-gray-700 dark:text-dark-text hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline pl-3 border-l border-gray-200 dark:border-dark-border"
                  title="View complete commit history"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>{totalCommits || 1} {totalCommits === 1 ? 'commit' : 'commits'}</span>
                </a>
              </div>
            </div>
          ) : (
            <div className="px-4 py-2.5 bg-gray-50 dark:bg-dark-hover/40 border-b border-gray-200 dark:border-dark-border flex items-center justify-between text-xs text-gray-500 dark:text-dark-muted">
              <span className="font-semibold text-gray-900 dark:text-white">Files</span>
              <span>Latest revision</span>
            </div>
          )}

          <div className="divide-y divide-gray-100 dark:divide-dark-border">
            {initialPath && (
              <a
                href={`/${owner}/${repoName}`}
                className="flex items-center px-4 py-2.5 text-sm text-emerald-600 dark:text-emerald-400 hover:bg-gray-50 dark:hover:bg-dark-hover font-semibold transition-colors"
              >
                ..
              </a>
            )}

            {entries.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">
                This repository is empty. Push commits or initialize with a README.
              </div>
            ) : (
              entries.map(entry => {
                const isDir = entry.type === 'tree';
                const linkHref = isDir
                  ? `/${owner}/${repoName}/tree/${currentBranch}/${entry.path}`
                  : `/${owner}/${repoName}/blob/${currentBranch}/${entry.path}`;

                return (
                  <div
                    key={entry.sha + entry.name}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors text-sm"
                  >
                    <a href={linkHref} className="flex items-center space-x-2.5 text-gray-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 truncate font-medium">
                      {isDir ? (
                        <Folder className="w-4 h-4 text-sky-500 shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                      )}
                      <span className="truncate">{entry.name}</span>
                    </a>
                    {entry.size !== undefined && (
                      <span className="text-xs text-gray-400 font-mono">
                        {(entry.size / 1024).toFixed(1)} KB
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* README.md Preview */}
        {readme && (
          <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50/80 dark:bg-dark-hover/40 border-b border-gray-200 dark:border-dark-border flex items-center space-x-2 text-sm font-semibold text-gray-800 dark:text-white">
              <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>README.md</span>
            </div>
            <div className="p-6">
              <MarkdownViewer content={readme} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

