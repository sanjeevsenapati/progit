import React, { useEffect, useState } from 'react';
import { api, Repository, BranchDetail } from '../lib/api';
import { RepoNav } from '../components/RepoNav';
import { 
  GitBranch, 
  Plus, 
  Check, 
  Search, 
  Trash2, 
  GitPullRequest, 
  Clock, 
  User, 
  AlertCircle, 
  X, 
  AlertTriangle,
  GitFork,
  ExternalLink
} from 'lucide-react';

interface BranchesProps {
  owner: string;
  repo: string;
}

export const Branches: React.FC<BranchesProps> = ({ owner, repo: repoName }) => {
  const cachedRepo = api.getCachedRepo(owner, repoName);
  const [repoData, setRepoData] = useState<Repository | null>(() => cachedRepo?.repository || null);
  const [branchDetails, setBranchDetails] = useState<BranchDetail[]>([]);
  const [filterQuery, setFilterQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'all'>('overview');
  const [loading, setLoading] = useState(true);
  const [canWrite, setCanWrite] = useState(() => Boolean(cachedRepo?.can_write || cachedRepo?.permissions?.write));

  // Create branch modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [baseBranch, setBaseBranch] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Delete branch modal
  const [branchToDelete, setBranchToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const loadBranches = async () => {
    try {
      setLoading(true);
      const r = await api.getRepo(owner, repoName);
      setRepoData(r.repository);
      setCanWrite(Boolean(r.can_write || r.permissions?.write));
      setBaseBranch(r.repository.default_branch || 'main');

      try {
        const details = await api.getBranchDetails(owner, repoName);
        if (Array.isArray(details) && details.length > 0) {
          setBranchDetails(details);
        } else {
          // Fallback to simple string array
          const simple = await api.getBranches(owner, repoName);
          const mapped: BranchDetail[] = (simple || []).map(b => ({
            name: b,
            is_default: b === r.repository.default_branch,
            commit_sha: '',
            commit_message: '',
            author_name: '',
            commit_time: 0,
          }));
          setBranchDetails(mapped);
        }
      } catch {
        const simple = await api.getBranches(owner, repoName);
        const mapped: BranchDetail[] = (simple || []).map(b => ({
          name: b,
          is_default: b === r.repository.default_branch,
          commit_sha: '',
          commit_message: '',
          author_name: '',
          commit_time: 0,
        }));
        setBranchDetails(mapped);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, [owner, repoName]);

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newBranchName.trim();
    if (!cleanName) {
      setCreateError('Branch name is required');
      return;
    }

    try {
      setCreating(true);
      setCreateError('');
      await api.createBranch(owner, repoName, cleanName, baseBranch || repoData?.default_branch || 'main');
      setNewBranchName('');
      setShowCreateModal(false);
      await loadBranches();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create branch');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteBranch = async () => {
    if (!branchToDelete) return;
    try {
      setDeleting(true);
      setDeleteError('');
      await api.deleteBranch(owner, repoName, branchToDelete);
      setBranchToDelete(null);
      await loadBranches();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete branch');
    } finally {
      setDeleting(false);
    }
  };

  const formatTimestamp = (ts: number) => {
    if (!ts) return '';
    const date = new Date(ts * 1000);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} minutes ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`;
    return `${Math.floor(diffSec / 86400)} days ago`;
  };

  if (loading && !repoData) {
    return (
      <div className="py-20 text-center text-sm text-gray-400">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        Loading branches...
      </div>
    );
  }

  if (!repoData) {
    return <div className="py-20 text-center text-sm">Repository not found</div>;
  }

  const defaultBranchName = repoData.default_branch || 'main';
  const defaultBranchObj = branchDetails.find(b => b.is_default || b.name === defaultBranchName);
  const otherBranches = branchDetails.filter(b => !(b.is_default || b.name === defaultBranchName));

  const filteredBranches = branchDetails.filter(b => 
    b.name.toLowerCase().includes(filterQuery.toLowerCase())
  );
  const filteredOther = otherBranches.filter(b => 
    b.name.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div>
      <RepoNav repo={repoData} activeTab="branches" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
              <GitBranch className="w-5 h-5 mr-2 text-emerald-600 dark:text-emerald-400" />
              <span>Branches</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-dark-text border border-gray-200 dark:border-dark-border">
              {branchDetails.length}
            </span>
          </div>

          <div className="flex items-center space-x-3">
            {/* Search filter */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Filter branches..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-48 sm:w-64"
              />
            </div>

            {/* New Branch Button */}
            {canWrite && (
              <button
                type="button"
                onClick={() => {
                  setNewBranchName('');
                  setCreateError('');
                  setShowCreateModal(true);
                }}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New branch</span>
              </button>
            )}
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex space-x-2 border-b border-gray-200 dark:border-dark-border pb-1">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 ${
              activeTab === 'overview'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 font-bold'
                : 'border-transparent text-gray-500 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 ${
              activeTab === 'all'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 font-bold'
                : 'border-transparent text-gray-500 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            All branches ({branchDetails.length})
          </button>
        </div>

        {/* Tab 1: Overview (Default branch + Active branches) */}
        {activeTab === 'overview' ? (
          <div className="space-y-6">
            {/* Default Branch Section */}
            {defaultBranchObj && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">
                  Default branch
                </h3>
                <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm p-4 hover:border-emerald-500/50 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <a
                          href={`/${owner}/${repoName}/tree/${defaultBranchObj.name}`}
                          className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center"
                        >
                          <GitBranch className="w-4 h-4 mr-1 text-emerald-500" />
                          <span>{defaultBranchObj.name}</span>
                        </a>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                          default
                        </span>
                      </div>

                      {defaultBranchObj.commit_message ? (
                        <p className="text-xs text-gray-600 dark:text-dark-muted line-clamp-1">
                          {defaultBranchObj.commit_message}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400 italic">Latest repository commit</p>
                      )}

                      <div className="flex items-center space-x-3 text-[11px] text-gray-500 dark:text-dark-muted font-mono">
                        {defaultBranchObj.commit_sha && (
                          <a
                            href={`/${owner}/${repoName}/commit/${defaultBranchObj.commit_sha}`}
                            className="text-emerald-600 dark:text-emerald-400 hover:underline"
                          >
                            {defaultBranchObj.commit_sha.substring(0, 7)}
                          </a>
                        )}
                        {defaultBranchObj.author_name && (
                          <span>by {defaultBranchObj.author_name}</span>
                        )}
                        {defaultBranchObj.commit_time > 0 && (
                          <span>• {formatTimestamp(defaultBranchObj.commit_time)}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <a
                        href={`/${owner}/${repoName}/tree/${defaultBranchObj.name}`}
                        className="px-3 py-1 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover hover:bg-gray-50 text-gray-700 dark:text-dark-text shadow-sm"
                      >
                        Browse files
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Other Branches Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">
                  Active branches ({filteredOther.length})
                </h3>
              </div>

              {filteredOther.length === 0 ? (
                <div className="p-8 text-center bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border text-xs text-gray-500 dark:text-dark-muted">
                  {filterQuery ? `No branches match "${filterQuery}"` : 'No other branches in this repository.'}
                </div>
              ) : (
                <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm divide-y divide-gray-100 dark:divide-dark-border overflow-hidden">
                  {filteredOther.map((b) => (
                    <div
                      key={b.name}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/50 dark:hover:bg-dark-hover/30 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <a
                            href={`/${owner}/${repoName}/tree/${b.name}`}
                            className="font-mono text-sm font-bold text-gray-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline flex items-center"
                          >
                            <GitBranch className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                            <span>{b.name}</span>
                          </a>
                        </div>

                        {b.commit_message && (
                          <p className="text-xs text-gray-600 dark:text-dark-muted line-clamp-1">
                            {b.commit_message}
                          </p>
                        )}

                        <div className="flex items-center space-x-3 text-[11px] text-gray-500 dark:text-dark-muted font-mono">
                          {b.commit_sha && (
                            <a
                              href={`/${owner}/${repoName}/commit/${b.commit_sha}`}
                              className="text-emerald-600 dark:text-emerald-400 hover:underline"
                            >
                              {b.commit_sha.substring(0, 7)}
                            </a>
                          )}
                          {b.author_name && <span>by {b.author_name}</span>}
                          {b.commit_time > 0 && <span>• {formatTimestamp(b.commit_time)}</span>}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        {/* Compare / New Pull Request */}
                        <a
                          href={`/${owner}/${repoName}/compare?base=${defaultBranchName}&head=${b.name}`}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover hover:bg-gray-50 text-gray-700 dark:text-dark-text shadow-sm"
                          title="Compare and create a pull request"
                        >
                          <GitPullRequest className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>New pull request</span>
                        </a>

                        {/* Delete branch */}
                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => {
                              setBranchToDelete(b.name);
                              setDeleteError('');
                            }}
                            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            title={`Delete branch ${b.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Tab 2: All Branches */
          <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm divide-y divide-gray-100 dark:divide-dark-border overflow-hidden">
            {filteredBranches.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500 dark:text-dark-muted">
                No branches found.
              </div>
            ) : (
              filteredBranches.map((b) => (
                <div
                  key={b.name}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/50 dark:hover:bg-dark-hover/30 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <a
                        href={`/${owner}/${repoName}/tree/${b.name}`}
                        className="font-mono text-sm font-bold text-gray-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline flex items-center"
                      >
                        <GitBranch className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                        <span>{b.name}</span>
                      </a>
                      {(b.is_default || b.name === defaultBranchName) && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                          default
                        </span>
                      )}
                    </div>

                    {b.commit_message && (
                      <p className="text-xs text-gray-600 dark:text-dark-muted line-clamp-1">
                        {b.commit_message}
                      </p>
                    )}

                    <div className="flex items-center space-x-3 text-[11px] text-gray-500 dark:text-dark-muted font-mono">
                      {b.commit_sha && (
                        <a
                          href={`/${owner}/${repoName}/commit/${b.commit_sha}`}
                          className="text-emerald-600 dark:text-emerald-400 hover:underline"
                        >
                          {b.commit_sha.substring(0, 7)}
                        </a>
                      )}
                      {b.author_name && <span>by {b.author_name}</span>}
                      {b.commit_time > 0 && <span>• {formatTimestamp(b.commit_time)}</span>}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    {!(b.is_default || b.name === defaultBranchName) && (
                      <>
                        <a
                          href={`/${owner}/${repoName}/compare?base=${defaultBranchName}&head=${b.name}`}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover hover:bg-gray-50 text-gray-700 dark:text-dark-text shadow-sm"
                        >
                          <GitPullRequest className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Compare</span>
                        </a>

                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => {
                              setBranchToDelete(b.name);
                              setDeleteError('');
                            }}
                            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Create Branch Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl max-w-md w-full shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-dark-border pb-3">
              <div className="flex items-center space-x-2 text-sm font-bold text-gray-900 dark:text-white">
                <GitBranch className="w-4 h-4 text-emerald-600" />
                <span>Create a branch</span>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-xs font-semibold text-red-700 dark:text-red-400 flex items-center">
                <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateBranch} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                  Branch name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. feature-payment-gateway"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                  Branch source (base)
                </label>
                <select
                  value={baseBranch}
                  onChange={(e) => setBaseBranch(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {branchDetails.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name} {b.is_default ? '(default)' : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-dark-muted">
                  New branch will be branched from <strong className="font-mono text-gray-700 dark:text-white">{baseBranch || defaultBranchName}</strong>.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-gray-200 dark:border-dark-border">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-border/60 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newBranchName.trim()}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {creating ? 'Creating...' : 'Create branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Branch Modal */}
      {branchToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl max-w-md w-full shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-dark-border pb-3">
              <div className="flex items-center space-x-2 text-sm font-bold text-red-600 dark:text-red-400">
                <AlertTriangle className="w-5 h-5" />
                <span>Delete branch</span>
              </div>
              <button
                type="button"
                onClick={() => setBranchToDelete(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {deleteError && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-xs font-semibold text-red-700 dark:text-red-400 flex items-center">
                <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <p className="text-xs text-gray-600 dark:text-dark-muted">
              Are you sure you want to permanently delete the branch{' '}
              <strong className="font-mono text-gray-900 dark:text-white">{branchToDelete}</strong>? This action cannot be undone.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-gray-200 dark:border-dark-border">
              <button
                type="button"
                onClick={() => setBranchToDelete(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-border/60 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteBranch}
                disabled={deleting}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
              >
                {deleting ? 'Deleting...' : 'Delete branch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
