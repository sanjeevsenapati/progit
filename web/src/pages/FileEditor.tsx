import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api, Repository, TreeEntry } from '../lib/api';
import { navigate } from '../lib/router';
import { useTheme } from '../lib/theme';
import { RepoNav } from '../components/RepoNav';
import { MarkdownViewer } from '../components/MarkdownViewer';
import { showToast } from '../components/ModalDialog';
import { 
  detectLanguage, 
  highlightCode, 
  formatWithPrettier, 
  PrettierTheme 
} from '../lib/codeEditor';
import { 
  FileCode, 
  FileText,
  FilePlus,
  Folder,
  FolderOpen,
  Eye, 
  Code, 
  GitCommit, 
  GitBranch, 
  ChevronRight, 
  ChevronDown,
  AlertCircle,
  ArrowLeft,
  Sparkles,
  PanelLeftClose,
  PanelLeft,
  FolderTree,
  Search,
  RefreshCw,
  Loader2,
  Check
} from 'lucide-react';

interface FileEditorProps {
  owner: string;
  repo: string;
  branch?: string;
  filePath?: string;
  initialDirectory?: string;
  mode: 'new' | 'edit';
}

interface FileTreeItemProps {
  entry: TreeEntry;
  depth: number;
  activePath: string;
  expandedFolders: Set<string>;
  folderChildren: Record<string, TreeEntry[]>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
}

