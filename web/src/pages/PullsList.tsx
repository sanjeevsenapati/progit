import React, { useEffect, useState } from 'react';
import { api, Repository, RepoResponse, PullRequest } from '../lib/api';
import { useAuth } from '../lib/theme';
import { RepoNav } from '../components/RepoNav';
import { GitPullRequest, CheckCircle2, GitMerge, Plus, Ban } from 'lucide-react';

interface PullsListProps {
  owner: string;
  repo: string;
}

export const PullsList: React.FC<PullsListProps> = ({ owner, repo: repoName }) => {
  const { user } = useAuth();
  const cachedRepo = api.getCachedRepo(owner, repoName);
  const [repoData, setRepoData] = useState<Repository | null>(() => cachedRepo?.repository || null);
  const [repoPermissions, setRepoPermissions] = useState<RepoResponse['permissions'] | undefined>(cachedRepo?.permissions);
  const [pulls, setPulls] = useState<PullRequest[]>([]);
  const [stateFilter, setStateFilter] = useState<'open' | 'closed'>('open');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const r = await api.getRepo(owner, repoName);
        setRepoData(r.repository);
        setRepoPermissions(r.permissions);

        if (r.repository.allow_download_and_pulls === false) {
          setPulls([]);
          return;
        }

        const list = await api.listPulls(owner, repoName, stateFilter);
        setPulls(list || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [owner, repoName, stateFilter]);

  if (loading && !repoData) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading pull requests...</div>;
  }

  if (!repoData) {
    return <div className="py-20 text-center text-sm">Repository not found</div>;
  }

  if (repoData.allow_download_and_pulls === false) {
    return (
      <div>
        <RepoNav repo={repoData} permissions={repoPermissions} activeTab="pulls" />
        <div className="max-w-xl mx-auto my-12 p-8 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 flex items-center justify-center mx-auto border border-amber-200 dark:border-amber-800">
            <Ban className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Pull Requests Disabled</h2>
          <p className="text-xs text-gray-500 dark:text-dark-muted leading-relaxed">
            Downloads and Pull Requests are currently disabled for <strong>{owner}/{repoName}</strong> in Repository Settings.
          </p>
          <div className="pt-2">
            <a
              href={`/${owner}/${repoName}`}
              className="inline-flex items-center px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-colors"
            >
              Return to repository
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <RepoNav repo={repoData} permissions={repoPermissions} activeTab="pulls" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 text-sm font-semibold">
            <button
              onClick={() => setStateFilter('open')}
              className={`flex items-center space-x-1.5 pb-1 border-b-2 transition-colors ${
                stateFilter === 'open'
                  ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <GitPullRequest className="w-4 h-4" />
              <span>Open</span>
            </button>
            <button
              onClick={() => setStateFilter('closed')}
              className={`flex items-center space-x-1.5 pb-1 border-b-2 transition-colors ${
                stateFilter === 'closed'
                  ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Closed / Merged</span>
            </button>
          </div>

          {user ? (
            <a
              href={`/${owner}/${repoName}/compare`}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New pull request</span>
            </a>
          ) : (
            <a
              href="/login"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text font-semibold text-xs shadow-xs transition-colors"
            >
              <span>Sign in to open pull request</span>
            </a>
          )}
        </div>

        <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm divide-y divide-gray-100 dark:divide-dark-border overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400 flex items-center justify-center space-x-2">
              <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Loading pull requests...</span>
            </div>
          ) : pulls.length === 0 ? (
            <div className="p-12 text-center text-gray-500 dark:text-dark-muted space-y-3">
              <GitPullRequest className="w-10 h-10 mx-auto text-gray-400" />
              <h3 className="font-bold text-gray-900 dark:text-white">No {stateFilter} pull requests</h3>
              <p className="text-xs">There are no {stateFilter} pull requests matching your filter.</p>
            </div>
          ) : (
            pulls.map(pr => {
              const iss = pr.issue;
              if (!iss) return null;
              return (
                <div key={pr.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors">
                  <div className="flex items-start space-x-3">
                    {pr.is_merged ? (
                      <GitMerge className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
                    ) : iss.is_closed ? (
                      <CheckCircle2 className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <GitPullRequest className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    )}

                    <div className="space-y-1">
                      <a
                        href={`/${owner}/${repoName}/pulls/${iss.index_number}`}
                        className="font-bold text-sm text-gray-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400"
                      >
                        {iss.title}
                      </a>
                      <p className="text-xs text-gray-500 dark:text-dark-muted">
                        #{iss.index_number} opened by <span className="font-semibold text-gray-700 dark:text-gray-300">{iss.poster_name}</span> • wants to merge{' '}
                        <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-dark-border text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">
                          {pr.head_branch}
                        </code>{' '}
                        into{' '}
                        <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-dark-border text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">
                          {pr.base_branch}
                        </code>
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

