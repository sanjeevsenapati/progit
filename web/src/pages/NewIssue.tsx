import React, { useEffect, useState } from 'react';
import { api, Repository } from '../lib/api';
import { RepoNav } from '../components/RepoNav';
import { CircleDot, AlertCircle } from 'lucide-react';

interface NewIssueProps {
  owner: string;
  repo: string;
}

export const NewIssue: React.FC<NewIssueProps> = ({ owner, repo: repoName }) => {
  const [repoData, setRepoData] = useState<Repository | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const r = await api.getRepo(owner, repoName);
        setRepoData(r.repository);
      } catch (err) {
        console.error(err);
      }
    }
    load();
  }, [owner, repoName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const issue = await api.createIssue(owner, repoName, { title, content });
      window.location.href = `/${owner}/${repoName}/issues/${issue.index_number}`;
    } catch (err: any) {
      setError(err.message || 'Failed to create issue');
    } finally {
      setLoading(false);
    }
  };

  if (!repoData) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading...</div>;
  }

  return (
    <div>
      <RepoNav repo={repoData} activeTab="issues" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
          <CircleDot className="w-5 h-5 mr-2 text-emerald-600 dark:text-emerald-400" />
          Create new issue
        </h1>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 text-sm flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
              Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Title of issue"
              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
              Description (Markdown supported)
            </label>
            <textarea
              rows={8}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Describe the bug or feature request..."
              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-mono"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-2">
            <a
              href={`/${owner}/${repoName}/issues`}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-dark-border text-sm font-semibold text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover"
            >
              Cancel
            </a>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-sm shadow-sm transition-colors"
            >
              {loading ? 'Submitting...' : 'Submit new issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