const FileTreeItem: React.FC<FileTreeItemProps> = ({
  entry,
  depth,
  activePath,
  expandedFolders,
  folderChildren,
  onToggleFolder,
  onSelectFile,
}) => {
  const isTree = entry.type === 'tree';
  const isExpanded = expandedFolders.has(entry.path);
  const isActive = entry.path === activePath;
  const children = folderChildren[entry.path] || [];

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (isTree) {
            onToggleFolder(entry.path);
          } else {
            onSelectFile(entry.path);
          }
        }}
        style={{ paddingLeft: `${Math.max(6, depth * 14 + 6)}px` }}
        className={`w-full text-left py-1 px-2 flex items-center space-x-1.5 text-xs font-mono transition-colors rounded-md group cursor-pointer ${
          isActive
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border-l-2 border-emerald-500'
            : 'text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover/70'
        }`}
      >
        {isTree ? (
          <>
            <ChevronRight
              className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform duration-150 ${
                isExpanded ? 'rotate-90 text-emerald-500' : ''
              }`}
            />
            {isExpanded ? (
              <FolderOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            {entry.name.endsWith('.md') ? (
              <FileText className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            ) : (
              <FileCode className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            )}
          </>
        )}
        <span className="truncate flex-1">{entry.name}</span>
      </button>

      {isTree && isExpanded && (
        <div className="space-y-0.5">
          {children.length === 0 ? (
            <div
              style={{ paddingLeft: `${(depth + 1) * 14 + 16}px` }}
              className="py-0.5 text-[11px] text-gray-400 italic"
            >
              Empty directory
            </div>
          ) : (
            children.map((child) => (
              <FileTreeItem
                key={child.path}
                entry={child}
                depth={depth + 1}
                activePath={activePath}
                expandedFolders={expandedFolders}
                folderChildren={folderChildren}
                onToggleFolder={onToggleFolder}
                onSelectFile={onSelectFile}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export const FileEditor: React.FC<FileEditorProps> = ({
  owner,
  repo: repoName,
  branch = 'main',
  filePath = '',
  initialDirectory = '',
  mode,
}) => {
  const { theme } = useTheme();
  // Auto Theme: automatically adapt to global light or dark theme
  const autoEditorTheme: PrettierTheme = theme === 'dark' ? 'prettier-dark' : 'prettier-light';

  const [repoData, setRepoData] = useState<Repository | null>(() => api.getCachedRepo(owner, repoName)?.repository || null);
  const [currentMode, setCurrentMode] = useState<'new' | 'edit'>(mode);
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
  const [canWrite, setCanWrite] = useState(true);
  const [error, setError] = useState('');

  // Explorer Tree State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [treeEntries, setTreeEntries] = useState<TreeEntry[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [folderChildren, setFolderChildren] = useState<Record<string, TreeEntry[]>>({});
  const [loadingTree, setLoadingTree] = useState(false);
  const [fileFilter, setFileFilter] = useState('');

  // Editor Settings
  const [tabSize, setTabSize] = useState<number>(2);
  const [formatNotice, setFormatNotice] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load repository tree
  const loadTree = useCallback(async () => {
    try {
      setLoadingTree(true);
      const res = await api.getTree(owner, repoName, branch, '');
      setTreeEntries(res.entries || []);

      // If editing a file in a subfolder, automatically expand parent folders
      if (filePath && filePath.includes('/')) {
        const parts = filePath.split('/');
        parts.pop(); // remove filename
        const newExpanded = new Set<string>();
        let currentAcc = '';
        for (const p of parts) {
          currentAcc = currentAcc ? `${currentAcc}/${p}` : p;
          newExpanded.add(currentAcc);
          try {
            const subRes = await api.getTree(owner, repoName, branch, currentAcc);
            setFolderChildren((prev) => ({ ...prev, [currentAcc]: subRes.entries || [] }));
          } catch {}
        }
        setExpandedFolders(newExpanded);
      }
    } catch (err) {
      console.error('Failed to load explorer tree:', err);
    } finally {
      setLoadingTree(false);
    }
  }, [owner, repoName, branch, filePath]);

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        const r = await api.getRepo(owner, repoName);
        setRepoData(r.repository);
        const hasAccess = Boolean(r.can_write || r.permissions?.write);
        setCanWrite(hasAccess);
        if (!hasAccess) {
          setError('You do not have write permissions to this repository.');
        }

        if (mode === 'edit' && filePath) {
          const b = await api.getBlob(owner, repoName, branch, filePath);
          setContent(b.content);
          setCommitMessage(`Update ${filePath}`);
        }

        await loadTree();
      } catch (err: any) {
        setError(err.message || 'Failed to load file');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [owner, repoName, branch, filePath, mode, loadTree]);

  // Handle folder expand / collapse
  const handleToggleFolder = async (folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });

    if (!folderChildren[folderPath]) {
      try {
        const res = await api.getTree(owner, repoName, branch, folderPath);
        setFolderChildren((prev) => ({ ...prev, [folderPath]: res.entries || [] }));
      } catch (err) {
        console.error(`Failed to load directory ${folderPath}:`, err);
      }
    }
  };

  // Switch to editing selected file from explorer
  const handleSelectFile = async (selectedPath: string) => {
    if (selectedPath === pathInput && currentMode === 'edit') return;

    try {
      setLoading(true);
      setError('');
      const b = await api.getBlob(owner, repoName, branch, selectedPath);
      setPathInput(selectedPath);
      setContent(b.content);
      setCurrentMode('edit');
      setCommitMessage(`Update ${selectedPath}`);
      window.history.pushState(null, '', `/${owner}/${repoName}/edit/${branch}/${selectedPath}`);
    } catch (err: any) {
      showToast(err.message || 'Failed to load file', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Start new file from explorer
  const handleCreateNewFile = () => {
    setPathInput('');
    setContent('');
    setCurrentMode('new');
    setCommitMessage('Create new file');
    window.history.pushState(null, '', `/${owner}/${repoName}/new/${branch}`);
  };

  // Format code with Prettier
  const handleFormatCode = () => {
    const lang = detectLanguage(pathInput);
    const { formatted, changed, error: formatErr } = formatWithPrettier(content, lang, tabSize);
    if (formatErr) {
      setFormatNotice(`⚠️ ${formatErr}`);
      setTimeout(() => setFormatNotice(null), 3000);
      return;
    }
    if (changed) {
      setContent(formatted);
      setFormatNotice('✨ Formatted with Prettier');
      setTimeout(() => setFormatNotice(null), 2500);
    } else {
      setFormatNotice('Code is already Prettier formatted');
      setTimeout(() => setFormatNotice(null), 2000);
    }
  };

  // Intercept Tab key in textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const spaces = ' '.repeat(tabSize);

      const newContent = content.substring(0, start) + spaces + content.substring(end);
      setContent(newContent);

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + tabSize;
      }, 0);
    }
  };

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) {
      setError('You do not have write access to this repository.');
      return;
    }
    const cleanPath = pathInput.trim().replace(/^\/+/, '');
    if (!cleanPath) {
      showToast('Please provide a file name', 'error');
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
        message: fullMessage || (currentMode === 'edit' ? `Update ${cleanPath}` : `Create ${cleanPath}`),
      });

      const targetBranch = res.branch || branch;
      navigate(`/${owner}/${repoName}/blob/${targetBranch}/${cleanPath}`);
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
        Loading file editor...
      </div>
    );
  }

  if (!repoData) {
    return <div className="py-20 text-center text-sm">Repository not found</div>;
  }

  const isMarkdown = pathInput.toLowerCase().endsWith('.md');
  const language = detectLanguage(pathInput);
  const lines = content.split('\n');

  // Filtered files for explorer search
  const filteredTreeEntries = fileFilter.trim()
    ? treeEntries.filter((e) => e.name.toLowerCase().includes(fileFilter.toLowerCase()))
    : treeEntries;

  return (
    <div>
      <RepoNav repo={repoData} activeTab="code" />

      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 py-5 space-y-4">
        {/* Top Header: Breadcrumbs & Path Input */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-dark-surface p-3.5 rounded-xl border border-gray-200 dark:border-dark-border shadow-xs">
          <div className="flex items-center space-x-2 text-sm font-semibold flex-wrap">
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className={`p-1.5 rounded-lg border text-xs flex items-center space-x-1.5 transition-colors cursor-pointer mr-1 ${
                isSidebarOpen
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                  : 'bg-gray-100 dark:bg-dark-hover border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text hover:bg-gray-200'
              }`}
              title={isSidebarOpen ? 'Hide file tree explorer' : 'Show file tree explorer'}
            >
              {isSidebarOpen ? (
                <PanelLeftClose className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <PanelLeft className="w-4 h-4 text-gray-600 dark:text-dark-muted" />
              )}
              <span className="text-[11px] font-bold hidden sm:inline">Explorer</span>
            </button>

            <a
              href={`/${owner}/${repoName}/tree/${branch}`}
              className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
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
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                placeholder="filename or path (e.g. src/app.tsx)"
                className="px-3 py-1 text-xs font-mono rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 min-w-[200px] sm:min-w-[320px]"
              />
            </div>
          </div>

          {/* Edit / Preview Tabs */}
          <div className="flex items-center space-x-2">
            <div className="flex space-x-1 p-1 rounded-lg bg-gray-100 dark:bg-dark-hover border border-gray-200 dark:border-dark-border text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('edit')}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  activeTab === 'edit'
                    ? 'bg-white dark:bg-dark-surface shadow-xs text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'text-gray-600 dark:text-dark-muted hover:text-gray-900'
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  activeTab === 'preview'
                    ? 'bg-white dark:bg-dark-surface shadow-xs text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'text-gray-600 dark:text-dark-muted hover:text-gray-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-xs font-semibold text-red-700 dark:text-red-400 flex items-center">
            <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Main Split Layout: File Explorer Sidebar + Code Editor */}
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          {/* GitHub-Style File Tree Explorer Sidebar */}
          {isSidebarOpen && (
            <div className="w-full lg:w-64 xl:w-72 shrink-0 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm overflow-hidden flex flex-col">
              {/* Explorer Header */}
              <div className="px-3 py-2.5 bg-gray-50 dark:bg-dark-hover/60 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-gray-800 dark:text-white uppercase tracking-wider">
                  <FolderTree className="w-4 h-4 text-emerald-600" />
                  <span>Files</span>
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={handleCreateNewFile}
                    className="p-1 rounded text-gray-500 hover:text-emerald-600 hover:bg-gray-200 dark:hover:bg-dark-hover transition-colors cursor-pointer"
                    title="New file"
                  >
                    <FilePlus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={loadTree}
                    className="p-1 rounded text-gray-500 hover:text-emerald-600 hover:bg-gray-200 dark:hover:bg-dark-hover transition-colors cursor-pointer"
                    title="Refresh file tree"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingTree ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Filter search in file tree */}
              <div className="p-2 border-b border-gray-100 dark:border-dark-border/40">
                <div className="relative">
                  <Search className="w-3 h-3 text-gray-400 absolute left-2.5 top-2 pointer-events-none" />
                  <input
                    type="text"
                    value={fileFilter}
                    onChange={(e) => setFileFilter(e.target.value)}
                    placeholder="Filter files..."
                    className="w-full pl-7 pr-2 py-1 text-[11px] rounded-md border border-gray-200 dark:border-dark-border/60 bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Tree Items List */}
              <div className="p-2 max-h-[560px] overflow-y-auto space-y-0.5">
                {loadingTree && treeEntries.length === 0 ? (
                  <div className="py-8 text-center text-xs text-gray-400 space-y-1">
                    <Loader2 className="w-4 h-4 animate-spin mx-auto text-emerald-500" />
                    <span>Loading repository tree...</span>
                  </div>
                ) : filteredTreeEntries.length === 0 ? (
                  <div className="py-6 text-center text-xs text-gray-400">
                    No matching files found
                  </div>
                ) : (
                  filteredTreeEntries.map((entry) => (
                    <FileTreeItem
                      key={entry.path}
                      entry={entry}
                      depth={0}
                      activePath={pathInput}
                      expandedFolders={expandedFolders}
                      folderChildren={folderChildren}
                      onToggleFolder={handleToggleFolder}
                      onSelectFile={handleSelectFile}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {/* Editor & Commit Pane */}
          <div className="flex-1 min-w-0 space-y-4 w-full">
            {/* Editor Box */}
            <div className="rounded-xl border border-gray-200 dark:border-dark-border shadow-sm overflow-hidden bg-white dark:bg-dark-surface">
              {/* Editor Sub-toolbar */}
              <div className="px-4 py-2 bg-gray-50 dark:bg-[#14161f] border-b border-gray-200 dark:border-dark-border flex flex-wrap items-center justify-between gap-3 text-xs">
                {/* Left: Auto Theme & File Info */}
                <div className="flex items-center space-x-3">
                  <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                    <Sparkles className="w-3 h-3 text-emerald-500" />
                    <span>Auto Theme: {theme === 'dark' ? 'Dark' : 'Light'}</span>
                  </div>

                  {/* Indent Tab Size */}
                  <div className="flex items-center space-x-1">
                    <span className="text-gray-500 dark:text-dark-muted font-medium">Indent:</span>
                    <button
                      type="button"
                      onClick={() => setTabSize(tabSize === 2 ? 4 : 2)}
                      className="px-2 py-0.5 rounded text-[11px] font-mono border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-100 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text cursor-pointer"
                    >
                      {tabSize} spaces
                    </button>
                  </div>
                </div>

                {/* Right: Prettier Format Button & Status */}
                <div className="flex items-center space-x-3">
                  {formatNotice && (
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 animate-pulse">
                      {formatNotice}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={handleFormatCode}
                    className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-all hover:scale-105 cursor-pointer"
                    title="Automatically format code with Prettier"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Format with Prettier</span>
                  </button>
                </div>
              </div>

              {/* Editor Body */}
              {activeTab === 'edit' ? (
                <div className={`flex min-h-[460px] transition-colors ${autoEditorTheme}`}>
                  {/* Line Numbers */}
                  <div
                    className={`select-none py-4 px-3 text-right text-xs font-mono border-r ${
                      autoEditorTheme === 'prettier-light'
                        ? 'border-gray-200 bg-gray-100/70 text-gray-400'
                        : 'border-white/10 bg-black/20 text-gray-500'
                    }`}
                    style={{ minWidth: '3.5rem' }}
                  >
                    {lines.map((_, i) => (
                      <div key={i} className="leading-6">
                        {i + 1}
                      </div>
                    ))}
                  </div>

                  {/* Code Textarea */}
                  <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your code or documentation here..."
                    rows={Math.max(20, lines.length + 3)}
                    spellCheck={false}
                    className={`flex-1 p-4 font-mono text-xs leading-6 bg-transparent focus:outline-none resize-y ${
                      autoEditorTheme === 'prettier-light' ? 'text-gray-900' : 'text-gray-100'
                    }`}
                    style={{ tabSize }}
                  />
                </div>
              ) : (
                <div className="p-6 min-h-[460px]">
                  {isMarkdown ? (
                    <MarkdownViewer content={content || '*No content to preview*'} />
                  ) : (
                    <div className={`rounded-lg overflow-x-auto p-4 border border-gray-200 dark:border-white/10 ${autoEditorTheme}`}>
                      <div className="flex">
                        <div className="select-none pr-4 text-right text-xs font-mono text-gray-400/60 leading-6 border-r border-white/10 mr-4">
                          {lines.map((_, i) => (
                            <div key={i}>{i + 1}</div>
                          ))}
                        </div>
                        <pre className="text-xs font-mono leading-6 flex-1 overflow-x-auto">
                          <code
                            dangerouslySetInnerHTML={{
                              __html: highlightCode(content || '// Empty file', language),
                            }}
                          />
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Status Footer */}
              <div className="px-4 py-1.5 bg-gray-50 dark:bg-[#14161f] border-t border-gray-200 dark:border-dark-border flex items-center justify-between text-[11px] text-gray-500 dark:text-dark-muted font-mono">
                <div className="flex items-center space-x-3">
                  <span>{lines.length} lines</span>
                  <span>•</span>
                  <span>{content.length} characters</span>
                  <span>•</span>
                  <span className="capitalize">{language}</span>
                </div>
                <div className="flex items-center space-x-3">
                  <span>UTF-8</span>
                  <span>•</span>
                  <span>Spaces: {tabSize}</span>
                  <span>•</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    Auto {theme === 'dark' ? 'Dark' : 'Light'} Mode
                  </span>
                </div>
              </div>
            </div>

            {/* Commit Changes Box */}
            <form onSubmit={handleCommit} className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-xs p-6 space-y-4">
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
                  disabled={saving || !canWrite}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {saving ? 'Committing...' : currentMode === 'edit' ? 'Commit changes' : 'Commit new file'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
