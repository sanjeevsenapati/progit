import React, { useEffect, useState } from 'react';
import { api, Repository } from '../lib/api';
import { RepoNav } from '../components/RepoNav';
import { Tag as TagIcon, Download } from 'lucide-react';

interface TagsProps {
  owner: string;
  repo: string;
}

export const Tags: React.FC<TagsProps> = ({ owner, repo: repoName }) => {
  const cachedRepo = api.getCachedRepo(owner, repoName);
  const [repoData, setRepoData] = useState<Repository | null>(() => cachedRepo?.repository || null);
  const [tags, setTags] = useState<string[]>(() => cachedRepo?.tags || []);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const r = await api.getRepo(owner, repoName);
        setRepoData(r.repository);
        setTags(r.tags || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [owner, repoName]);

  if (loading && !repoData) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading tags...</div>;
  }

  if (!repoData) {
    return <div className="py-20 text-center text-sm">Repository not found</div>;
  }

  return (
    <div>
      <RepoNav repo={repoData} activeTab="branches" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
          <TagIcon className="w-5 h-5 mr-2 text-emerald-600 dark:text-emerald-400" />
          Tags & Releases
        </h2>

        <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm divide-y divide-gray-100 dark:divide-dark-border overflow-hidden">
          {tags.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              There aren't any tags or releases yet.
            </div>
          ) : (
            tags.map(t => (
              <div key={t} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors">
                <div className="flex items-center space-x-2">
                  <TagIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <a
                    href={`/${owner}/${repoName}/tree/${t}`}
                    className="font-mono text-sm font-bold text-gray-900 dark:text-white hover:underline"
                  >
                    {t}
                  </a>
                </div>

                <a
                  href={`/${owner}/${repoName}/tree/${t}`}
                  className="px-3 py-1 rounded bg-gray-100 dark:bg-dark-hover text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Browse code</span>
                </a>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

