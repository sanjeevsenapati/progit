import React, { useEffect, useState } from 'react';
import { api, Repository, Activity } from '../lib/api';
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
  GitPullRequest 
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getDashboard();
        setRepos(data.repositories || []);
        setActivities(data.activities || []);
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Sidebar: My Repositories */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900 dark:text-white text-base">Top Repositories</h2>
            <a
              href="/new"
              className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
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
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-4 text-center text-xs text-gray-400">Loading repositories...</div>
            ) : filteredRepos.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-500 dark:text-dark-muted space-y-2">
                <BookOpen className="w-8 h-8 mx-auto text-gray-400" />
                <p>No repositories found</p>
                <a href="/new" className="inline-block text-emerald-600 dark:text-emerald-400 font-semibold hover:underline">
                  Create your first repository
                </a>
              </div>
            ) : (
              filteredRepos.map(repo => (
                <a
                  key={repo.id}
                  href={`/${repo.owner_name}/${repo.name}`}
                  className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors group"
                >
                  <div className="flex items-center space-x-2 truncate">
                    <div className="w-6 h-6 rounded bg-gray-100 dark:bg-dark-border flex items-center justify-center text-gray-500 dark:text-dark-muted flex-shrink-0">
                      <GitBranch className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-semibold text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 truncate">
                      {repo.owner_name}/{repo.name}
                    </span>
                    {repo.is_private && <Lock className="w-3 h-3 text-gray-400 flex-shrink-0" />}
                  </div>
                  {repo.num_stars > 0 && (
                    <span className="flex items-center text-xs text-gray-500 dark:text-dark-muted">
                      <Star className="w-3 h-3 mr-0.5 fill-amber-400 text-amber-400" />
                      {repo.num_stars}
                    </span>
                  )}
                </a>
              ))
            )}
          </div>
        </div>

        {/* Center / Right: Recent Activity Stream */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white dark:bg-dark-surface p-6 rounded-xl border border-gray-200 dark:border-dark-border shadow-sm">
            <h2 className="font-bold text-gray-900 dark:text-white text-lg mb-4 flex items-center">
              <History className="w-5 h-5 mr-2 text-emerald-600 dark:text-emerald-400" />
              Activity Feed
            </h2>

            {loading ? (
              <div className="py-8 text-center text-sm text-gray-400">Loading activity...</div>
            ) : activities.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500 dark:text-dark-muted space-y-3">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-dark-hover mx-auto flex items-center justify-center text-gray-400">
                  <History className="w-6 h-6" />
                </div>
                <p className="font-medium text-gray-900 dark:text-white">No recent activity</p>
                <p className="text-xs max-w-sm mx-auto">
                  When you push commits, open issues, or merge pull requests, your team's activity stream will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-dark-border">
                {activities.map(act => (
                  <div key={act.id} className="py-3 flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                      {act.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-900 dark:text-white font-medium">
                        <span className="font-bold">@{act.username}</span> {act.content}
                      </p>
                      <p className="text-[11px] text-gray-400 dark:text-dark-muted mt-0.5">
                        {new Date(act.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

