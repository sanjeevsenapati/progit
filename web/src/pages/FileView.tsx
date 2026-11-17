import React, { useEffect, useState } from 'react';
import { api, Repository, RepoResponse, Commit, BlameLine } from '../lib/api';
import { navigate } from '../lib/router';
import { useTheme } from '../lib/theme';
import { RepoNav } from '../components/RepoNav';
import { FileExplorerSidebar } from '../components/FileExplorerSidebar';
import { MarkdownViewer } from '../components/MarkdownViewer';
import { showToast } from '../components/ModalDialog';
import { 
  detectLanguage, 
  highlightCode, 
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
  BookOpen,
  Code, 
  History, 
  PanelLeft, 
  Clock 
} from 'lucide-react';

interface FileViewProps {
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
}

export const FileView: React.FC<FileViewProps> = ({ owner, repo: repoName, branch, filePath }) => {
  const { theme } = useTheme();
  const autoEditorTheme: PrettierTheme = theme === 'dark' ? 'prettier-dark' : 'prettier-light';

  const cachedRepo = api.getCachedRepo(owner, repoName);
  const [repoData, setRepoData] = useState<Repository | null>(() => cachedRepo?.repository || null);
  const [repoPermissions, setRepoPermissions] = useState<RepoResponse['permissions'] | undefined>(cachedRepo?.permissions);
  const [branches, setBranches] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [size, setSize] = useState(0);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [canWrite, setCanWrite] = useState(() => Boolean(cachedRepo?.can_write || cachedRepo?.permissions?.write));
  const [canDownload, setCanDownload] = useState(() => cachedRepo?.permissions ? cachedRepo.permissions.download !== false : true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [latestCommit, setLatestCommit] = useState<Commit | null>(null);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState(`Delete ${filePath}`);
  const [deleting, setDeleting] = useState(false);

  // Markdown view mode
  const isMarkdown = filePath.toLowerCase().endsWith('.md');
  const [viewMode, setViewMode] = useState<'rendered' | 'source'>(isMarkdown ? 'rendered' : 'source');

  // Code vs Blame view mode
  const [activeTab, setActiveTab] = useState<'code' | 'blame'>('code');
  const [blameLines, setBlameLines] = useState<BlameLine[]>([]);
  const [loadingBlame, setLoadingBlame] = useState(false);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#L')) {
      const num = parseInt(hash.slice(2), 10);
      if (!isNaN(num)) {
        setSelectedLine(num);
      }
    }
  }, []);

  const handleLineClick = (lineNum: number, e: React.MouseEvent) => {
    e.preventDefault();
    setSelectedLine(lineNum);
    const hash = `#L${lineNum}`;
    window.history.replaceState(null, '', `${window.location.pathname}${hash}`);
    navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}${hash}`);
    showToast(`Copied permalink for line ${lineNum}`);
  };

  const loadBlame = async () => {
    if (blameLines.length > 0) return;
    try {
      setLoadingBlame(true);
      const data = await api.getBlame(owner, repoName, branch, filePath);
      setBlameLines(data.lines || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load blame', 'error');
    } finally {
      setLoadingBlame(false);
    }
  };

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [r, b] = await Promise.all([
          api.getRepo(owner, repoName),
          api.getBlob(owner, repoName, branch, filePath),
        ]);
        setRepoData(r.repository);
        setRepoPermissions(r.permissions);
        setBranches(r.branches || [branch]);
        setCanWrite(Boolean(r.can_write || r.permissions?.write));
        setCanDownload(r.permissions ? r.permissions.download !== false : true);
        setContent(b.content);
        setSize(b.size);

        // Fetch commit details for this path
        try {
          const commits = await api.getCommits(owner, repoName, branch);
          if (commits && commits.length > 0) {
            setLatestCommit(commits[0]);
          }
        } catch {}
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
    return (
      <div className="py-20 text-center text-sm text-gray-400">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        Loading file...
      </div>
    );
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
      <RepoNav repo={repoData} permissions={repoPermissions} activeTab="code" />

      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 py-5">
        {/* Main Content: File Explorer Sidebar + File Content Viewer */}
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          {/* File Explorer Sidebar */}
          <FileExplorerSidebar
            owner={owner}
            repo={repoName}
            branch={branch}
            currentPath={filePath}
            branches={branches}
            isOpen={isSidebarOpen}
            onToggleOpen={() => setIsSidebarOpen(false)}
            onSelectFile={(selectedPath) => {
              navigate(`/${owner}/${repoName}/blob/${branch}/${selectedPath}`);
            }}
            onBranchChange={(newBranch) => {
              navigate(`/${owner}/${repoName}/blob/${newBranch}/${filePath}`);
            }}
            onNewFile={() => {
              navigate(`/${owner}/${repoName}/new/${branch}`);
            }}
          />

          {/* Right: File Viewer Area */}
          <div className="flex-1 min-w-0 space-y-4 w-full">
            {/* Top Breadcrumb Bar (GitHub Style) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-dark-surface p-3 rounded-xl border border-gray-200 dark:border-dark-border shadow-xs">
              <div className="flex items-center space-x-1.5 text-sm font-semibold text-gray-600 dark:text-dark-muted flex-wrap">
                {!isSidebarOpen && (
                  <button
                    type="button"
                    onClick={() => setIsSidebarOpen(true)}
                    className="p-1.5 mr-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-100 transition-colors cursor-pointer flex items-center space-x-1"
                    title="Show file tree"
                  >
                    <PanelLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-bold">Files</span>
                  </button>
                )}

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
                        <span className="text-gray-900 dark:text-white font-bold font-mono">{part}</span>
                      ) : (
                        <a
                          href={`/${owner}/${repoName}/tree/${branch}/${sub}`}
                          className="text-emerald-600 dark:text-emerald-400 hover:underline font-mono"
                        >
                          {part}
                        </a>
                      )}
                    </React.Fragment>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(filePath);
                    showToast('Copied file path to clipboard');
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-dark-text ml-1"
                  title="Copy path"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center space-x-2">
                <a
                  href={`/${owner}/${repoName}/commits/${branch}`}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-600 dark:text-dark-muted hover:text-emerald-600 transition-colors"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>History</span>
                </a>
              </div>
            </div>

            {/* Latest Commit Bar (GitHub Style) */}
            {latestCommit && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-xs shadow-xs">
                <div className="flex items-center space-x-2 truncate">
                  <div className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                    {latestCommit.author ? latestCommit.author.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <span className="font-semibold text-gray-900 dark:text-white truncate">
                    {latestCommit.author}
                  </span>
                  <span className="text-gray-600 dark:text-dark-muted truncate">
                    {latestCommit.message}
                  </span>
                </div>
                <div className="flex items-center space-x-3 text-gray-500 dark:text-dark-muted shrink-0 text-[11px] font-mono">
                  <span className="bg-gray-100 dark:bg-dark-hover px-1.5 py-0.5 rounded">
                    {latestCommit.short_sha || latestCommit.sha?.substring(0, 7)}
                  </span>
                  <span className="text-gray-400">
                    {latestCommit.timestamp ? new Date(latestCommit.timestamp).toLocaleDateString() : ''}
                  </span>
                </div>
              </div>
            )}

            {/* File Content Box */}
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-xs overflow-hidden">
              {/* Box Sub-header (Code/Blame, Lines/Size, Actions) */}
              <div className="px-4 py-2 bg-gray-50 dark:bg-[#14161f] border-b border-gray-200 dark:border-dark-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-gray-600 dark:text-dark-muted">
                {/* Left: Code/Blame Switcher & Markdown Mode & Info */}
                <div className="flex items-center space-x-3 flex-wrap">
                  <div className="flex space-x-1 p-0.5 rounded-lg bg-gray-200/60 dark:bg-dark-hover border border-gray-200 dark:border-dark-border text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setActiveTab('code')}
                      className={`flex items-center space-x-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                        activeTab === 'code'
                          ? 'bg-white dark:bg-dark-surface shadow-2xs text-emerald-600 dark:text-emerald-400 font-bold'
                          : 'text-gray-600 dark:text-dark-muted hover:text-gray-900'
                      }`}
                    >
                      <Code className="w-3.5 h-3.5" />
                      <span>Code</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('blame');
                        loadBlame();
                      }}
                      className={`flex items-center space-x-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                        activeTab === 'blame'
                          ? 'bg-white dark:bg-dark-surface shadow-2xs text-emerald-600 dark:text-emerald-400 font-bold'
                          : 'text-gray-600 dark:text-dark-muted hover:text-gray-900'
                      }`}
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Blame</span>
                    </button>
                  </div>

                  {isMarkdown && activeTab === 'code' && (
                    <div className="flex space-x-1 p-0.5 rounded-lg bg-gray-200/60 dark:bg-dark-hover border border-gray-200 dark:border-dark-border text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setViewMode('rendered')}
                        className={`flex items-center space-x-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                          viewMode === 'rendered'
                            ? 'bg-white dark:bg-dark-surface shadow-2xs text-emerald-600 dark:text-emerald-400 font-bold'
                            : 'text-gray-600 dark:text-dark-muted hover:text-gray-900'
                        }`}
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('source')}
                        className={`flex items-center space-x-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                          viewMode === 'source'
                            ? 'bg-white dark:bg-dark-surface shadow-2xs text-emerald-600 dark:text-emerald-400 font-bold'
                            : 'text-gray-600 dark:text-dark-muted hover:text-gray-900'
                        }`}
                      >
                        <Code className="w-3.5 h-3.5" />
                        <span>Source</span>
                      </button>
                    </div>
                  )}

                  <div className="flex items-center space-x-2 font-mono text-[11px] text-gray-500">
                    <span>{lines.length} lines</span>
                    <span>•</span>
                    <span>{(size / 1024).toFixed(1)} KB</span>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center space-x-2">
                  {/* Edit file online */}
                  {canWrite && (
                    <a
                      href={`/${owner}/${repoName}/edit/${branch}/${filePath}`}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text shadow-2xs font-semibold"
                      title="Edit this file online"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Edit</span>
                    </a>
                  )}

                  {/* Copy & Raw Download (hidden when downloads restricted) */}
                  {canDownload && (
                    <>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text cursor-pointer"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                      </button>

                      <a
                        href={`/api/v1/repos/${owner}/${repoName}/raw?ref=${encodeURIComponent(branch)}&path=${encodeURIComponent(filePath)}`}
                        download={fileName}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Raw</span>
                      </a>
                    </>
                  )}

                  {/* Delete file */}
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => setShowDeleteModal(true)}
                      className="inline-flex items-center space-x-1 p-1 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 hover:bg-red-100 text-red-600 dark:text-red-400 cursor-pointer"
                      title="Delete this file"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* File Content Body */}
              {activeTab === 'blame' ? (
                <div className={`overflow-x-auto text-xs font-mono transition-colors ${autoEditorTheme}`}>
                  {loadingBlame ? (
                    <div className="py-16 text-center text-gray-400 space-y-2">
                      <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                      <p>Loading git blame information...</p>
                    </div>
                  ) : blameLines.length === 0 ? (
                    <div className="py-16 text-center text-gray-400">
                      No blame information available for this file.
                    </div>
                  ) : (
                    <table className="w-full border-collapse">
                      <tbody>
                        {blameLines.map((blame, idx) => (
                          <tr
                            key={idx}
                            id={`L${blame.line_number}`}
                            className={`hover:bg-emerald-500/5 group ${
                              selectedLine === blame.line_number ? 'bg-amber-100/70 dark:bg-amber-950/40 ring-1 ring-amber-400' : ''
                            }`}
                          >
                            {/* Commit author & summary gutter */}
                            <td className="w-64 py-0.5 px-3 border-r border-gray-200 dark:border-dark-border text-gray-500 dark:text-dark-muted font-sans text-[11px] truncate select-none bg-gray-50/50 dark:bg-dark-bg/40">
                              <div className="flex items-center space-x-2 truncate">
                                <a
                                  href={`/${owner}/${repoName}/commit/${blame.commit_sha}`}
                                  className="font-mono text-emerald-600 dark:text-emerald-400 hover:underline shrink-0"
                                  title={`Commit: ${blame.commit_sha} - ${blame.summary}`}
                                >
                                  {blame.short_sha}
                                </a>
                                <span className="font-semibold text-gray-700 dark:text-gray-300 truncate">{blame.author}</span>
                                <span className="text-[10px] text-gray-400 shrink-0">
                                  {blame.timestamp ? new Date(blame.timestamp).toLocaleDateString() : ''}
                                </span>
                              </div>
                            </td>
                            {/* Clickable Line Number */}
                            <td className="w-12 text-right pr-3 pl-2 py-0.5 border-r border-gray-200 dark:border-dark-border select-none">
                              <a
                                href={`#L${blame.line_number}`}
                                onClick={(e) => handleLineClick(blame.line_number, e)}
                                className={`text-[11px] font-mono block cursor-pointer transition-colors ${
                                  selectedLine === blame.line_number ? 'text-amber-600 font-bold' : 'text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                }`}
                              >
                                {blame.line_number}
                              </a>
                            </td>
                            {/* Code Line */}
                            <td className="pl-4 pr-4 py-0.5 whitespace-pre overflow-x-auto">
                              <span dangerouslySetInnerHTML={{ __html: highlightCode(blame.content || ' ', language) }} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : isMarkdown && viewMode === 'rendered' ? (
                <div className="p-6">
                  <MarkdownViewer content={content || '*Empty markdown file*'} owner={owner} repo={repoName} branch={branch} />
                </div>
              ) : (
                <div className={`overflow-x-auto text-xs font-mono transition-colors ${autoEditorTheme}`}>
                  <table className="w-full border-collapse">
                    <tbody>
                      {lines.map((line, idx) => (
                        <tr
                          key={idx}
                          id={`L${idx + 1}`}
                          className={`hover:bg-emerald-500/5 group ${
                            selectedLine === idx + 1 ? 'bg-amber-100/70 dark:bg-amber-950/40 ring-1 ring-amber-400' : ''
                          }`}
                        >
                          <td
                            className={`select-none text-right pr-4 pl-4 py-0.5 border-r w-12 text-gray-400 font-mono text-[11px] ${
                              selectedLine === idx + 1
                                ? 'bg-amber-400 text-gray-950 font-bold border-amber-500'
                                : autoEditorTheme === 'prettier-light'
                                ? 'border-gray-200 bg-gray-50/70 text-gray-400'
                                : 'border-white/10 bg-black/20 text-gray-500'
                            }`}
                          >
                            <a
                              href={`#L${idx + 1}`}
                              onClick={(e) => handleLineClick(idx + 1, e)}
                              className="block cursor-pointer transition-colors hover:text-gray-900 dark:hover:text-white"
                            >
                              {idx + 1}
                            </a>
                          </td>
                          <td className="pl-4 pr-4 py-0.5 whitespace-pre overflow-x-auto">
                            <span
                              dangerouslySetInnerHTML={{
                                __html: highlightCode(line || ' ', language),
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-dark-border">
              <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold text-base text-gray-900 dark:text-white">Delete file</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-dark-muted">
              Are you sure you want to delete <span className="font-mono font-bold text-gray-900 dark:text-white">{filePath}</span> from branch <span className="font-mono font-bold text-emerald-600">{branch}</span>? This action creates a commit removing the file.
            </p>

            <form onSubmit={handleDelete} className="space-y-4">
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

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleting}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {deleting ? 'Deleting...' : 'Commit Deletion'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
