import React, { useState, useEffect, useRef } from 'react';
import { api, TreeEntry } from '../lib/api';
import { 
  Folder, 
  FolderOpen, 
  FileCode, 
  FileText, 
  File, 
  ChevronRight, 
  ChevronDown, 
  GitBranch, 
  Plus, 
  Search, 
  PanelLeftClose, 
  PanelLeft, 
  Check,
  Loader2 
} from 'lucide-react';

interface FileExplorerSidebarProps {
  owner: string;
  repo: string;
  branch: string;
  currentPath: string;
  branches?: string[];
  isOpen: boolean;
  onToggleOpen: () => void;
  onSelectFile: (filePath: string) => void;
  onBranchChange?: (branch: string) => void;
  onNewFile?: () => void;
}

interface TreeItemProps {
  entry: TreeEntry;
  depth: number;
  activePath: string;
  expandedFolders: Set<string>;
  folderChildren: Record<string, TreeEntry[]>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
}

const TreeItem: React.FC<TreeItemProps> = ({
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
        className={`w-full text-left py-1.5 px-2 flex items-center space-x-1.5 text-xs transition-colors rounded-md group cursor-pointer ${
          isActive
            ? 'border-l-[3px] border-blue-600 dark:border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold'
            : 'text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover/70'
        }`}
      >
        {isTree ? (
          <>
            <ChevronRight
              className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform duration-150 ${
                isExpanded ? 'rotate-90 text-gray-600 dark:text-gray-300' : ''
              }`}
            />
            {isExpanded ? (
              <FolderOpen className="w-4 h-4 text-sky-500 fill-sky-500/20 shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-sky-500 fill-sky-500/20 shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            {entry.name.endsWith('.md') ? (
              <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            ) : entry.name.endsWith('.json') || entry.name.endsWith('.js') || entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.go') || entry.name.endsWith('.py') ? (
              <FileCode className="w-4 h-4 text-gray-500 dark:text-dark-muted shrink-0" />
            ) : (
              <File className="w-4 h-4 text-gray-400 shrink-0" />
            )}
          </>
        )}
        <span className="truncate flex-1 font-mono text-[12px]">{entry.name}</span>
      </button>

      {isTree && isExpanded && (
        <div className="space-y-0.5">
          {children.length === 0 ? (
            <div
              style={{ paddingLeft: `${(depth + 1) * 14 + 18}px` }}
              className="py-1 text-[11px] text-gray-400 italic"
            >
              Empty directory
            </div>
          ) : (
            children.map((child) => (
              <TreeItem
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

export const FileExplorerSidebar: React.FC<FileExplorerSidebarProps> = ({
  owner,
  repo,
  branch,
  currentPath,
  branches = [],
  isOpen,
  onToggleOpen,
  onSelectFile,
  onBranchChange,
  onNewFile,
}) => {
  const [treeEntries, setTreeEntries] = useState<TreeEntry[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [folderChildren, setFolderChildren] = useState<Record<string, TreeEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [branchFilter, setBranchFilter] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const branchMenuRef = useRef<HTMLDivElement>(null);

  // Load root tree and auto-expand path
  useEffect(() => {
    let isMounted = true;
    async function loadTree() {
      try {
        setLoading(true);
        const res = await api.getTree(owner, repo, branch, '');
        if (!isMounted) return;
        setTreeEntries(res.entries || []);

        // Auto-expand folders along the active path
        if (currentPath && currentPath.includes('/')) {
          const parts = currentPath.split('/');
          parts.pop();
          const newExpanded = new Set<string>();
          let acc = '';
          for (const p of parts) {
            acc = acc ? `${acc}/${p}` : p;
            newExpanded.add(acc);
            try {
              const sub = await api.getTree(owner, repo, branch, acc);
              if (isMounted) {
                setFolderChildren((prev) => ({ ...prev, [acc]: sub.entries || [] }));
              }
            } catch {}
          }
          if (isMounted) {
            setExpandedFolders(newExpanded);
          }
        }
      } catch (err) {
        console.error('Failed to load tree:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadTree();
    return () => {
      isMounted = false;
    };
  }, [owner, repo, branch, currentPath]);

  // Global keydown: Press 't' to focus "Go to file"
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 't' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close branch menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (branchMenuRef.current && !branchMenuRef.current.contains(e.target as Node)) {
        setShowBranchMenu(false);
      }
    };
    if (showBranchMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showBranchMenu]);

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
        const res = await api.getTree(owner, repo, branch, folderPath);
        setFolderChildren((prev) => ({ ...prev, [folderPath]: res.entries || [] }));
      } catch (err) {
        console.error(`Failed to load directory ${folderPath}:`, err);
      }
    }
  };

  const filteredEntries = filter.trim()
    ? treeEntries.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase()))
    : treeEntries;

  const filteredBranches = branches.filter((b) =>
    b.toLowerCase().includes(branchFilter.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <aside className="w-full lg:w-72 xl:w-80 shrink-0 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-xs overflow-hidden flex flex-col select-none">
      {/* Top Header: Collapse icon + "Files" */}
      <div className="px-3 py-2.5 bg-gray-50 dark:bg-dark-hover/50 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={onToggleOpen}
            className="p-1 rounded text-gray-500 hover:text-gray-800 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-dark-hover transition-colors cursor-pointer"
            title="Collapse file tree"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
          <span className="font-bold text-sm text-gray-900 dark:text-white">Files</span>
        </div>

        <div className="flex items-center space-x-1">
          {onNewFile && (
            <button
              type="button"
              onClick={onNewFile}
              className="p-1 rounded text-gray-500 hover:text-emerald-600 hover:bg-gray-200 dark:hover:bg-dark-hover transition-colors cursor-pointer"
              title="Create new file"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => searchInputRef.current?.focus()}
            className="p-1 rounded text-gray-500 hover:text-gray-800 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-dark-hover transition-colors cursor-pointer"
            title="Find file (T)"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Row 2: Branch selector button */}
      <div className="p-2 border-b border-gray-100 dark:border-dark-border/50 relative" ref={branchMenuRef}>
        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={() => setShowBranchMenu(!showBranchMenu)}
            className="flex-1 flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-1.5 truncate">
              <GitBranch className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              <span className="truncate">{branch}</span>
            </div>
            <ChevronDown className="w-3 h-3 text-gray-400 shrink-0 ml-1" />
          </button>

          {onNewFile && (
            <button
              type="button"
              onClick={onNewFile}
              className="p-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-600 dark:text-dark-muted hover:text-emerald-600 hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors cursor-pointer"
              title="Create new file (+)"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Branch Dropdown Menu */}
        {showBranchMenu && (
          <div className="absolute left-2 right-2 top-11 z-50 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="p-2 border-b border-gray-100 dark:border-dark-border">
              <input
                type="text"
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                placeholder="Filter branches..."
                className="w-full px-2.5 py-1 text-xs rounded-md border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="max-h-48 overflow-y-auto p-1 space-y-0.5">
              {filteredBranches.length === 0 ? (
                <div className="py-2 text-center text-xs text-gray-400">No branches found</div>
              ) : (
                filteredBranches.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      setShowBranchMenu(false);
                      if (onBranchChange) onBranchChange(b);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 text-xs font-mono rounded flex items-center justify-between cursor-pointer ${
                      b === branch
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold'
                        : 'text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover'
                    }`}
                  >
                    <span className="truncate">{b}</span>
                    {b === branch && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-2" />}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Row 3: "Go to file" search input */}
      <div className="p-2 border-b border-gray-100 dark:border-dark-border/50">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Go to file"
            className="w-full pl-8 pr-7 py-1 text-xs rounded-md border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <span className="absolute right-2 px-1 py-0.2 text-[10px] font-mono text-gray-400 border border-gray-200 dark:border-dark-border rounded bg-white dark:bg-dark-surface shadow-2xs pointer-events-none">
            t
          </span>
        </div>
      </div>

      {/* Tree Content */}
      <div className="p-1.5 overflow-y-auto max-h-[calc(100vh-280px)] min-h-[320px] space-y-0.5">
        {loading && treeEntries.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-400 space-y-2">
            <Loader2 className="w-4 h-4 animate-spin mx-auto text-emerald-500" />
            <span>Loading file tree...</span>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="py-8 text-center text-xs text-gray-400">
            No matching files found
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <TreeItem
              key={entry.path}
              entry={entry}
              depth={0}
              activePath={currentPath}
              expandedFolders={expandedFolders}
              folderChildren={folderChildren}
              onToggleFolder={handleToggleFolder}
              onSelectFile={onSelectFile}
            />
          ))
        )}
      </div>
    </aside>
  );
};
