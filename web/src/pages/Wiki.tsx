import React, { useEffect, useState } from 'react';
import { api, Repository, WikiPage, WikiPageMeta, Commit } from '../lib/api';
import { RepoNav } from '../components/RepoNav';
import { MarkdownViewer } from '../components/MarkdownViewer';
import { showToast, showModalConfirm } from '../components/ModalDialog';
import { 
  BookOpen, 
  Plus, 
  Edit3, 
  Trash2, 
  History, 
  Copy, 
  Check, 
  Search, 
  FileText, 
  Clock, 
  User, 
  X,
  Eye,
  Code
} from 'lucide-react';

interface WikiProps {
  owner: string;
  repo: string;
  initialSlug?: string;
}

export const Wiki: React.FC<WikiProps> = ({ owner, repo: repoName, initialSlug = 'Home' }) => {
  const [repoData, setRepoData] = useState<Repository | null>(() => api.getCachedRepo(owner, repoName)?.repository || null);
  const [pages, setPages] = useState<WikiPageMeta[]>([]);
  const [currentPage, setCurrentPage] = useState<WikiPage | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string>(initialSlug);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [editorTab, setEditorTab] = useState<'write' | 'preview'>('write');
  const [saving, setSaving] = useState(false);

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [historyCommits, setHistoryCommits] = useState<Commit[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Clone URL copy
  const [copiedClone, setCopiedClone] = useState(false);

  const cloneURL = `${window.location.origin}/${owner}/${repoName}.wiki.git`;

  useEffect(() => {
    loadRepositoryAndPages();
  }, [owner, repoName]);

  useEffect(() => {
    if (selectedSlug) {
      loadPage(selectedSlug);
    }
  }, [selectedSlug]);

  const loadRepositoryAndPages = async () => {
    try {
      setLoading(true);
      const repoRes = await api.getRepo(owner, repoName);
      setRepoData(repoRes.repository);

      const pagesRes = await api.listWikiPages(owner, repoName);
      setPages(pagesRes);

      // If initial slug exists or default to first page or Home
      const targetSlug = initialSlug || (pagesRes.length > 0 ? pagesRes[0].slug : 'Home');
      setSelectedSlug(targetSlug);
    } catch (err) {
      console.error('Failed to load wiki:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPage = async (slug: string) => {
    try {
      setLoading(true);
      const page = await api.getWikiPage(owner, repoName, slug);
      setCurrentPage(page);
      setIsEditing(false);
      setIsCreating(false);
    } catch (err: any) {
      // If page not found, maybe show prompt to create
      setCurrentPage(null);
    } finally {
      setLoading(false);
    }
  };

  const handleStartCreate = () => {
    setIsCreating(true);
    setIsEditing(true);
    setEditTitle('');
    setEditSlug('');
    setEditContent('# New Page\n\nWrite your wiki content here...');
    setEditMessage('Create new wiki page');
    setEditorTab('write');
  };

  const handleStartEdit = () => {
    if (!currentPage) return;
    setIsCreating(false);
    setIsEditing(true);
    setEditTitle(currentPage.title);
    setEditSlug(currentPage.slug);
    setEditContent(currentPage.content);
    setEditMessage(`Update ${currentPage.title}`);
    setEditorTab('write');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim()) {
      showToast('Page title is required', 'error');
      return;
    }

    const slug = isCreating
      ? editSlug.trim() || editTitle.trim().replace(/\s+/g, '-')
      : currentPage?.slug || 'Home';

    try {
      setSaving(true);
      const saved = await api.saveWikiPage(owner, repoName, {
        slug,
        title: editTitle.trim(),
        content: editContent,
        message: editMessage.trim() || `Update ${slug}`,
      });

      setIsEditing(false);
      setIsCreating(false);
      setSelectedSlug(saved.slug);

      // Refresh pages list
      const pagesRes = await api.listWikiPages(owner, repoName);
      setPages(pagesRes);
      setCurrentPage(saved);
      showToast('Wiki page saved successfully', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save wiki page', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!currentPage) return;
    const confirmed = await showModalConfirm({
      title: 'Delete Wiki Page',
      message: `Are you sure you want to delete the wiki page "${currentPage.title}"? This cannot be undone.`,
      confirmText: 'Delete page',
      cancelText: 'Cancel',
      isDanger: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      await api.deleteWikiPage(owner, repoName, currentPage.slug);
      const pagesRes = await api.listWikiPages(owner, repoName);
      setPages(pagesRes);
      setSelectedSlug(pagesRes.length > 0 ? pagesRes[0].slug : 'Home');
      showToast(`Wiki page "${currentPage.title}" deleted`);
    } catch (err: any) {
      showToast(err.message || 'Failed to delete wiki page', 'error');
    }
  };

  const handleOpenHistory = async () => {
    if (!currentPage) return;
    setShowHistory(true);
    setLoadingHistory(true);
    try {
      const history = await api.getWikiPageHistory(owner, repoName, currentPage.slug);
      setHistoryCommits(history);
    } catch (err) {
      console.error('Failed to load wiki history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const copyCloneURL = () => {
    navigator.clipboard.writeText(cloneURL);
    setCopiedClone(true);
    setTimeout(() => setCopiedClone(false), 2000);
  };

  const filteredPages = pages.filter(
    (p) =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading && !repoData) {
    return (
      <div className="py-20 text-center text-sm text-gray-400">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        Loading Wiki...
      </div>
    );
  }

  if (!repoData) {
    return <div className="py-20 text-center text-sm">Repository not found</div>;
  }

  return (
    <div>
      <RepoNav repo={repoData} activeTab="wiki" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Content Area (3 cols) */}
          <div className="lg:col-span-3 space-y-6">
            {isEditing ? (
              /* Editor Form */
              <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
                  <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                    <Edit3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>{isCreating ? 'Create New Wiki Page' : `Edit: ${currentPage?.title}`}</span>
                  </h2>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setIsCreating(false);
                    }}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSave} className="p-6 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text uppercase mb-1">
                        Page Title
                      </label>
                      <input
                        type="text"
                        required
                        value={editTitle}
                        onChange={(e) => {
                          setEditTitle(e.target.value);
                          if (isCreating && !editSlug) {
                            setEditSlug(e.target.value.trim().replace(/\s+/g, '-'));
                          }
                        }}
                        placeholder="e.g. Getting Started"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text uppercase mb-1">
                        Slug / Filename
                      </label>
                      <input
                        type="text"
                        value={editSlug}
                        disabled={!isCreating}
                        onChange={(e) => setEditSlug(e.target.value)}
                        placeholder="e.g. Getting-Started"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg/60 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-70"
                      />
                    </div>
                  </div>

                  {/* Editor tabs */}
                  <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-dark-hover border-b border-gray-200 dark:border-dark-border text-xs font-semibold">
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={() => setEditorTab('write')}
                          className={`flex items-center space-x-1 px-3 py-1 rounded-md transition-colors ${
                            editorTab === 'write'
                              ? 'bg-white dark:bg-dark-surface shadow-sm text-emerald-600 dark:text-emerald-400 font-bold'
                              : 'text-gray-500 dark:text-dark-muted hover:text-gray-900'
                          }`}
                        >
                          <Code className="w-3.5 h-3.5" />
                          <span>Write</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditorTab('preview')}
                          className={`flex items-center space-x-1 px-3 py-1 rounded-md transition-colors ${
                            editorTab === 'preview'
                              ? 'bg-white dark:bg-dark-surface shadow-sm text-emerald-600 dark:text-emerald-400 font-bold'
                              : 'text-gray-500 dark:text-dark-muted hover:text-gray-900'
                          }`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Preview</span>
                        </button>
                      </div>
                      <span className="text-gray-400 text-xs hidden sm:inline">Markdown supported</span>
                    </div>

                    {editorTab === 'write' ? (
                      <textarea
                        rows={16}
                        required
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        placeholder="Write your markdown content here..."
                        className="w-full p-4 font-mono text-sm bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none resize-y"
                      />
                    ) : (
                      <div className="p-6 min-h-[360px] bg-white dark:bg-dark-surface">
                        <MarkdownViewer content={editContent || '*No content to preview*'} />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text uppercase mb-1">
                      Commit Message (Optional)
                    </label>
                    <input
                      type="text"
                      value={editMessage}
                      onChange={(e) => setEditMessage(e.target.value)}
                      placeholder="Reason for change..."
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                        setIsCreating(false);
                      }}
                      className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-dark-text bg-gray-100 dark:bg-dark-hover rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
                    >
                      {saving ? 'Saving...' : 'Save Wiki Page'}
                    </button>
                  </div>
                </form>
              </div>
            ) : currentPage ? (
              /* Page View */
              <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl shadow-sm overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/50 dark:bg-dark-hover/30">
                  <div>
                    <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">
                      {currentPage.title}
                    </h1>
                    <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500 dark:text-dark-muted">
                      <span className="flex items-center">
                        <User className="w-3.5 h-3.5 mr-1" />
                        {currentPage.author || 'Wiki'}
                      </span>
                      <span className="flex items-center">
                        <Clock className="w-3.5 h-3.5 mr-1" />
                        {currentPage.updated_at ? new Date(currentPage.updated_at).toLocaleDateString() : 'Recent'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleStartEdit}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-hover text-gray-700 dark:text-white shadow-sm transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={handleOpenHistory}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-hover text-gray-700 dark:text-white shadow-sm transition-colors"
                    >
                      <History className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                      <span>History</span>
                    </button>
                    {currentPage.slug !== 'Home' && (
                      <button
                        onClick={handleDelete}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 hover:bg-red-100 text-red-600 dark:text-red-400 shadow-sm transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Page Content */}
                <div className="p-8">
                  <MarkdownViewer content={currentPage.content} />
                </div>
              </div>
            ) : (
              /* Empty state / Page not found */
              <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl p-12 text-center shadow-sm space-y-4">
                <BookOpen className="w-12 h-12 text-emerald-500 mx-auto" />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Page Not Found
                </h2>
                <p className="text-sm text-gray-500 dark:text-dark-muted max-w-md mx-auto">
                  The wiki page <span className="font-semibold text-gray-800 dark:text-gray-200">"{selectedSlug}"</span> has not been created yet.
                </p>
                <button
                  onClick={handleStartCreate}
                  className="inline-flex items-center px-4 py-2 text-xs font-bold rounded-lg text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm transition-colors"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  <span>Create Page</span>
                </button>
              </div>
            )}
          </div>

          {/* Right Sidebar (1 col) */}
          <div className="space-y-6">
            {/* New Page Button */}
            <button
              onClick={handleStartCreate}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>New Wiki Page</span>
            </button>

            {/* Pages Navigation List */}
            <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl shadow-sm overflow-hidden">
              <div className="p-3 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-hover/40 flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-gray-700 dark:text-dark-text tracking-wider flex items-center">
                  <FileText className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                  Pages ({pages.length})
                </span>
              </div>

              {/* Search Filter */}
              <div className="p-2 border-b border-gray-200 dark:border-dark-border">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter pages..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-dark-border/40 max-h-80 overflow-y-auto">
                {filteredPages.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-400">No pages found</div>
                ) : (
                  filteredPages.map((p) => {
                    const isSelected = selectedSlug === p.slug;
                    return (
                      <button
                        key={p.slug}
                        onClick={() => setSelectedSlug(p.slug)}
                        className={`w-full text-left px-4 py-2.5 text-xs transition-colors flex items-center justify-between ${
                          isSelected
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-bold border-l-4 border-emerald-600'
                            : 'text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover'
                        }`}
                      >
                        <span className="truncate pr-2">{p.title}</span>
                        <span className="text-[10px] text-gray-400 font-normal">
                          {p.updated_at ? new Date(p.updated_at).toLocaleDateString() : ''}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Clone Wiki Git Repository */}
            <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl p-4 shadow-sm space-y-3">
              <h3 className="text-xs font-bold uppercase text-gray-700 dark:text-dark-text tracking-wider">
                Clone Wiki Repository
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-dark-muted">
                This wiki is backed by a Git repository. Clone locally to edit offline with your favorite markdown editor:
              </p>
              <div className="flex items-center space-x-1.5 bg-gray-50 dark:bg-dark-bg p-2 rounded-lg border border-gray-200 dark:border-dark-border">
                <input
                  type="text"
                  readOnly
                  value={cloneURL}
                  className="w-full bg-transparent text-[11px] font-mono text-gray-800 dark:text-gray-200 focus:outline-none select-all"
                />
                <button
                  onClick={copyCloneURL}
                  className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors"
                  title="Copy clone URL"
                >
                  {copiedClone ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between bg-gray-50/80 dark:bg-dark-hover/40">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                <History className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Wiki Revision History: {currentPage?.title}</span>
              </h3>
              <button
                onClick={() => setShowHistory(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto divide-y divide-gray-100 dark:divide-dark-border/40 flex-1">
              {loadingHistory ? (
                <div className="py-12 text-center text-xs text-gray-400">Loading commit history...</div>
              ) : historyCommits.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400">No revisions found</div>
              ) : (
                historyCommits.map((c) => (
                  <div key={c.sha} className="py-3 flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">
                        {c.message}
                      </p>
                      <div className="flex items-center space-x-3 mt-1 text-[11px] text-gray-500 dark:text-dark-muted">
                        <span>{c.author}</span>
                        <span>•</span>
                        <span>{new Date(c.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                    <code className="text-[11px] font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-dark-text">
                      {c.short_sha}
                    </code>
                  </div>
                ))
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-200 dark:border-dark-border bg-gray-50/80 dark:bg-dark-hover/40 flex justify-end">
              <button
                onClick={() => setShowHistory(false)}
                className="px-4 py-2 text-xs font-semibold border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-border/60 transition-colors rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

