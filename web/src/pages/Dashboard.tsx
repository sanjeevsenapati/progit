import React, { useEffect, useState } from 'react';
import { api, Repository, Activity, Organization } from '../lib/api';
import { useAuth } from '../lib/theme';
import { 
  GitBranch, 
  Plus, 
  Lock, 
  Star, 
  History, 
  Search, 
  BookOpen, 
  CircleDot, 
  GitPullRequest, 
  Building2,
  GitCommit,
  User as UserIcon,
  Settings,
  ExternalLink,
  Flame,
  Terminal,
  FileCode,
  Globe,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [starred, setStarred] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [feedFilter, setFeedFilter] = useState<'all' | 'commits' | 'issues'>('all');

  // Pagination states
  const [activityPage, setActivityPage] = useState(1);
  const activityPageSize = 8;

  const [repoPage, setRepoPage] = useState(1);
  const repoPageSize = 6;

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getDashboard();
        setRepos(data.repositories || []);
        setActivities(data.activities || []);
        setOrganizations(data.organizations || []);
        setStarred(data.starred || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleRepoFilterChange = (val: string) => {
    setFilter(val);
    setRepoPage(1);
  };

  const handleFeedFilterChange = (f: 'all' | 'commits' | 'issues') => {
    setFeedFilter(f);
    setActivityPage(1);
  };

  const filteredRepos = repos.filter(r => 
    r.name.toLowerCase().includes(filter.toLowerCase()) || 
    r.owner_name.toLowerCase().includes(filter.toLowerCase())
  );

  const totalRepoPages = Math.max(1, Math.ceil(filteredRepos.length / repoPageSize));
  const paginatedRepos = filteredRepos.slice(
    (repoPage - 1) * repoPageSize,
    repoPage * repoPageSize
  );

  const filteredActivities = activities.filter(act => {
    if (feedFilter === 'commits') return act.op_type === 'push' || act.op_type === 'commit' || act.content.includes('commit');
    if (feedFilter === 'issues') return act.op_type === 'issue' || act.op_type === 'pull' || act.content.includes('issue') || act.content.includes('pull');
    return true;
  });

  const totalActivityPages = Math.max(1, Math.ceil(filteredActivities.length / activityPageSize));
  const paginatedActivities = filteredActivities.slice(
    (activityPage - 1) * activityPageSize,
    activityPage * activityPageSize
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Top Repositories & Organizations */}
        <div className="lg:col-span-3 space-y-6">
          {/* Top Repositories Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 dark:text-white text-base">Top Repositories</h2>
              <a
                href="/new"
                className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New</span>
              </a>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Find a repository (Enter to search all)..."
                value={filter}
                onChange={e => handleRepoFilterChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && filter.trim()) {
                    window.location.href = `/explore?q=${encodeURIComponent(filter.trim())}`;
                  }
                }}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
              />
            </div>

            <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border shadow-xs overflow-hidden">
              {loading ? (
                <div className="p-4 text-center text-sm text-gray-400">Loading repositories...</div>
              ) : filteredRepos.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500 dark:text-dark-muted space-y-2">
                  <BookOpen className="w-6 h-6 mx-auto text-gray-400" />
                  <p>{filter.trim() ? `No local repositories matching "${filter}"` : 'No repositories found'}</p>
                  {filter.trim() ? (
                    <a
                      href={`/explore?q=${encodeURIComponent(filter.trim())}`}
                      className="inline-block text-emerald-600 dark:text-emerald-400 font-semibold hover:underline text-sm"
                    >
                      Search across all repositories &rarr;
                    </a>
                  ) : (
                    <a href="/new" className="inline-block text-emerald-600 dark:text-emerald-400 font-semibold hover:underline text-sm">
                      Create your first repository
                    </a>
                  )}
                </div>
              ) : (
                <>
                  {paginatedRepos.map(repo => (
                    <a
                      key={repo.id}
                      href={`/${repo.owner_name}/${repo.name}`}
                      className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors group"
                    >
                      <div className="flex items-center space-x-2.5 truncate">
                        <div className="w-6 h-6 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                          <GitBranch className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-sm font-semibold text-gray-800 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 truncate">
                          {repo.owner_name}/{repo.name}
                        </span>
                        {repo.is_private && <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                      </div>
                      {repo.num_stars > 0 && (
                        <span className="flex items-center text-xs text-gray-400 font-medium">
                          <Star className="w-3.5 h-3.5 mr-0.5 fill-amber-400 text-amber-400" />
                          {repo.num_stars}
                        </span>
                      )}
                    </a>
                  ))}

                  {/* Repositories Mini Pagination */}
                  {totalRepoPages > 1 && (
                    <div className="p-2.5 bg-gray-50/70 dark:bg-dark-hover/30 flex items-center justify-between text-xs text-gray-500 dark:text-dark-muted border-t border-gray-100 dark:border-dark-border">
                      <span>
                        Page {repoPage} of {totalRepoPages}
                      </span>
                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          disabled={repoPage <= 1}
                          onClick={() => setRepoPage(prev => Math.max(1, prev - 1))}
                          className="px-2 py-1 rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                        >
                          &larr; Prev
                        </button>
                        <button
                          type="button"
                          disabled={repoPage >= totalRepoPages}
                          onClick={() => setRepoPage(prev => Math.min(totalRepoPages, prev + 1))}
                          className="px-2 py-1 rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                        >
                          Next &rarr;
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Organizations Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 dark:text-white text-base">Your Organizations</h2>
              <a
                href="/org/new"
                className="text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
              >
                + New
              </a>
            </div>

            <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border shadow-xs overflow-hidden">
              {organizations.length === 0 ? (
                <div className="p-5 text-center text-sm text-gray-400 space-y-2">
                  <p>You aren't a member of any organizations yet.</p>
                  <a href="/org/new" className="inline-block text-emerald-600 hover:underline font-semibold text-xs sm:text-sm">
                    Create an organization
                  </a>
                </div>
              ) : (
                organizations.map(org => (
                  <a
                    key={org.id}
                    href={`/org/${org.name}`}
                    className="flex items-center space-x-3 p-3 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors group"
                  >
                    <div className="w-7 h-7 rounded-md bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold text-xs shrink-0">
                      {org.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-semibold text-gray-800 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 truncate">
                        {org.full_name || org.name}
                      </p>
                      <p className="text-xs text-gray-400 font-mono">@{org.name}</p>
                    </div>
                  </a>
                ))
              )}
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: Overview & Activity Feed */}
        <div className="lg:col-span-6 space-y-6">
          {/* Welcome & Overview Header */}
          <div className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent dark:from-emerald-950/30 dark:via-dark-surface bg-white dark:bg-dark-surface shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  Welcome, {user?.full_name || user?.username}!
                </h1>
                <p className="text-sm text-gray-500 dark:text-dark-muted mt-1">
                  Here's an overview of your projects, Git repositories, and team activities.
                </p>
              </div>
              <a
                href={`/user/${user?.username}`}
                className="hidden sm:inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text hover:bg-white dark:hover:bg-dark-surface shadow-xs transition-colors"
              >
                <span>Profile Overview</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Metric Badges */}
            <div className="grid grid-cols-3 gap-3.5 pt-1">
              <div className="p-3.5 rounded-lg bg-white dark:bg-dark-bg/60 border border-gray-100 dark:border-dark-border text-center shadow-xs">
                <span className="block text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {repos.length}
                </span>
                <span className="text-xs text-gray-500 dark:text-dark-muted uppercase tracking-wider font-semibold">Repositories</span>
              </div>
              <div className="p-3.5 rounded-lg bg-white dark:bg-dark-bg/60 border border-gray-100 dark:border-dark-border text-center shadow-xs">
                <span className="block text-2xl font-bold text-amber-500 font-mono">
                  {starred.length}
                </span>
                <span className="text-xs text-gray-500 dark:text-dark-muted uppercase tracking-wider font-semibold">Stars</span>
              </div>
              <div className="p-3.5 rounded-lg bg-white dark:bg-dark-bg/60 border border-gray-100 dark:border-dark-border text-center shadow-xs">
                <span className="block text-2xl font-bold text-blue-500 font-mono">
                  {organizations.length}
                </span>
                <span className="text-xs text-gray-500 dark:text-dark-muted uppercase tracking-wider font-semibold">Organizations</span>
              </div>
            </div>
          </div>

          {/* Activity Feed with Pagination */}
          <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-xs overflow-hidden">
            {/* Feed Filter Header */}
            <div className="p-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-emerald-600" />
                <h2 className="font-bold text-base sm:text-lg text-gray-900 dark:text-white">Recent Activity</h2>
              </div>
              <div className="flex space-x-1.5 text-xs sm:text-sm">
                <button
                  onClick={() => handleFeedFilterChange('all')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                    feedFilter === 'all'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => handleFeedFilterChange('commits')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                    feedFilter === 'commits'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Commits
                </button>
                <button
                  onClick={() => handleFeedFilterChange('issues')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                    feedFilter === 'issues'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Issues &amp; PRs
                </button>
              </div>
            </div>

            {/* Activity Stream Items */}
            {loading ? (
              <div className="p-8 text-center text-sm text-gray-400">Loading activity feed...</div>
            ) : filteredActivities.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-400 space-y-2">
                <History className="w-8 h-8 mx-auto text-gray-300 dark:text-dark-muted" />
                <p>No recent activity found. Push code or open pull requests to see updates here.</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-gray-100 dark:divide-dark-border">
                  {paginatedActivities.map(act => {
                    let icon = <GitCommit className="w-4 h-4 text-emerald-600" />;
                    if (act.op_type === 'create_repo' || act.op_type === 'repo') {
                      icon = <GitBranch className="w-4 h-4 text-blue-600" />;
                    } else if (act.op_type === 'pull') {
                      icon = <GitPullRequest className="w-4 h-4 text-purple-600" />;
                    } else if (act.op_type === 'issue') {
                      icon = <CircleDot className="w-4 h-4 text-emerald-600" />;
                    } else if (act.op_type === 'star') {
                      icon = <Star className="w-4 h-4 text-amber-500 fill-amber-500" />;
                    }

                    return (
                      <div key={act.id} className="p-4 flex items-start space-x-3.5 hover:bg-gray-50/50 dark:hover:bg-dark-hover/30 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-dark-bg border border-gray-200 dark:border-dark-border flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                          {icon}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="text-sm text-gray-800 dark:text-dark-text leading-snug">
                            <a href={`/user/${act.username}`} className="font-bold text-gray-900 dark:text-white hover:underline">
                              @{act.username}
                            </a>{' '}
                            {act.content}
                          </div>
                          <p className="text-xs text-gray-400 dark:text-dark-muted">
                            {new Date(act.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Recent Activity Pagination Controls */}
                {filteredActivities.length > 0 && (
                  <div className="p-4 bg-gray-50/60 dark:bg-dark-hover/30 border-t border-gray-200 dark:border-dark-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm">
                    <div className="text-gray-500 dark:text-dark-muted">
                      Showing <span className="font-semibold text-gray-900 dark:text-white">{(activityPage - 1) * activityPageSize + 1}</span> to{' '}
                      <span className="font-semibold text-gray-900 dark:text-white">{Math.min(activityPage * activityPageSize, filteredActivities.length)}</span> of{' '}
                      <span className="font-semibold text-gray-900 dark:text-white">{filteredActivities.length}</span> activities
                    </div>

                    {totalActivityPages > 1 && (
                      <div className="flex items-center space-x-1.5 self-center sm:self-auto">
                        <button
                          type="button"
                          disabled={activityPage <= 1}
                          onClick={() => setActivityPage(prev => Math.max(1, prev - 1))}
                          className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm font-semibold shadow-2xs transition-colors"
                          title="Previous page"
                        >
                          <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                          <span>Prev</span>
                        </button>

                        {Array.from({ length: totalActivityPages }, (_, i) => i + 1)
                          .filter(p => p === 1 || p === totalActivityPages || Math.abs(p - activityPage) <= 1)
                          .map((p, idx, arr) => (
                            <React.Fragment key={p}>
                              {idx > 0 && arr[idx - 1] !== p - 1 && (
                                <span className="px-1 text-gray-400">…</span>
                              )}
                              <button
                                type="button"
                                onClick={() => setActivityPage(p)}
                                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
                                  p === activityPage
                                    ? 'bg-emerald-600 text-white shadow-2xs'
                                    : 'border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover shadow-2xs'
                                }`}
                              >
                                {p}
                              </button>
                            </React.Fragment>
                          ))}

                        <button
                          type="button"
                          disabled={activityPage >= totalActivityPages}
                          onClick={() => setActivityPage(prev => Math.min(totalActivityPages, prev + 1))}
                          className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm font-semibold shadow-2xs transition-colors"
                          title="Next page"
                        >
                          <span>Next</span>
                          <ChevronRight className="w-3.5 h-3.5 ml-1" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Profile Card, Shortcuts & Explore */}
        <div className="lg:col-span-3 space-y-6">
          {/* User Mini Profile Card */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-xs space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-lg overflow-hidden ring-2 ring-emerald-500/20 shrink-0">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                ) : (
                  user?.username.charAt(0).toUpperCase()
                )}
              </div>
              <div className="truncate">
                <h3 className="font-bold text-base text-gray-900 dark:text-white truncate">
                  {user?.full_name || user?.username}
                </h3>
                <p className="text-sm text-gray-500 font-mono">@{user?.username}</p>
              </div>
            </div>

            {user?.bio && (
              <p className="text-sm text-gray-600 dark:text-dark-muted line-clamp-2">
                {user.bio}
              </p>
            )}

            <div className="pt-2 border-t border-gray-100 dark:border-dark-border flex items-center justify-between text-sm">
              <a
                href={`/user/${user?.username}`}
                className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline flex items-center space-x-1"
              >
                <UserIcon className="w-4 h-4" />
                <span>Your Profile</span>
              </a>
              <a
                href="/settings"
                className="text-gray-500 hover:text-gray-800 dark:hover:text-white flex items-center space-x-1 font-medium"
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </a>
            </div>
          </div>

          {/* Quick CLI Shortcuts Card */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-xs space-y-3">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white uppercase tracking-wider flex items-center space-x-1.5">
              <Terminal className="w-4 h-4 text-emerald-600" />
              <span>Git CLI Quick Reference</span>
            </h3>
            <div className="text-xs sm:text-sm space-y-2">
              <p className="text-gray-500 dark:text-dark-muted text-xs font-medium">Clone via Smart HTTP:</p>
              <code className="block p-2 rounded-lg bg-gray-100 dark:bg-dark-bg font-mono text-xs text-gray-800 dark:text-emerald-300 break-all select-all">
                git clone http://localhost:3000/{user?.username}/&lt;repo&gt;.git
              </code>
              <p className="text-gray-500 dark:text-dark-muted text-xs font-medium">Clone via Native SSH:</p>
              <code className="block p-2 rounded-lg bg-gray-100 dark:bg-dark-bg font-mono text-xs text-gray-800 dark:text-emerald-300 break-all select-all">
                git clone ssh://git@localhost:2222/{user?.username}/&lt;repo&gt;.git
              </code>
            </div>
          </div>

          {/* ProGit Features Card */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-xs space-y-3">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white uppercase tracking-wider">
              Explore ProGit Features
            </h3>
            <div className="space-y-2 text-sm">
              <a href="/explore" className="flex items-center space-x-2 text-gray-700 dark:text-dark-text hover:text-emerald-600 transition-colors font-medium">
                <Globe className="w-4 h-4 text-emerald-500" />
                <span>Browse public repositories</span>
              </a>
              <a href="/settings" className="flex items-center space-x-2 text-gray-700 dark:text-dark-text hover:text-emerald-600 transition-colors font-medium">
                <FileCode className="w-4 h-4 text-purple-500" />
                <span>Manage SSH keys &amp; PAT tokens</span>
              </a>
              <a href="/org/new" className="flex items-center space-x-2 text-gray-700 dark:text-dark-text hover:text-emerald-600 transition-colors font-medium">
                <Building2 className="w-4 h-4 text-blue-500" />
                <span>Create collaborative teams</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Footer */}
      <footer className="mt-12 pt-8 pb-8 border-t border-gray-200 dark:border-dark-border/60 text-center text-sm text-gray-500 dark:text-dark-muted space-y-2">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          <a href="/explore" className="text-gray-600 dark:text-dark-muted hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
            Explore
          </a>
          <a href="/settings" className="text-gray-600 dark:text-dark-muted hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
            Settings
          </a>
          <a href="/org/new" className="text-gray-600 dark:text-dark-muted hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
            Organizations
          </a>
          <a
            href="https://github.com/sanjeevsenapati/progit"
            target="_blank"
            rel="noreferrer"
            className="text-gray-600 dark:text-dark-muted hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            GitHub
          </a>
        </div>
        <p className="font-medium text-gray-700 dark:text-dark-text pt-2 text-sm">
          Supported by <span className="font-bold text-emerald-600 dark:text-emerald-400">Prodevans</span> • Created by <span className="font-bold text-gray-900 dark:text-white">Sanjeev Senapati</span>
        </p>
        <p className="text-gray-500 dark:text-dark-muted text-xs sm:text-sm">
          Credit: Built on top of Gogs source code. Released under the MIT License.
        </p>
        <p className="text-xs text-gray-400">
          &copy; {new Date().getFullYear()} ProGit. All rights reserved.
        </p>
      </footer>
    </div>
  );
};
