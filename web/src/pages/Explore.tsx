import React, { useEffect, useState } from 'react';
import { api, Repository } from '../lib/api';
import { Compass, GitBranch, Star, Search, Lock, BookOpen } from 'lucide-react';

export const Explore: React.FC = () => {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.explore();
        setRepos(data.repositories || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = repos.filter(r => 
    r.name.toLowerCase().includes(filter.toLowerCase()) || 
    r.description.toLowerCase().includes(filter.toLowerCase()) ||
    r.owner_name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-dark-border pb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <Compass className="w-6 h-6 mr-2 text-emerald-600 dark:text-emerald-400" />
            Explore Public Repositories
          </h1>
          <p className="text-sm text-gray-500 dark:text-dark-muted mt-1">
            Discover community projects and source code hosted on ProGit.
          </p>
        </div>

        <div className="w-full sm:w-72 relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search repositories..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading repositories...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-gray-500 dark:text-dark-muted space-y-3 bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border">
          <BookOpen className="w-10 h-10 mx-auto text-gray-400" />
          <p className="font-semibold text-gray-900 dark:text-white">No public repositories found</p>
          <p className="text-xs">Be the first to share your code publicly on ProGit.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(repo => (
            <div
              key={repo.id}
              className="p-5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:border-emerald-500/50 dark:hover:border-emerald-500/50 transition-all shadow-sm space-y-3"
            >
              <div className="flex items-start justify-between">
                <a
                  href={`/${repo.owner_name}/${repo.name}`}
                  className="text-base font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1.5"
                >
                  <GitBranch className="w-4 h-4 flex-shrink-0" />
                  <span>{repo.owner_name} / {repo.name}</span>
                </a>
                <span className="text-xs px-2 py-0.5 rounded-full border border-gray-200 dark:border-dark-border text-gray-500 dark:text-dark-muted">
                  Public
                </span>
              </div>

              <p className="text-xs text-gray-600 dark:text-dark-muted line-clamp-2">
                {repo.description || 'No description provided.'}
              </p>

              <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-dark-muted pt-2 border-t border-gray-100 dark:border-dark-border">
                <span className="flex items-center">
                  <Star className="w-3.5 h-3.5 mr-1 fill-amber-400 text-amber-400" />
                  {repo.num_stars}
                </span>
                <span>Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

