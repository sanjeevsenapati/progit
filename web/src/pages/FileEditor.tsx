import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api, Repository, Commit } from '../lib/api';
import { navigate } from '../lib/router';
import { useTheme } from '../lib/theme';
import { RepoNav } from '../components/RepoNav';
import { FileExplorerSidebar } from '../components/FileExplorerSidebar';
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
  Eye, 
  Code, 
  GitCommit, 
  GitBranch, 
  AlertCircle,
  ArrowLeft,
  Sparkles,
  PanelLeft,
  Copy,
  Check,
  History,
  Clock,
  Palette
} from 'lucide-react';

const SUPPORTED_LANGUAGES = [
  { id: 'auto', label: 'Auto Detect' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'tsx', label: 'React TSX' },
  { id: 'jsx', label: 'React JSX' },
  { id: 'go', label: 'Go' },
  { id: 'python', label: 'Python' },
  { id: 'rust', label: 'Rust' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'java', label: 'Java' },
  { id: 'bash', label: 'Shell / Bash' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
  { id: 'sql', label: 'SQL' },
  { id: 'markup', label: 'HTML / XML' },
  { id: 'css', label: 'CSS' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'docker', label: 'Dockerfile' },
  { id: 'ini', label: 'INI / Config' },
];

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
  const { theme } = useTheme();
  // Auto Theme: automatically adapts to global light or dark theme with zero user config
  const autoEditorTheme: PrettierTheme = theme === 'dark' ? 'prettier-dark' : 'prettier-light';

  const [repoData, setRepoData] = useState<Repository | null>(() => api.getCachedRepo(owner, repoName)?.repository || null);
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState(branch);
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
  const [copiedPath, setCopiedPath] = useState(false);
  const [latestCommit, setLatestCommit] = useState<Commit | null>(null);

  // Explorer Sidebar State (Default open, matching GitHub)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Editor Settings
  const [tabSize, setTabSize] = useState<number>(2);
  const [formatNotice, setFormatNotice] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('auto');
  const [syntaxHighlighting, setSyntaxHighlighting] = useState<boolean>(true);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const effectiveLanguage = selectedLanguage === 'auto' ? detectLanguage(pathInput) : selectedLanguage;

  const updateCursorPos = () => {
    if (!textareaRef.current) return;
    const selStart = textareaRef.current.selectionStart;
    const textBefore = content.substring(0, selStart);
    const linesBefore = textBefore.split('\n');
    const line = linesBefore.length;
    const col = linesBefore[linesBefore.length - 1].length + 1;
    setCursorPos({ line, col });
  };

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = scrollTop;
      highlightRef.current.scrollLeft = scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = scrollTop;
    }
  };

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const r = await api.getRepo(owner, repoName);
        setRepoData(r.repository);
        setBranches(r.branches || [currentBranch]);
        const hasAccess = Boolean(r.can_write || r.permissions?.write);
        setCanWrite(hasAccess);
        if (!hasAccess) {
          setError('You do not have write permissions to this repository. You must have edit access to commit changes.');
        }

        if (mode === 'edit' && filePath) {
          const b = await api.getBlob(owner, repoName, currentBranch, filePath);
          setContent(b.content);
          setCommitMessage(`Update ${filePath}`);

          try {
            const commits = await api.getCommits(owner, repoName, currentBranch);
            if (commits && commits.length > 0) {
              setLatestCommit(commits[0]);
            }
          } catch {}
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load file');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [owner, repoName, currentBranch, filePath, mode]);

  // Switch to another file from the explorer sidebar
  const handleSelectFileFromSidebar = async (selectedPath: string) => {
    if (selectedPath === pathInput && currentMode === 'edit') return;

    try {
      setLoading(true);
      setError('');
      const b = await api.getBlob(owner, repoName, currentBranch, selectedPath);
      setPathInput(selectedPath);
      setContent(b.content);
      setCurrentMode('edit');
      setCommitMessage(`Update ${selectedPath}`);
      window.history.pushState(null, '', `/${owner}/${repoName}/edit/${currentBranch}/${selectedPath}`);

      try {
        const commits = await api.getCommits(owner, repoName, currentBranch);
        if (commits && commits.length > 0) {
          setLatestCommit(commits[0]);
        }
      } catch {}
    } catch (err: any) {
      showToast(err.message || 'Failed to open file', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Branch switcher
  const handleBranchChange = (newBranch: string) => {
    setCurrentBranch(newBranch);
    if (filePath) {
      navigate(`/${owner}/${repoName}/edit/${newBranch}/${filePath}`);
    } else {
      navigate(`/${owner}/${repoName}/new/${newBranch}`);
    }
  };

  // Create new file from explorer sidebar
  const handleCreateNewFile = () => {
    setPathInput('');
    setContent('');
    setCurrentMode('new');
    setCommitMessage('Create new file');
    window.history.pushState(null, '', `/${owner}/${repoName}/new/${currentBranch}`);
  };

  // Copy current file path
  const handleCopyPath = () => {
    if (!pathInput) return;
    navigator.clipboard.writeText(pathInput);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  };

  // Prettier Formatting
  const handleFormatCode = () => {
    const lang = effectiveLanguage;
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
        updateCursorPos();
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
        branch: currentBranch,
        new_branch: newBranch,
        content,
        message: fullMessage || (currentMode === 'edit' ? `Update ${cleanPath}` : `Create ${cleanPath}`),
      });

      const targetBranch = res.branch || currentBranch;
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
  const approxSize = new Blob([content]).size;

  return (
    <div>
      <RepoNav repo={repoData} activeTab="code" />

      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 py-5">
        {/* Split Layout: GitHub Explorer Sidebar on Left + Editor on Right */}
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          {/* File Explorer Sidebar */}
          <FileExplorerSidebar
            owner={owner}
            repo={repoName}
            branch={currentBranch}
            currentPath={pathInput}
            branches={branches}
            isOpen={isSidebarOpen}
            onToggleOpen={() => setIsSidebarOpen(false)}
            onSelectFile={handleSelectFileFromSidebar}
            onBranchChange={handleBranchChange}
            onNewFile={handleCreateNewFile}
          />

          {/* Right: Code Editor & Commit Pane */}
          <div className="flex-1 min-w-0 space-y-4 w-full">
            {/* Top Breadcrumb & Edit/Preview Mode Bar (GitHub Style) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-dark-surface p-3.5 rounded-xl border border-gray-200 dark:border-dark-border shadow-xs">
              <div className="flex items-center space-x-2 text-sm font-semibold flex-wrap">
                {!isSidebarOpen && (
                  <button
                    type="button"
                    onClick={() => setIsSidebarOpen(true)}
                    className="p-1.5 mr-1 rounded-lg border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-100 transition-colors cursor-pointer flex items-center space-x-1"
                    title="Show file tree"
                  >
                    <PanelLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-bold">Files</span>
                  </button>
                )}

                <a
                  href={`/${owner}/${repoName}/tree/${currentBranch}`}
                  className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center"
                >
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                  <span>{repoName}</span>
                </a>
                <span className="text-gray-400">/</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-dark-text">
                  <GitBranch className="w-3 h-3 mr-1 text-emerald-600" />
                  {currentBranch}
                </span>
                <span className="text-gray-400">/</span>

                {/* Editable Path Input (GitHub Style) */}
                <div className="flex items-center space-x-1">
                  <input
                    type="text"
                    required
                    value={pathInput}
                    onChange={(e) => setPathInput(e.target.value)}
                    placeholder="filename or path (e.g. src/app.tsx)"
                    className="px-3 py-1 text-xs font-mono rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 min-w-[200px] sm:min-w-[320px]"
                  />
                  {pathInput && (
                    <button
                      type="button"
                      onClick={handleCopyPath}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-dark-text rounded hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors cursor-pointer"
                      title="Copy path"
                    >
                      {copiedPath ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Edit / Preview Tabs */}
              <div className="flex space-x-1 p-1 rounded-lg bg-gray-100 dark:bg-dark-hover border border-gray-200 dark:border-dark-border text-xs font-semibold self-start sm:self-auto">
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

            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-xs font-semibold text-red-700 dark:text-red-400 flex items-center">
                <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {/* Latest Commit Bar (if editing existing file) */}
            {latestCommit && currentMode === 'edit' && (
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
                  <a
                    href={`/${owner}/${repoName}/commits/${currentBranch}`}
                    className="inline-flex items-center space-x-1 hover:text-emerald-600 dark:hover:text-emerald-400 font-sans"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>History</span>
                  </a>
                </div>
              </div>
            )}

            {/* Editor Box */}
            <div className="rounded-xl border border-gray-200 dark:border-dark-border shadow-xs overflow-hidden bg-white dark:bg-dark-surface">
              {/* Editor Sub-toolbar */}
              <div className="px-4 py-2 bg-gray-50 dark:bg-[#14161f] border-b border-gray-200 dark:border-dark-border flex flex-wrap items-center justify-between gap-3 text-xs">
                {/* Left: File info, Indent Size, Language, and Syntax Toggle */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-gray-600 dark:text-dark-muted font-mono">
                  <span className="font-bold text-gray-900 dark:text-white">{pathInput.split('/').pop() || 'Untitled'}</span>
                  <span>•</span>
                  <span>{lines.length} lines</span>
                  <span>•</span>
                  <span>{(approxSize / 1024).toFixed(1)} KB</span>

                  {/* Indentation Selector */}
                  <div className="flex items-center space-x-1 pl-1 font-sans">
                    <span className="text-gray-500 dark:text-dark-muted font-medium">Indent:</span>
                    <button
                      type="button"
                      onClick={() => setTabSize(tabSize === 2 ? 4 : 2)}
                      className="px-2 py-0.5 rounded text-[11px] font-mono border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-100 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text cursor-pointer"
                    >
                      {tabSize} spaces
                    </button>
                  </div>

                  {/* Language Selector */}
                  <div className="flex items-center space-x-1 pl-1 font-sans">
                    <span className="text-gray-500 dark:text-dark-muted font-medium">Language:</span>
                    <select
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value)}
                      className="px-2 py-0.5 rounded text-[11px] font-sans border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-800 dark:text-dark-text cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {SUPPORTED_LANGUAGES.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Colorful Syntax Highlighting Toggle */}
                  <button
                    type="button"
                    onClick={() => setSyntaxHighlighting(!syntaxHighlighting)}
                    className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded text-[11px] font-sans font-semibold border transition-all cursor-pointer ${
                      syntaxHighlighting
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                        : 'bg-gray-100 dark:bg-dark-hover border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-muted'
                    }`}
                    title="Toggle live colorful syntax highlighting"
                  >
                    <Palette className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Syntax: {syntaxHighlighting ? 'Colorful' : 'Plain'}</span>
                  </button>
                </div>

                {/* Right: Prettier Format Button */}
                <div className="flex items-center space-x-3">
                  {formatNotice && (
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 animate-pulse">
                      {formatNotice}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={handleFormatCode}
                    className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs transition-all hover:scale-105 cursor-pointer"
                    title="Automatically format code with Prettier"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Format with Prettier</span>
                  </button>
                </div>
              </div>

              {/* Editor Body */}
              {activeTab === 'edit' ? (
                <div
                  className={`flex h-[560px] min-h-[460px] relative transition-colors ${
                    theme === 'dark' ? 'prettier-theme-dark prettier-dark' : 'prettier-theme-light prettier-light'
                  }`}
                >
                  {/* Line Numbers Gutter */}
                  <div
                    ref={gutterRef}
                    className={`select-none py-4 px-3 text-right text-xs font-mono border-r overflow-hidden shrink-0 ${
                      theme === 'dark'
                        ? 'border-white/10 bg-black/20 text-gray-500'
                        : 'border-gray-200 bg-gray-100/70 text-gray-400'
                    }`}
                    style={{ minWidth: '3.75rem' }}
                    aria-hidden="true"
                  >
                    {lines.map((_, i) => (
                      <div key={i} className="leading-6">
                        {i + 1}
                      </div>
                    ))}
                  </div>

                  {/* Synchronized Code Area: Pre Highlight Underlay + Textarea Overlay */}
                  <div className="relative flex-1 min-w-0 h-full overflow-hidden">
                    {/* Colorful Syntax Highlighting Layer */}
                    {syntaxHighlighting && (
                      <pre
                        ref={highlightRef}
                        aria-hidden="true"
                        className={`pointer-events-none absolute inset-0 m-0 p-4 font-mono text-xs leading-6 whitespace-pre overflow-hidden select-none ${
                          theme === 'dark' ? 'prettier-theme-dark prettier-dark' : 'prettier-theme-light prettier-light'
                        }`}
                        style={{
                          tabSize,
                          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
                        }}
                      >
                        <code
                          dangerouslySetInnerHTML={{
                            __html: highlightCode(content + (content.endsWith('\n') ? ' ' : ''), effectiveLanguage),
                          }}
                        />
                      </pre>
                    )}

                    {/* Interactive Textarea Layer */}
                    <textarea
                      ref={textareaRef}
                      value={content}
                      onChange={(e) => {
                        setContent(e.target.value);
                        updateCursorPos();
                      }}
                      onScroll={handleScroll}
                      onKeyDown={handleKeyDown}
                      onKeyUp={updateCursorPos}
                      onClick={updateCursorPos}
                      onSelect={updateCursorPos}
                      placeholder="Type your code or documentation here..."
                      spellCheck={false}
                      autoCapitalize="off"
                      autoComplete="off"
                      autoCorrect="off"
                      className={`code-editor-textarea absolute inset-0 w-full h-full m-0 p-4 font-mono text-xs leading-6 bg-transparent resize-none border-0 outline-none focus:ring-0 whitespace-pre overflow-auto ${
                        syntaxHighlighting
                          ? 'syntax-highlight-active'
                          : theme === 'dark'
                          ? 'text-gray-100'
                          : 'text-gray-900'
                      }`}
                      style={{
                        tabSize,
                        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="p-6 min-h-[460px] overflow-auto">
                  {isMarkdown ? (
                    <MarkdownViewer content={content || '*No content to preview*'} />
                  ) : (
                    <div
                      className={`rounded-lg overflow-x-auto p-4 border border-gray-200 dark:border-white/10 ${
                        theme === 'dark' ? 'prettier-theme-dark prettier-dark' : 'prettier-theme-light prettier-light'
                      }`}
                    >
                      <div className="flex">
                        <div className="select-none pr-4 text-right text-xs font-mono text-gray-400/60 leading-6 border-r border-white/10 mr-4">
                          {lines.map((_, i) => (
                            <div key={i}>{i + 1}</div>
                          ))}
                        </div>
                        <pre className="text-xs font-mono leading-6 flex-1 overflow-x-auto">
                          <code
                            dangerouslySetInnerHTML={{
                              __html: highlightCode(content || '// Empty file', effectiveLanguage),
                            }}
                          />
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Status Footer */}
              <div className="px-4 py-1.5 bg-gray-50 dark:bg-[#14161f] border-t border-gray-200 dark:border-dark-border flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-dark-muted font-mono">
                <div className="flex items-center space-x-3">
                  <span className="font-semibold text-gray-700 dark:text-dark-text">
                    Ln {cursorPos.line}, Col {cursorPos.col}
                  </span>
                  <span>•</span>
                  <span>{lines.length} lines</span>
                  <span>•</span>
                  <span>{content.length} characters</span>
                  <span>•</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                    {effectiveLanguage}
                  </span>
                  {syntaxHighlighting && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans font-semibold">
                      (Live Syntax Active)
                    </span>
                  )}
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

            {/* Commit Changes Box (GitHub Style) */}
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
                      Commit directly to the <span className="font-mono font-bold text-emerald-600">{currentBranch}</span> branch
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
                  href={`/${owner}/${repoName}/tree/${currentBranch}`}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-dark-text bg-gray-100 dark:bg-dark-hover rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
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
