import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Braces,
  ChevronRight,
  Clock,
  Code2,
  Cpu,
  Globe,
  Search,
  Server,
  Shield,
  Star,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import {
  FAVORITES_STORAGE_KEY,
  RECENT_STORAGE_KEY,
  TOOLBOX_CATEGORIES,
  TOOLBOX_TOOLS,
  ToolboxCategoryId,
  ToolboxToolMeta,
  getCategoryById,
  getLazyToolComponent,
  getToolById,
  readStoredIds,
  recordRecentToolId,
  toggleFavoriteToolId,
} from './toolbox/registry';

const CATEGORY_ICONS: Record<ToolboxCategoryId, React.ReactNode> = {
  security: <Shield className="w-5 h-5" />,
  formatters: <Braces className="w-5 h-5" />,
  network: <Globe className="w-5 h-5" />,
  'cron-time': <Clock className="w-5 h-5" />,
  converters: <ArrowLeftRight className="w-5 h-5" />,
  'text-code': <Code2 className="w-5 h-5" />,
};

interface ToolboxProps {
  toolId?: string;
}

export const Toolbox: React.FC<ToolboxProps> = ({ toolId }) => {
  const [toolboxEnabled, setToolboxEnabled] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ToolboxCategoryId | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readStoredIds(FAVORITES_STORAGE_KEY));
  const [recentIds, setRecentIds] = useState<string[]>(() => readStoredIds(RECENT_STORAGE_KEY));
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .getFeatures()
      .then(res => {
        if (res && res.toolbox_enabled !== undefined) {
          setToolboxEnabled(res.toolbox_enabled);
        }
      })
      .catch(() => {});
  }, []);

  // Record recently used tool when opening a tool workspace
  useEffect(() => {
    if (toolId && getToolById(toolId)) {
      setRecentIds(recordRecentToolId(toolId));
    }
  }, [toolId]);

  // Cmd+K / Ctrl+K shortcut focuses toolbox search on hub view
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (toolId) {
          navigate('/toolbox');
          setTimeout(() => searchInputRef.current?.focus(), 60);
        } else {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toolId]);

  const activeTool = useMemo(() => getToolById(toolId), [toolId]);
  const ActiveToolComponent = useMemo(
    () => (activeTool ? getLazyToolComponent(activeTool.id) : null),
    [activeTool]
  );

  const filteredTools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return TOOLBOX_TOOLS.filter(tool => {
      if (selectedCategory && tool.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        tool.name.toLowerCase().includes(q) ||
        tool.shortName.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        tool.keywords.some(k => k.includes(q))
      );
    });
  }, [searchQuery, selectedCategory]);

  const favoriteTools = useMemo(
    () => favoriteIds.map(id => getToolById(id)).filter((t): t is ToolboxToolMeta => !!t),
    [favoriteIds]
  );

  const recentTools = useMemo(
    () => recentIds.map(id => getToolById(id)).filter((t): t is ToolboxToolMeta => !!t),
    [recentIds]
  );

  const handleToggleFavorite = (id: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setFavoriteIds(toggleFavoriteToolId(id));
  };

  if (!toolboxEnabled) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="p-8 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-white dark:bg-dark-surface text-center space-y-3">
          <Wrench className="w-10 h-10 text-amber-500 mx-auto" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Developer Toolbox is Disabled</h1>
          <p className="text-sm text-gray-600 dark:text-dark-muted max-w-md mx-auto">
            Your administrator has disabled the Developer Toolbox via <code>[features] ENABLE_TOOLBOX = false</code>.
          </p>
        </div>
      </div>
    );
  }

  // Tool Workspace View (/toolbox/:toolId)
  if (toolId) {
    if (!activeTool || !ActiveToolComponent) {
      return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center space-y-3">
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Tool Not Found</h1>
          <p className="text-sm text-gray-500 dark:text-dark-muted">
            No utility matches <code>/toolbox/{toolId}</code>.
          </p>
          <a
            href="/toolbox"
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Toolbox Hub</span>
          </a>
        </div>
      );
    }

    const catMeta = getCategoryById(activeTool.category);
    const isFav = favoriteIds.includes(activeTool.id);

    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Top Breadcrumb & Quick Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-dark-muted">
            <a
              href="/toolbox"
              className="inline-flex items-center space-x-1 font-semibold text-gray-700 dark:text-dark-text hover:text-emerald-600 dark:hover:text-emerald-400"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Toolbox</span>
            </a>
            <span>/</span>
            <span>{catMeta?.name}</span>
            <span>/</span>
            <span className="font-bold text-gray-900 dark:text-white">{activeTool.shortName}</span>
          </div>

          <div className="flex items-center space-x-2">
            <select
              aria-label="Switch tool"
              value={activeTool.id}
              onChange={e => navigate(`/toolbox/${e.target.value}`)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-xs font-semibold text-gray-800 dark:text-white focus:outline-none focus:border-emerald-500"
            >
              {TOOLBOX_TOOLS.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => handleToggleFavorite(activeTool.id)}
              title={isFav ? 'Remove from Favorites' : 'Add to Favorites'}
              className={`inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                isFav
                  ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                  : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-600 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
              <span>{isFav ? 'Saved' : 'Favorite'}</span>
            </button>
          </div>
        </div>

        {/* Workspace Card */}
        <div className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-dark-border flex flex-wrap items-center justify-between gap-3 bg-gray-50/60 dark:bg-dark-bg/40">
            <div>
              <h1 className="text-lg font-extrabold text-gray-900 dark:text-white">{activeTool.name}</h1>
              <p className="text-xs text-gray-500 dark:text-dark-muted mt-0.5">{activeTool.description}</p>
            </div>
            {activeTool.execution === 'local' ? (
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 text-xs font-semibold">
                <Cpu className="w-3.5 h-3.5" />
                <span>Runs 100% locally in browser</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/50 text-xs font-semibold">
                <Server className="w-3.5 h-3.5" />
                <span>Server-assisted • Rate-limited</span>
              </span>
            )}
          </div>

          <div className="p-5">
            <Suspense
              fallback={
                <div className="py-12 flex items-center justify-center text-gray-400 space-x-2 text-xs font-semibold">
                  <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <span>Loading {activeTool.shortName}...</span>
                </div>
              }
            >
              <ActiveToolComponent />
            </Suspense>
          </div>
        </div>
      </div>
    );
  }

  // Hub Landing Page (/toolbox)
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
        {/* Top Header */}
        <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-dark-border space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-sm">
                <Terminal className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold text-gray-900 dark:text-white leading-tight">
                  ProGit Toolbox
                </h1>
                <p className="text-xs text-gray-500 dark:text-dark-muted">
                  Zero-overhead developer utilities — lazy-loaded &amp; browser-first
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-900/50">
              {TOOLBOX_TOOLS.length} Utilities Ready
            </span>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={`Search ${TOOLBOX_TOOLS.length} developer tools (JSON, JWT, Cron, DNS, Diff...)`}
              className="w-full pl-10 pr-16 py-2.5 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:bg-white dark:focus:bg-dark-bg focus:border-emerald-500 transition-colors"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-white cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-block absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs font-mono text-gray-400 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-md">
                ⌘K
              </kbd>
            )}
          </div>
        </div>

        {/* Categories Grid (Matching Concept Card Layout) */}
        <div className="p-5 sm:p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TOOLBOX_CATEGORIES.map(cat => {
              const isSelected = selectedCategory === cat.id;
              const catCount = TOOLBOX_TOOLS.filter(t => t.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(prev => (prev === cat.id ? null : cat.id))}
                  className={`flex items-center justify-between p-4 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 ring-1 ring-emerald-500/40'
                      : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center space-x-3.5 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cat.accentClass}`}>
                      {CATEGORY_ICONS[cat.id]}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-sm text-gray-900 dark:text-white">{cat.name}</span>
                        <span className="text-xs font-mono text-gray-400">({catCount})</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-dark-muted truncate mt-0.5">{cat.subtitle}</p>
                    </div>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 flex-shrink-0 transition-transform ${
                      isSelected ? 'text-emerald-500 rotate-90' : 'text-gray-400'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* Favorites Row */}
          {favoriteTools.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">
                Favorites
              </h2>
              <div className="flex flex-wrap gap-2">
                {favoriteTools.map(t => (
                  <a
                    key={t.id}
                    href={`/toolbox/${t.id}`}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 text-xs font-semibold text-gray-800 dark:text-white hover:border-amber-400 transition-colors"
                  >
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>{t.shortName}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Active Tools List (Filtered by search/category) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">
                {selectedCategory
                  ? `${getCategoryById(selectedCategory)?.name} Tools`
                  : searchQuery.trim()
                    ? `Matching Tools (${filteredTools.length})`
                    : 'All Phase-1 Tools'}
              </h2>
              {selectedCategory && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  Show all categories
                </button>
              )}
            </div>

            {filteredTools.length === 0 ? (
              <div className="p-8 text-center rounded-xl border border-dashed border-gray-200 dark:border-dark-border text-xs text-gray-500 dark:text-dark-muted">
                No tools matched "<strong>{searchQuery}</strong>". Try clearing the filter.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredTools.map(tool => {
                  const isFav = favoriteIds.includes(tool.id);
                  const cat = getCategoryById(tool.category);
                  return (
                    <a
                      key={tool.id}
                      href={`/toolbox/${tool.id}`}
                      className="group p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50/50 dark:bg-dark-bg hover:bg-white dark:hover:bg-dark-hover hover:border-emerald-400/70 transition-all flex flex-col justify-between space-y-3"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                            {tool.name}
                          </span>
                          <button
                            type="button"
                            onClick={e => handleToggleFavorite(tool.id, e)}
                            aria-label={isFav ? 'Remove favorite' : 'Favorite tool'}
                            className="p-1 rounded-md text-gray-400 hover:text-amber-400 cursor-pointer"
                          >
                            <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-dark-muted line-clamp-2">
                          {tool.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="text-gray-400 font-medium">{cat?.name}</span>
                        <span
                          className={`font-semibold ${
                            tool.execution === 'local'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-indigo-600 dark:text-indigo-400'
                          }`}
                        >
                          {tool.execution === 'local' ? 'Browser' : 'Server DNS'}
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Recently Used Footer (Matching Mockup) */}
        <div className="px-5 sm:px-6 py-4 border-t border-gray-100 dark:border-dark-border bg-gray-50/60 dark:bg-dark-bg/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-gray-700 dark:text-dark-text mr-1">Recently used</span>
            {(recentTools.length > 0 ? recentTools : TOOLBOX_TOOLS.slice(0, 3)).map(t => (
              <a
                key={t.id}
                href={`/toolbox/${t.id}`}
                className="px-2.5 py-1 rounded-md border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-xs font-medium text-gray-700 dark:text-dark-text hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              >
                {t.shortName}
              </a>
            ))}
          </div>
          {recentTools.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelectedCategory(null);
                setSearchQuery('');
              }}
              className="text-xs text-gray-500 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white font-medium cursor-pointer"
            >
              View all
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Toolbox;
