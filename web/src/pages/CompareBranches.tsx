import React, { useEffect, useState } from 'react';
import { api, Repository, RepoResponse, Commit, FileDiff } from '../lib/api';
import { navigate } from '../lib/router';
import { RepoNav } from '../components/RepoNav';
import { showToast } from '../components/ModalDialog';
import { GitPullRequest, ArrowRight, GitCommit, FileText, CheckCircle2, AlertTriangle, Ban } from 'lucide-react';

interface CompareBranchesProps {
  owner: string;
  repo: string;
}

export const CompareBranches: React.FC<CompareBranchesProps> = ({ owner, repo: repoName }) => {
  const cachedRepo = api.getCachedRepo(owner, repoName);
  const [repoData, setRepoData] = useState<Repository | null>(() => cachedRepo?.repository || null);
  const [repoPermissions, setRepoPermissions] = useState<RepoResponse['permissions'] | undefined>(cachedRepo?.permissions);
  const [branches, setBranches] = useState<string[]>([]);
  const [baseBranch, setBaseBranch] = useState('main');
  const [headBranch, setHeadBranch] = useState('');
  const [commits, setCommits] = useState<Commit[]>([]);
  const [files, setFiles] = useState<FileDiff[]>([]);
  const [mergeable, setMergeable] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const r = await api.getRepo(owner, repoName);
        setRepoData(r.repository);
        setRepoPermissions(r.permissions);
        setBranches(r.branches || ['main']);
        setBaseBranch(r.repository.default_branch || 'main');

        if (r.repository.allow_download_and_pulls === false) {
          return;
        }

        const otherBranches = (r.branches || []).filter(b => b !== r.repository.default_branch);
        if (otherBranches.length > 0) {
          setHeadBranch(otherBranches[0]);
          await runCompare(r.repository.default_branch || 'main', otherBranches[0]);
        } else {
          setHeadBranch(r.repository.default_branch || 'main');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [owner, repoName]);

  const runCompare = async (base: string, head: string) => {
    if (base === head) {
      setCommits([]);
      setFiles([]);
      setMergeable(true);
      return;
    }
    try {
      const res = await api.compareBranches(owner, repoName, base, head);
      setCommits(res.commits || []);
      setFiles(res.files || []);
      setMergeable(res.mergeable);
      if (res.commits?.length > 0 && !title) {
        setTitle(res.commits[0].message);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleBaseChange = (b: string) => {
    setBaseBranch(b);
    runCompare(b, headBranch);
  };

  const handleHeadChange = (h: string) => {
    setHeadBranch(h);
    runCompare(baseBranch, h);
  };

  const handleCreatePR = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const pr = await api.createPull(owner, repoName, {
        title: title || `Merge ${headBranch} into ${baseBranch}`,
        content,
        head_branch: headBranch,
        base_branch: baseBranch,
      });
      navigate(`/${owner}/${repoName}/pulls/${pr.issue?.index_number || pr.id}`);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  if (!repoData) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading...</div>;
  }

  if (repoData.allow_download_and_pulls === false) {
    return (
      <div>
        <RepoNav repo={repoData} permissions={repoPermissions} activeTab="pulls" />
        <div className="max-w-xl mx-auto my-12 p-8 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 flex items-center justify-center mx-auto border border-amber-200 dark:border-amber-800">
            <Ban className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Pull Requests &amp; Compare Disabled</h2>
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
          <GitPullRequest className="w-5 h-5 mr-2 text-emerald-600 dark:text-emerald-400" />
          Comparing changes
        </h1>

        {/* Branch Selectors Banner */}
        <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-2 text-sm">
            <span className="text-xs text-gray-500 font-semibold uppercase">base:</span>
            <select
              value={baseBranch}
              onChange={e => handleBaseChange(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-xs font-mono font-bold text-gray-800 dark:text-white"
            >
              {branches.map(b => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            <ArrowRight className="w-4 h-4 text-gray-400" />

            <span className="text-xs text-gray-500 font-semibold uppercase">compare:</span>
            <select
              value={headBranch}
              onChange={e => handleHeadChange(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-xs font-mono font-bold text-gray-800 dark:text-white"
            >
              {branches.map(b => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div>
            {baseBranch !== headBranch && (
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-colors"
              >
                {showCreateForm ? 'Hide Form' : 'Create pull request'}
              </button>
            )}
          </div>
        </div>

        {/* Mergeable Status */}
        {baseBranch !== headBranch && (
          <div className="flex items-center space-x-2 text-xs">
            {mergeable ? (
              <span className="flex items-center font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Able to merge automatically.
              </span>
            ) : (
              <span className="flex items-center font-semibold text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 mr-1" />
                Cannot automatically merge. Conflict resolution may be required.
              </span>
            )}
            <span className="text-gray-400">•</span>
            <span className="text-gray-600 dark:text-dark-muted">{commits.length} commits</span>
            <span className="text-gray-400">•</span>
            <span className="text-gray-600 dark:text-dark-muted">{files.length} files changed</span>
          </div>
        )}

        {/* Create Pull Request Form */}
        {showCreateForm && (
          <form onSubmit={handleCreatePR} className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white">Open a pull request</h3>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase">Title *</label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Pull request title"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase">Description</label>
              <textarea
                rows={5}
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Explain the changes in this pull request..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-colors"
            >
              Submit pull request
            </button>
          </form>
        )}

        {/* Diff preview */}
        {files.length > 0 && (
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white">Files Changed ({files.length})</h3>
            {files.map((file, idx) => (
              <div key={idx} className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 dark:bg-dark-hover/40 border-b border-gray-200 dark:border-dark-border flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span>{file.new_path || file.old_path}</span>
                  </span>
                  <span className="text-gray-400">+{file.additions} -{file.deletions}</span>
                </div>
                <div className="p-4 overflow-x-auto text-xs font-mono leading-relaxed bg-gray-950 text-gray-100">
                  <pre className="whitespace-pre">
                    {file.patch.split('\n').map((line, lIdx) => {
                      let color = 'text-gray-400';
                      if (line.startsWith('+') && !line.startsWith('+++')) color = 'text-emerald-400';
                      else if (line.startsWith('-') && !line.startsWith('---')) color = 'text-red-400';
                      return <div key={lIdx} className={color}>{line}</div>;
                    })}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

