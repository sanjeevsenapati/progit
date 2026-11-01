import React, { useEffect, useState } from 'react';
import { api, Repository, Issue, User } from '../lib/api';
import { useAuth } from '../lib/theme';
import { RepoNav } from '../components/RepoNav';
import { CircleDot, CheckCircle2, MessageSquare, Plus, UserCheck, Filter } from 'lucide-react';

interface IssuesListProps {
  owner: string;
  repo: string;
}

export const IssuesList: React.FC<IssuesListProps> = ({ owner, repo: repoName }) => {
  const { user } = useAuth();
  const [repoData, setRepoData] = useState<Repository | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [assignees, setAssignees] = useState<User[]>([]);
  const [stateFilter, setStateFilter] = useState<'open' | 'closed'>('open');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAssignees() {
      try {
        const list = await api.listRepoAssignees(owner, repoName);
        setAssignees(list || []);
      } catch (err) {
        console.error(err);
      }
    }
    loadAssignees();
  }, [owner, repoName]);

  useEffect(() => {
    async function load() {
      try {
        const r = await api.getRepo(owner, repoName);
        setRepoData(r.repository);

        const list = await api.listIssues(owner, repoName, stateFilter, assigneeFilter || undefined);
        setIssues(list || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [owner, repoName, stateFilter, assigneeFilter]);

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Open/Closed Filter Tabs & Assignee Filter */}
          <div className="flex flex-wrap items-center gap-4">
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

            {/* Assignee Filter Dropdown */}
            <div className="flex items-center space-x-1.5 text-xs text-gray-600 dark:text-dark-muted pl-2 border-l border-gray-200 dark:border-dark-border">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              <span>Assignee:</span>
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="px-2.5 py-1 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
              >
                <option value="">All Assignees</option>
                {user && <option value={user.username}>Assigned to me (@{user.username})</option>}
                {assignees
                  .filter(d => !user || d.username !== user.username)
                  .map(dev => (
                    <option key={dev.id} value={dev.username}>
                      @{dev.username} {dev.full_name ? `(${dev.full_name})` : ''}
                    </option>
                  ))}
              </select>
            </div>
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
              <h3 className="font-bold text-gray-900 dark:text-white">
                No {stateFilter} issues {assigneeFilter ? `assigned to @${assigneeFilter}` : ''}
              </h3>
              <p className="text-xs">
                {assigneeFilter 
                  ? `No matching issues found for assignee @${assigneeFilter}. Try changing the filter.`
                  : `There are no ${stateFilter} issues in this repository.`}
              </p>
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
                    <div className="flex items-center space-x-2">
                      <a
                        href={`/${owner}/${repoName}/issues/${iss.index_number}`}
                        className="font-bold text-sm text-gray-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400"
                      >
                        {iss.title}
                      </a>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-dark-muted flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>
                        #{iss.index_number} opened by <span className="font-semibold text-gray-700 dark:text-gray-300">{iss.poster_name}</span> on{' '}
                        {new Date(iss.created_at).toLocaleDateString()}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  {iss.assignee_name && (
                    <div 
                      className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 text-xs font-medium"
                      title={`Assigned to @${iss.assignee_name}`}
                    >
                      <UserCheck className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>@{iss.assignee_name}</span>
                    </div>
                  )}

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
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
