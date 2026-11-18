import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Braces,
  Check,
  ChevronRight,
  Clock,
  Code2,
  Cpu,
  Database,
  Globe,
  Grid,
  Layers,
  Search,
  Server,
  Shield,
  Sparkles,
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
import { ThemedSelect } from './toolbox/components/ToolUI';

const CATEGORY_ICONS: Record<ToolboxCategoryId, React.ReactNode> = {
  security: <Shield className="w-4 h-4" />,
  formatters: <Braces className="w-4 h-4" />,
  database: <Database className="w-4 h-4" />,
  network: <Globe className="w-4 h-4" />,
  'cron-time': <Clock className="w-4 h-4" />,
  converters: <ArrowLeftRight className="w-4 h-4" />,
  'text-code': <Code2 className="w-4 h-4" />,
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

  // Cmd+K / Ctrl+K shortcut focuses toolbox search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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

  // Left Sidebar Navigation Menu Component
  const ToolboxMenuSidebar = (
    <div className="w-full lg:w-80 flex-shrink-0 space-y-4">
      <div className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-xs p-4 space-y-4">
        {/* Menu Header with Hub Link */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-dark-border">
          <a
            href="/toolbox"
            className="flex items-center space-x-2.5 group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-2xs group-hover:scale-105 transition-transform">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <span className="font-extrabold text-sm text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                Toolbox Menu
              </span>
              <p className="text-[11px] text-gray-400 dark:text-dark-muted leading-tight">
                {TOOLBOX_TOOLS.length} Developer Utilities
              </p>
            </div>
          </a>

          <a
            href="/toolbox"
            title="View All Tools Hub"
            className={`p-1.5 rounded-lg border text-xs font-semibold transition-colors ${
              !toolId
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                : 'border-gray-200 dark:border-dark-border text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-dark-hover'
            }`}
          >
            <Grid className="w-4 h-4" />
          </a>
        </div>

        {/* Quick Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search tools... (⌘K)"
            className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:bg-white dark:focus:bg-dark-surface focus:border-emerald-500 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Pills Filter */}
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
              selectedCategory === null
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-gray-100 dark:bg-dark-bg text-gray-600 dark:text-dark-muted hover:bg-gray-200 dark:hover:bg-dark-hover'
            }`}
          >
            All
          </button>
          {TOOLBOX_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(prev => (prev === cat.id ? null : cat.id))}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-gray-100 dark:bg-dark-bg text-gray-600 dark:text-dark-muted hover:bg-gray-200 dark:hover:bg-dark-hover'
              }`}
            >
              {cat.name.split(' ')[0]}
            </button>
          ))}
        </div>

        {/* Tool Navigation List */}
        <div className="space-y-1 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
          {filteredTools.length === 0 ? (
            <div className="py-6 text-center text-xs text-gray-400">
              No utilities match "{searchQuery}"
            </div>
          ) : (
            filteredTools.map(t => {
              const isActive = activeTool?.id === t.id;
              const isFav = favoriteIds.includes(t.id);
              return (
                <a
                  key={t.id}
                  href={`/toolbox/${t.id}`}
                  className={`group flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-all ${
                    isActive
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 font-bold border-l-4 border-emerald-500 shadow-2xs'
                      : 'text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <span className="text-gray-400 group-hover:text-emerald-500 transition-colors flex-shrink-0">
                      {CATEGORY_ICONS[t.category]}
                    </span>
                    <span className="truncate">{t.name}</span>
                  </div>

                  <div className="flex items-center space-x-1.5 flex-shrink-0 ml-2">
                    <button
                      type="button"
                      onClick={e => handleToggleFavorite(t.id, e)}
                      title={isFav ? 'Remove Favorite' : 'Add to Favorites'}
                      className="p-1 rounded text-gray-300 hover:text-amber-400"
                    >
                      <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                    </button>
                    <ChevronRight
                      className={`w-3.5 h-3.5 transition-transform ${
                        isActive ? 'text-emerald-600 dark:text-emerald-400 translate-x-0.5' : 'text-gray-300 opacity-0 group-hover:opacity-100'
                      }`}
                    />
                  </div>
                </a>
              );
            })
          )}
        </div>

        {/* Favorites Quick Strip */}
        {favoriteTools.length > 0 && (
          <div className="pt-3 border-t border-gray-100 dark:border-dark-border space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Favorites</span>
            <div className="flex flex-wrap gap-1.5">
              {favoriteTools.map(t => (
                <a
                  key={t.id}
                  href={`/toolbox/${t.id}`}
                  className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-[11px] font-medium border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 text-gray-700 dark:text-dark-text hover:border-amber-400 transition-colors"
                >
                  <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                  <span>{t.shortName}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Recently Used Strip */}
        {recentTools.length > 0 && (
          <div className="pt-2 border-t border-gray-100 dark:border-dark-border">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-1.5">
              Recently Used
            </span>
            <div className="flex flex-wrap gap-1.5">
              {recentTools.slice(0, 3).map(t => (
                <a
                  key={t.id}
                  href={`/toolbox/${t.id}`}
                  className="px-2 py-0.5 rounded text-[11px] border border-gray-200 dark:border-dark-border bg-gray-50/70 dark:bg-dark-bg text-gray-600 dark:text-dark-muted hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                >
                  {t.shortName}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Responsive Left-and-Right Menu Layout */}
      <div className="flex flex-col lg:flex-row items-start gap-6">
        {/* Left Side: Toolbox Navigation Menu */}
        {ToolboxMenuSidebar}

        {/* Right Side: Workspace Content Area */}
        <div className="flex-1 min-w-0 w-full space-y-5">
          {toolId ? (
            // Tool Workspace View
            activeTool && ActiveToolComponent ? (
              <div className="space-y-4">
                {/* Workspace Header Card */}
                <div className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-xs overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-200 dark:border-dark-border flex flex-wrap items-center justify-between gap-3 bg-gray-50/60 dark:bg-dark-bg/40">
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2 text-xs text-gray-400">
                        <a href="/toolbox" className="hover:text-emerald-600 font-semibold transition-colors">
                          Toolbox
                        </a>
                        <span>/</span>
                        <span>{getCategoryById(activeTool.category)?.name}</span>
                      </div>
                      <h1 className="text-lg font-extrabold text-gray-900 dark:text-white leading-tight">
                        {activeTool.name}
                      </h1>
                      <p className="text-xs text-gray-500 dark:text-dark-muted">{activeTool.description}</p>
                    </div>

                    <div className="flex items-center space-x-2.5">
                      {activeTool.execution === 'local' ? (
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 text-xs font-semibold">
                          <Cpu className="w-3.5 h-3.5" />
                          <span>Runs locally in browser</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/50 text-xs font-semibold">
                          <Server className="w-3.5 h-3.5" />
                          <span>Server-assisted</span>
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleToggleFavorite(activeTool.id)}
                        title={favoriteIds.includes(activeTool.id) ? 'Remove Favorite' : 'Save Favorite'}
                        className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                          favoriteIds.includes(activeTool.id)
                            ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                            : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-600 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${favoriteIds.includes(activeTool.id) ? 'fill-amber-400 text-amber-400' : ''}`} />
                        <span>{favoriteIds.includes(activeTool.id) ? 'Saved' : 'Favorite'}</span>
                      </button>
                    </div>
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
            ) : (
              <div className="p-12 text-center rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface space-y-4">
                <Wrench className="w-10 h-10 text-gray-400 mx-auto" />
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Tool Not Found</h2>
                <p className="text-xs text-gray-500">No utility matches <code>/toolbox/{toolId}</code>.</p>
                <a
                  href="/toolbox"
                  className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Return to Toolbox Hub</span>
                </a>
              </div>
            )
          ) : (
            // Hub Overview (When no specific tool is selected)
            <div className="space-y-6">
              {/* Hub Welcome Banner */}
              <div className="p-6 rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-xs space-y-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold text-gray-900 dark:text-white">
                      Developer Toolbox Dashboard
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-dark-muted">
                      Select any utility from the left menu or browse the categories below.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category Cards Overview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {TOOLBOX_CATEGORIES.map(cat => {
                  const isSelected = selectedCategory === cat.id;
                  const catCount = TOOLBOX_TOOLS.filter(t => t.category === cat.id).length;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(prev => (prev === cat.id ? null : cat.id))}
                      className={`flex items-start p-4 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 ring-1 ring-emerald-500/40'
                          : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-xs'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mr-3 ${cat.accentClass}`}>
                        {CATEGORY_ICONS[cat.id]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-gray-900 dark:text-white">{cat.name}</span>
                          <span className="text-[11px] font-mono text-gray-400">({catCount})</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-dark-muted line-clamp-1 mt-0.5">
                          {cat.subtitle}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Tools Grid for Selected Category or All */}
              <div className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-xs p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">
                    {selectedCategory
                      ? `${getCategoryById(selectedCategory)?.name} Utilities`
                      : searchQuery.trim()
                        ? `Search Results (${filteredTools.length})`
                        : 'All Utilities (1-Click Launch)'}
                  </h3>
                  {selectedCategory && (
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(null)}
                      className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      Show all
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredTools.map(tool => {
                    const isFav = favoriteIds.includes(tool.id);
                    const cat = getCategoryById(tool.category);
                    return (
                      <a
                        key={tool.id}
                        href={`/toolbox/${tool.id}`}
                        className="group p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50/50 dark:bg-dark-bg hover:bg-white dark:hover:bg-dark-hover hover:border-emerald-400/70 transition-all flex flex-col justify-between space-y-3 cursor-pointer"
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
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Toolbox;
