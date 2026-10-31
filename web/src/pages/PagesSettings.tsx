import React, { useEffect, useState } from 'react';
import { api, Repository, PagesConfig } from '../lib/api';
import { RepoNav } from '../components/RepoNav';
import { 
  Globe, 
  ExternalLink, 
  Check, 
  Copy, 
  GitBranch, 
  Folder, 
  ShieldCheck, 
  FileCode, 
  Sparkles,
  AlertCircle
} from 'lucide-react';

interface PagesSettingsProps {
  owner: string;
  repo: string;
}

export const PagesSettings: React.FC<PagesSettingsProps> = ({ owner, repo: repoName }) => {
  const [repoData, setRepoData] = useState<Repository | null>(null);
  const [pagesConfig, setPagesConfig] = useState<PagesConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [enablePages, setEnablePages] = useState(false);
  const [pagesBranch, setPagesBranch] = useState('gh-pages');
  const [pagesFolder, setPagesFolder] = useState('/');
  const [branches, setBranches] = useState<string[]>([]);

  const [copiedURL, setCopiedURL] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    loadData();
  }, [owner, repoName]);

  const loadData = async () => {
    try {
      setLoading(true);
      const repoRes = await api.getRepo(owner, repoName);
      setRepoData(repoRes.repository);

      const configRes = await api.getPagesConfig(owner, repoName);
      setPagesConfig(configRes);
      setEnablePages(configRes.enable_pages);
      const availBranches = configRes.branches || repoRes.branches || [];
      setBranches(availBranches);
      let selectedBranch = configRes.pages_branch;
      if (!selectedBranch || (availBranches.length > 0 && !availBranches.includes(selectedBranch))) {
        if (availBranches.includes(repoRes.repository.default_branch)) {
          selectedBranch = repoRes.repository.default_branch;
        } else if (availBranches.includes('main')) {
          selectedBranch = 'main';
        } else if (availBranches.includes('gh-pages')) {
          selectedBranch = 'gh-pages';
        } else if (availBranches.length > 0) {
          selectedBranch = availBranches[0];
        } else {
          selectedBranch = repoRes.repository.default_branch || 'main';
        }
      }
      setPagesBranch(selectedBranch);
      setPagesFolder(configRes.pages_folder || '/');
    } catch (err) {
      console.error('Failed to load pages config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await api.updatePagesConfig(owner, repoName, {
        enable_pages: enablePages,
        pages_branch: pagesBranch,
        pages_folder: pagesFolder,
      });
      setRepoData(res.repository);
      setPagesConfig({
        enable_pages: enablePages,
        pages_branch: pagesBranch,
        pages_folder: pagesFolder,
        pages_url: res.pages_url,
        branches,
      });
      setSuccessMessage('ProGit Pages settings saved successfully!');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      alert(err.message || 'Failed to update pages settings');
    } finally {
      setSaving(false);
    }
  };

  const copyPagesURL = () => {
    if (!pagesConfig?.pages_url) return;
    navigator.clipboard.writeText(pagesConfig.pages_url);
    setCopiedURL(true);
    setTimeout(() => setCopiedURL(false), 2000);
  };

  if (loading && !repoData) {
    return (
      <div className="py-20 text-center text-sm text-gray-400">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        Loading Pages Settings...
      </div>
    );
  }

  if (!repoData) {
    return <div className="py-20 text-center text-sm">Repository not found</div>;
  }

  return (
    <div>
      <RepoNav repo={repoData} activeTab="pages" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
            <Globe className="w-5 h-5 mr-2 text-emerald-600 dark:text-emerald-400" />
            ProGit Pages
          </h1>
          <p className="text-xs text-gray-500 dark:text-dark-muted mt-1">
            Host standalone static websites, portfolios, or documentation directly from your repository branches.
          </p>
        </div>

        {/* Live URL status banner */}
        {pagesConfig?.enable_pages && (
          <div className="p-5 rounded-xl border border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">
                  Your ProGit Pages site is active!
                </p>
                <div className="flex items-center space-x-2 mt-1">
                  <a
                    href={pagesConfig.pages_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400 hover:underline break-all"
                  >
                    {pagesConfig.pages_url}
                  </a>
                  <button
                    onClick={copyPagesURL}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text"
                    title="Copy URL"
                  >
                    {copiedURL ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <a
              href={pagesConfig.pages_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 text-xs font-bold rounded-lg text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm transition-colors shrink-0"
            >
              <span>Visit Site</span>
              <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </a>
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center">
            <Check className="w-4 h-4 mr-1.5" />
            {successMessage}
          </div>
        )}

        {/* Configuration Form */}
        <div className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-6">
          <form onSubmit={handleSave} className="space-y-6">
            {/* Enable switch */}
            <div className="flex items-start justify-between pb-6 border-b border-gray-200 dark:border-dark-border">
              <div>
                <label className="text-sm font-bold text-gray-900 dark:text-white block">
                  Enable ProGit Pages
                </label>
                <p className="text-xs text-gray-500 dark:text-dark-muted mt-0.5">
                  Publish static content from a branch in this repository.
                </p>
              </div>
              <input
                type="checkbox"
                checked={enablePages}
                onChange={(e) => setEnablePages(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 mt-1 cursor-pointer"
              />
            </div>

            {enablePages && (
              <div className="space-y-5">
                <h3 className="text-xs font-bold uppercase text-gray-700 dark:text-dark-text tracking-wider">
                  Build and Deployment Source
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Branch selector */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 flex items-center">
                      <GitBranch className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                      Source Branch
                    </label>
                    <select
                      value={pagesBranch}
                      onChange={(e) => setPagesBranch(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {branches.length > 0 ? (
                        branches.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="gh-pages">gh-pages</option>
                          <option value="main">main</option>
                        </>
                      )}
                    </select>
                  </div>

                  {/* Folder selector */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 flex items-center">
                      <Folder className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                      Source Folder
                    </label>
                    <select
                      value={pagesFolder}
                      onChange={(e) => setPagesFolder(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="/">/ (root)</option>
                      <option value="/docs">/docs</option>
                    </select>
                  </div>
                </div>

                <div className="text-xs text-gray-500 dark:text-dark-muted space-y-1 bg-gray-50 dark:bg-dark-hover/30 p-3 rounded-lg border border-gray-200 dark:border-dark-border">
                  <div className="flex items-center space-x-1.5 font-semibold text-gray-700 dark:text-gray-300">
                    <FileCode className="w-4 h-4 text-emerald-600" />
                    <span>Serving Cascade:</span>
                  </div>
                  <p className="pl-5">
                    ProGit Pages checks for <code className="font-mono bg-gray-200 dark:bg-dark-hover px-1 rounded">index.html</code>, then falls back to <code className="font-mono bg-gray-200 dark:bg-dark-hover px-1 rounded">index.md</code> or <code className="font-mono bg-gray-200 dark:bg-dark-hover px-1 rounded">README.md</code> rendered as clean HTML, with custom <code className="font-mono bg-gray-200 dark:bg-dark-hover px-1 rounded">404.html</code> support.
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-gray-200 dark:border-dark-border">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save Pages Configuration'}
              </button>
            </div>
          </form>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <FileCode className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-xs text-gray-900 dark:text-white">Static Assets & Markdown</h3>
            <p className="text-[11px] text-gray-500 dark:text-dark-muted">
              Full support for CSS, JS, SVG, images, and automatic rendering of Markdown documents into styled HTML pages.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-xs text-gray-900 dark:text-white">Permission Enforced</h3>
            <p className="text-[11px] text-gray-500 dark:text-dark-muted">
              Private repository Pages are strictly protected and require logged-in session credentials to view.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-2">
            <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
              <Globe className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-xs text-gray-900 dark:text-white">Instant Deployment</h3>
            <p className="text-[11px] text-gray-500 dark:text-dark-muted">
              Every push to the selected branch updates the hosted site instantly with zero build queue wait times.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

