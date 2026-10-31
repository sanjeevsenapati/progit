import React, { useEffect, useState } from 'react';
import { api, Repository, Issue } from '../lib/api';
import { RepoNav } from '../components/RepoNav';
import { CircleDot, CheckCircle2, MessageSquare, Plus } from 'lucide-react';

interface IssuesListProps {
  owner: string;
  repo: string;
}

export const IssuesList: React.FC<IssuesListProps> = ({ owner, repo: repoName }) => {
  const [repoData, setRepoData] = useState<Repository | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [stateFilter, setStateFilter] = useState<'open' | 'closed'>('open');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const r = await api.getRepo(owner, repoName);
        setRepoData(r.repository);

        const list = await api.listIssues(owner, repoName, stateFilter);
        setIssues(list || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [owner, repoName, stateFilter]);

  if (loading && !repoData) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading issues...</div>;
  }

  if (!repoData) {
    return <div className="py-20 text-center text-sm">Repository not found</div>;
  }

  return (
    <div>
      <RepoNav repo={repoData} activeTab="issues" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-center justify-between">
          {/* Open/Closed Filter Tabs */}
          <div className="flex items-center space-x-4 text-sm font-semibold">
            <button
              onClick={() => setStateFilter('open')}
              className={`flex items-center space-x-1.5 pb-1 border-b-2 transition-colors ${
                stateFilter === 'open'
                  ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <CircleDot className="w-4 h-4" />
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
              <span>Closed</span>
            </button>
          </div>

          <a
            href={`/${owner}/${repoName}/issues/new`}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New issue</span>
          </a>
        </div>

        {/* Issues List Table */}
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm divide-y divide-gray-100 dark:divide-dark-border overflow-hidden">
          {issues.length === 0 ? (
            <div className="p-12 text-center text-gray-500 dark:text-dark-muted space-y-3">
              <CircleDot className="w-10 h-10 mx-auto text-gray-400" />
              <h3 className="font-bold text-gray-900 dark:text-white">No {stateFilter} issues</h3>
              <p className="text-xs">There are no {stateFilter} issues in this repository.</p>
            </div>
          ) : (
            issues.map(iss => (
              <div key={iss.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors">
                <div className="flex items-start space-x-3">
                  {iss.is_closed ? (
                    <CheckCircle2 className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <CircleDot className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  )}

                  <div className="space-y-1">
                    <a
                      href={`/${owner}/${repoName}/issues/${iss.index_number}`}
                      className="font-bold text-sm text-gray-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400"
                    >
                      {iss.title}
                    </a>
                    <p className="text-xs text-gray-500 dark:text-dark-muted">
                      #{iss.index_number} opened by <span className="font-semibold text-gray-700 dark:text-gray-300">{iss.poster_name}</span> on{' '}
                      {new Date(iss.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {iss.num_comments > 0 && (
                  <a
                    href={`/${owner}/${repoName}/issues/${iss.index_number}`}
                    className="flex items-center space-x-1 text-xs text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{iss.num_comments}</span>
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

