import React, { useEffect, useState } from 'react';
import { api, Repository, CommitDiff } from '../lib/api';
import { RepoNav } from '../components/RepoNav';
import { GitCommit, FileText, Plus, Minus, ArrowLeft } from 'lucide-react';

interface CommitDetailProps {
  owner: string;
  repo: string;
  sha: string;
}

export const CommitDetail: React.FC<CommitDetailProps> = ({ owner, repo: repoName, sha }) => {
  const [repoData, setRepoData] = useState<Repository | null>(() => api.getCachedRepo(owner, repoName)?.repository || null);
  const [diff, setDiff] = useState<CommitDiff | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const r = await api.getRepo(owner, repoName);
        setRepoData(r.repository);

        const d = await api.getCommitDiff(owner, repoName, sha);
        setDiff(d);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [owner, repoName, sha]);

  if (loading && !repoData) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading commit diff...</div>;
  }

  if (!repoData || !diff) {
    return <div className="py-20 text-center text-sm">Commit not found</div>;
  }

  const totalAdditions = diff.files.reduce((acc, f) => acc + f.additions, 0);
  const totalDeletions = diff.files.reduce((acc, f) => acc + f.deletions, 0);

  return (
    <div>
      <RepoNav repo={repoData} activeTab="commits" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Back Link */}
        <a
          href={`/${owner}/${repoName}/commits`}
          className="inline-flex items-center text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          Back to Commits
        </a>

        {/* Commit Header Banner */}
        <div className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-3">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {diff.commit ? diff.commit.message : 'Commit'}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-dark-muted font-mono">
            {diff.commit && (
              <span>
                Authored by <strong className="text-gray-800 dark:text-gray-200">{diff.commit.author}</strong> on{' '}
                {new Date(diff.commit.timestamp).toLocaleString()}
              </span>
            )}
            <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-dark-hover font-bold text-emerald-600 dark:text-emerald-400">
              commit {sha}
            </span>
          </div>
          <div className="flex items-center space-x-3 text-xs font-semibold pt-2 border-t border-gray-100 dark:border-dark-border">
            <span>Showing {diff.files.length} changed files</span>
            <span className="text-emerald-600 flex items-center">
              <Plus className="w-3 h-3 mr-0.5" /> {totalAdditions}
            </span>
            <span className="text-red-600 flex items-center">
              <Minus className="w-3 h-3 mr-0.5" /> {totalDeletions}
            </span>
          </div>
        </div>

        {/* Diff Patches */}
        <div className="space-y-6">
          {diff.files.map((file, idx) => (
            <div key={idx} className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 dark:bg-dark-hover/40 border-b border-gray-200 dark:border-dark-border flex items-center justify-between text-xs font-mono">
                <span className="font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span>{file.new_path || file.old_path}</span>
                </span>
                <span className="text-gray-400">
                  +{file.additions} -{file.deletions}
                </span>
              </div>

              <div className="p-4 overflow-x-auto text-xs font-mono leading-relaxed bg-gray-950 text-gray-100">
                <pre className="whitespace-pre">
                  {file.patch.split('\n').map((line, lIdx) => {
                    let color = 'text-gray-400';
                    let bg = '';
                    if (line.startsWith('+') && !line.startsWith('+++')) {
                      color = 'text-emerald-400';
                      bg = 'bg-emerald-950/40';
                    } else if (line.startsWith('-') && !line.startsWith('---')) {
                      color = 'text-red-400';
                      bg = 'bg-red-950/40';
                    } else if (line.startsWith('@@')) {
                      color = 'text-sky-400 font-semibold';
                    }
                    return (
                      <div key={lIdx} className={`${color} ${bg} px-2`}>
                        {line}
                      </div>
                    );
                  })}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

