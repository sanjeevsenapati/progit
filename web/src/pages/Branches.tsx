import React, { useEffect, useState } from 'react';
import { api, Repository } from '../lib/api';
import { RepoNav } from '../components/RepoNav';
import { GitBranch, Plus, Check } from 'lucide-react';

interface BranchesProps {
  owner: string;
  repo: string;
}

export const Branches: React.FC<BranchesProps> = ({ owner, repo: repoName }) => {
  const [repoData, setRepoData] = useState<Repository | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [newBranchName, setNewBranchName] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const r = await api.getRepo(owner, repoName);
        setRepoData(r.repository);

        const list = await api.getBranches(owner, repoName);
        setBranches(list || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [owner, repoName]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    try {
      await api.createBranch(owner, repoName, newBranchName.trim(), repoData?.default_branch || 'main');
      setBranches(prev => [...prev, newBranchName.trim()]);
      setNewBranchName('');
      setShowModal(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading && !repoData) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading branches...</div>;
  }

  if (!repoData) {
    return <div className="py-20 text-center text-sm">Repository not found</div>;
  }

  return (
    <div>
      <RepoNav repo={repoData} activeTab="branches" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
            <GitBranch className="w-5 h-5 mr-2 text-emerald-600 dark:text-emerald-400" />
            Branches
          </h2>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New branch</span>
          </button>
        </div>

        {showModal && (
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white mb-2">Create a new branch</h3>
            <form onSubmit={handleCreate} className="flex items-center space-x-3">
              <input
                type="text"
                placeholder="Branch name (e.g. feature-login)"
                value={newBranchName}
                onChange={e => setNewBranchName(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border text-xs text-gray-600 dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-dark-hover"
              >
                Cancel
              </button>
            </form>
          </div>
        )}

        <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm divide-y divide-gray-100 dark:divide-dark-border overflow-hidden">
          {branches.map(b => (
            <div key={b} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors">
              <div className="flex items-center space-x-2">
                <a
                  href={`/${owner}/${repoName}/tree/${b}`}
                  className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  {b}
                </a>
                {b === repoData.default_branch && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    default
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

