import React, { useEffect, useState } from 'react';
import { api, Repository, Commit } from '../lib/api';
import { RepoNav } from '../components/RepoNav';
import { History, GitCommit, Copy, Check } from 'lucide-react';

interface CommitsProps {
  owner: string;
  repo: string;
}

export const Commits: React.FC<CommitsProps> = ({ owner, repo: repoName }) => {
  const [repoData, setRepoData] = useState<Repository | null>(() => api.getCachedRepo(owner, repoName)?.repository || null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedSha, setCopiedSha] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const r = await api.getRepo(owner, repoName);
        setRepoData(r.repository);

        const list = await api.getCommits(owner, repoName, r.repository.default_branch);
        setCommits(list || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [owner, repoName]);

  const copySHA = (sha: string) => {
    navigator.clipboard.writeText(sha);
    setCopiedSha(sha);
    setTimeout(() => setCopiedSha(''), 2000);
  };

  if (loading && !repoData) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading commits...</div>;
  }

  if (!repoData) {
    return <div className="py-20 text-center text-sm">Repository not found</div>;
  }

  return (
    <div>
      <RepoNav repo={repoData} activeTab="commits" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
          <History className="w-5 h-5 mr-2 text-emerald-600 dark:text-emerald-400" />
          Commit History
        </h2>

        <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm divide-y divide-gray-100 dark:divide-dark-border overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400 flex items-center justify-center space-x-2">
              <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Loading commits...</span>
            </div>
          ) : commits.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No commits found.</div>
          ) : (
            commits.map(c => (
              <div key={c.sha} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors">
                <div className="space-y-1">
                  <a
                    href={`/${owner}/${repoName}/commit/${c.sha}`}
                    className="font-semibold text-sm text-gray-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400"
                  >
                    {c.message}
                  </a>
                  <p className="text-xs text-gray-500 dark:text-dark-muted">
                    <span className="font-medium text-gray-700 dark:text-gray-300">{c.author}</span> committed on{' '}
                    {new Date(c.timestamp).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => copySHA(c.sha)}
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-dark-border text-gray-400"
                    title="Copy full SHA"
                  >
                    {copiedSha === c.sha ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <a
                    href={`/${owner}/${repoName}/commit/${c.sha}`}
                    className="px-2.5 py-1 rounded bg-gray-100 dark:bg-dark-hover font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    {c.short_sha}
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

