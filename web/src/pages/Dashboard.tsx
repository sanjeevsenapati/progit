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
  Globe
} from 'lucide-react';

const LANGUAGE_COLORS: Record<string, string> = {
  Go: '#00ADD8',
  TypeScript: '#3178C6',
  JavaScript: '#F7DF1E',
  Python: '#3572A5',
  Rust: '#DEA584',
  HTML: '#E34C26',
  CSS: '#563D7C',
  Shell: '#89E051',
};

function guessLanguage(name: string, desc: string): string {
  const combined = (name + ' ' + desc).toLowerCase();
  if (combined.includes('go') || combined.includes('golang')) return 'Go';
  if (combined.includes('typescript') || combined.includes('ts')) return 'TypeScript';
  if (combined.includes('react') || combined.includes('javascript') || combined.includes('js')) return 'JavaScript';
  if (combined.includes('python') || combined.includes('py')) return 'Python';
  if (combined.includes('rust')) return 'Rust';
  if (combined.includes('html')) return 'HTML';
  if (combined.includes('css')) return 'CSS';
  return 'Go';
}

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [starred, setStarred] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [feedFilter, setFeedFilter] = useState<'all' | 'commits' | 'issues'>('all');

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

  const filteredRepos = repos.filter(r => 
    r.name.toLowerCase().includes(filter.toLowerCase()) || 
    r.owner_name.toLowerCase().includes(filter.toLowerCase())
  );

  const filteredActivities = activities.filter(act => {
    if (feedFilter === 'commits') return act.op_type === 'push' || act.op_type === 'commit' || act.content.includes('commit');
    if (feedFilter === 'issues') return act.op_type === 'issue' || act.op_type === 'pull' || act.content.includes('issue') || act.content.includes('pull');
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Top Repositories & Organizations */}
        <div className="lg:col-span-3 space-y-6">
          {/* Top Repositories Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 dark:text-white text-sm">Top Repositories</h2>
              <a
                href="/new"
                className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New</span>
              </a>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Find a repository..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-xs"
              />
            </div>

            <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border shadow-xs overflow-hidden">
              {loading ? (
                <div className="p-4 text-center text-xs text-gray-400">Loading repositories...</div>
              ) : filteredRepos.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-500 dark:text-dark-muted space-y-2">
                  <BookOpen className="w-6 h-6 mx-auto text-gray-400" />
                  <p>No repositories found</p>
                  <a href="/new" className="inline-block text-emerald-600 dark:text-emerald-400 font-semibold hover:underline">
                    Create your first repository
                  </a>
                </div>
              ) : (
                filteredRepos.slice(0, 10).map(repo => (
                  <a
                    key={repo.id}
                    href={`/${repo.owner_name}/${repo.name}`}
                    className="flex items-center justify-between p-2.5 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors group"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <div className="w-5 h-5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                        <GitBranch className="w-3 h-3" />
                      </div>
                      <span className="text-xs font-semibold text-gray-800 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 truncate">
                        {repo.owner_name}/{repo.name}
                      </span>
                      {repo.is_private && <Lock className="w-3 h-3 text-gray-400 flex-shrink-0" />}
                    </div>
                    {repo.num_stars > 0 && (
                      <span className="flex items-center text-[11px] text-gray-400">
                        <Star className="w-3 h-3 mr-0.5 fill-amber-400 text-amber-400" />
                        {repo.num_stars}
                      </span>
                    )}
                  </a>
                ))
              )}
            </div>
          </div>

          {/* Organizations Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 dark:text-white text-sm">Your Organizations</h2>
              <a
                href="/org/new"
                className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
              >
                + New
              </a>
            </div>

            <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border shadow-xs overflow-hidden">
              {organizations.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-400 space-y-1.5">
                  <p>You aren't a member of any organizations yet.</p>
                  <a href="/org/new" className="inline-block text-emerald-600 hover:underline font-semibold">
                    Create an organization
                  </a>
                </div>
              ) : (
                organizations.map(org => (
                  <a
                    key={org.id}
                    href={`/org/${org.name}`}
                    className="flex items-center space-x-2.5 p-2.5 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors group"
                  >
                    <div className="w-6 h-6 rounded-md bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                      {org.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="truncate">
                      <p className="text-xs font-semibold text-gray-800 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 truncate">
                        {org.full_name || org.name}
                      </p>
                      <p className="text-[10px] text-gray-400 font-mono">@{org.name}</p>
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
          <div className="p-5 rounded-xl border border-gray-200 dark:border-dark-border bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent dark:from-emerald-950/30 dark:via-dark-surface bg-white dark:bg-dark-surface shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-base font-bold text-gray-900 dark:text-white">
                  Welcome, {user?.full_name || user?.username}!
                </h1>
                <p className="text-xs text-gray-500 dark:text-dark-muted mt-0.5">
                  Here's an overview of your projects, Git repositories, and team activities.
                </p>
              </div>
              <a
                href={`/user/${user?.username}`}
                className="hidden sm:inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text hover:bg-white dark:hover:bg-dark-surface shadow-xs transition-colors"
              >
                <span>Profile Overview</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Metric Badges */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="p-3 rounded-lg bg-white dark:bg-dark-bg/60 border border-gray-100 dark:border-dark-border text-center shadow-xs">
                <span className="block text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {repos.length}
                </span>
                <span className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Repositories</span>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-dark-bg/60 border border-gray-100 dark:border-dark-border text-center shadow-xs">
                <span className="block text-xl font-bold text-amber-500 font-mono">
                  {starred.length}
                </span>
                <span className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Stars</span>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-dark-bg/60 border border-gray-100 dark:border-dark-border text-center shadow-xs">
                <span className="block text-xl font-bold text-blue-500 font-mono">
                  {organizations.length}
                </span>
                <span className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Organizations</span>
              </div>
            </div>
          </div>

          {/* Activity Feed */}
          <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-xs overflow-hidden">
            {/* Feed Filter Header */}
            <div className="p-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <History className="w-4 h-4 text-emerald-600" />
                <h2 className="font-bold text-sm text-gray-900 dark:text-white">Recent Activity</h2>
              </div>
              <div className="flex space-x-1 text-xs">
                <button
                  onClick={() => setFeedFilter('all')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    feedFilter === 'all'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-bold'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFeedFilter('commits')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    feedFilter === 'commits'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-bold'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Commits
                </button>
                <button
                  onClick={() => setFeedFilter('issues')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    feedFilter === 'issues'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-bold'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Issues & PRs
                </button>
              </div>
            </div>

            {/* Activity Stream Items */}
            {loading ? (
              <div className="p-8 text-center text-xs text-gray-400">Loading activity feed...</div>
            ) : filteredActivities.length === 0 ? (
              <div className="p-12 text-center text-xs text-gray-400 space-y-2">
                <History className="w-8 h-8 mx-auto text-gray-300 dark:text-dark-muted" />
                <p>No recent activity found. Push code or open pull requests to see updates here.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-dark-border">
                {filteredActivities.map(act => {
                  let icon = <GitCommit className="w-3.5 h-3.5 text-emerald-600" />;
                  if (act.op_type === 'create_repo' || act.op_type === 'repo') {
                    icon = <GitBranch className="w-3.5 h-3.5 text-blue-600" />;
                  } else if (act.op_type === 'pull') {
                    icon = <GitPullRequest className="w-3.5 h-3.5 text-purple-600" />;
                  } else if (act.op_type === 'issue') {
                    icon = <CircleDot className="w-3.5 h-3.5 text-emerald-600" />;
                  } else if (act.op_type === 'star') {
                    icon = <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />;
                  }

                  return (
                    <div key={act.id} className="p-4 flex items-start space-x-3 hover:bg-gray-50/50 dark:hover:bg-dark-hover/30 transition-colors">
                      <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-dark-bg border border-gray-200 dark:border-dark-border flex items-center justify-center flex-shrink-0 mt-0.5">
                        {icon}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="text-xs text-gray-800 dark:text-dark-text leading-snug">
                          <a href={`/user/${act.username}`} className="font-bold text-gray-900 dark:text-white hover:underline">
                            @{act.username}
                          </a>{' '}
                          {act.content}
                        </div>
                        <p className="text-[10px] text-gray-400">
                          {new Date(act.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Profile Card, Shortcuts & Explore */}
        <div className="lg:col-span-3 space-y-6">
          {/* User Mini Profile Card */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-xs space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-lg overflow-hidden ring-2 ring-emerald-500/20">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                ) : (
                  user?.username.charAt(0).toUpperCase()
                )}
              </div>
              <div className="truncate">
                <h3 className="font-bold text-sm text-gray-900 dark:text-white truncate">
                  {user?.full_name || user?.username}
                </h3>
                <p className="text-xs text-gray-500 font-mono">@{user?.username}</p>
              </div>
            </div>

            {user?.bio && (
              <p className="text-xs text-gray-600 dark:text-dark-muted line-clamp-2">
                {user.bio}
              </p>
            )}

            <div className="pt-2 border-t border-gray-100 dark:border-dark-border flex items-center justify-between text-xs">
              <a
                href={`/user/${user?.username}`}
                className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline flex items-center space-x-1"
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span>Your Profile</span>
              </a>
              <a
                href="/settings"
                className="text-gray-500 hover:text-gray-800 dark:hover:text-white flex items-center space-x-1"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Settings</span>
              </a>
            </div>
          </div>

          {/* Quick CLI Shortcuts Card */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-xs space-y-3">
            <h3 className="font-bold text-xs text-gray-900 dark:text-white uppercase tracking-wider flex items-center space-x-1.5">
              <Terminal className="w-3.5 h-3.5 text-emerald-600" />
              <span>Git CLI Quick Reference</span>
            </h3>
            <div className="text-xs space-y-2">
              <p className="text-gray-500 dark:text-dark-muted text-[11px]">Clone via Smart HTTP:</p>
              <code className="block p-2 rounded-lg bg-gray-100 dark:bg-dark-bg font-mono text-[10px] text-gray-800 dark:text-emerald-300 break-all select-all">
                git clone http://localhost:3000/{user?.username}/&lt;repo&gt;.git
              </code>
              <p className="text-gray-500 dark:text-dark-muted text-[11px]">Clone via Native SSH:</p>
              <code className="block p-2 rounded-lg bg-gray-100 dark:bg-dark-bg font-mono text-[10px] text-gray-800 dark:text-emerald-300 break-all select-all">
                git clone ssh://git@localhost:2222/{user?.username}/&lt;repo&gt;.git
              </code>
            </div>
          </div>

          {/* ProGit Features Card */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-xs space-y-2.5">
            <h3 className="font-bold text-xs text-gray-900 dark:text-white uppercase tracking-wider">
              Explore ProGit Features
            </h3>
            <div className="space-y-2 text-xs">
              <a href="/explore" className="flex items-center space-x-2 text-gray-700 dark:text-dark-text hover:text-emerald-600 transition-colors">
                <Globe className="w-3.5 h-3.5 text-emerald-500" />
                <span>Browse public repositories</span>
              </a>
              <a href="/settings" className="flex items-center space-x-2 text-gray-700 dark:text-dark-text hover:text-emerald-600 transition-colors">
                <FileCode className="w-3.5 h-3.5 text-purple-500" />
                <span>Manage SSH keys & PAT tokens</span>
              </a>
              <a href="/org/new" className="flex items-center space-x-2 text-gray-700 dark:text-dark-text hover:text-emerald-600 transition-colors">
                <Building2 className="w-3.5 h-3.5 text-blue-500" />
                <span>Create collaborative teams</span>
              </a>
            </div>
          </div>
        </div>

        {/* Dashboard Footer Attribution */}
        <div className="pt-8 pb-4 text-center text-xs text-gray-500 dark:text-dark-muted border-t border-gray-200 dark:border-dark-border/40 mt-8 space-y-1">
          <p>
            Supported by <span className="font-semibold text-emerald-600 dark:text-emerald-400">Prodevans</span> • Created by <span className="font-semibold text-gray-900 dark:text-white">Sanjeev Senapati</span>
          </p>
          <p className="text-[11px] text-gray-400">
            Credit: Built on top of Gogs source code. Released under the MIT License.
          </p>
        </div>
      </div>
    </div>
  );
};
