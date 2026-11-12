import React, { useState, useEffect } from 'react';
import { Repository, RepoResponse, Organization, api } from '../lib/api';
import { useAuth } from '../lib/theme';
import { navigate } from '../lib/router';
import { 
  Code, 
  CircleDot, 
  GitPullRequest, 
  Settings as SettingsIcon, 
  Star, 
  GitFork, 
  Lock, 
  GitBranch, 
  History,
  BookOpen,
  Globe,
  Kanban,
  X,
  AlertCircle,
  Loader2,
  Archive,
  Eye,
  ExternalLink
} from 'lucide-react';

interface RepoNavProps {
  repo: Repository;
  permissions?: RepoResponse['permissions'];
  isStarred?: boolean;
  onToggleStar?: () => void;
  activeTab: 'code' | 'issues' | 'pulls' | 'commits' | 'branches' | 'settings' | 'wiki' | 'pages' | 'projects';
}

export const RepoNav: React.FC<RepoNavProps> = ({ repo, permissions, isStarred, onToggleStar, activeTab }) => {
  const { user } = useAuth();
  const basePath = `/${repo.owner_name}/${repo.name}`;
  const perms = permissions || (repo as any).permissions || api.getCachedRepo(repo.owner_name, repo.name)?.permissions;
  const canAdmin = !!(user && (user.is_admin || user.username === repo.owner_name || perms?.admin));
  const canDownload = perms ? perms.download !== false : true;
  const isViewOnly = Boolean(perms?.view_only || !canDownload);
  const pagesSiteURL = repo.enable_pages
    ? ((repo as any).pages_url || api.getCachedRepo(repo.owner_name, repo.name)?.pages_url || `/pages/${repo.owner_name}/${repo.name}/`)
    : '';

  const [showForkModal, setShowForkModal] = useState(false);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<string>('');
  const [forkName, setForkName] = useState<string>(repo.name);
  const [forking, setForking] = useState(false);
  const [forkError, setForkError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setSelectedOwner(user.username);
      api.listUserOrgs().then(setOrgs).catch(() => {});
    }
  }, [user]);

  const handleForkClick = () => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setForkError(null);
    setForkName(repo.name);
    setShowForkModal(true);
  };

  const handleCreateFork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setForking(true);
    setForkError(null);

    try {
      const isOrg = selectedOwner !== user.username;
      const res = await api.forkRepo(repo.owner_name, repo.name, {
        organization: isOrg ? selectedOwner : undefined,
        name: forkName.trim() || repo.name,
      });

      // Redirect to newly forked repository
      navigate(`/${res.owner_name}/${res.name}`);
    } catch (err: any) {
      setForkError(err.message || 'Failed to fork repository');
      setForking(false);
    }
  };

  return (
    <div className="bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border pt-5 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Title & Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
          <div>
            <div className="flex items-center space-x-2 text-xl font-semibold flex-wrap">
              <a href={`/user/${repo.owner_name}`} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                {repo.owner_name}
              </a>
              <span className="text-gray-400 dark:text-dark-muted">/</span>
              <a href={basePath} className="text-gray-900 dark:text-white hover:underline font-bold">
                {repo.name}
              </a>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-muted ml-2">
                {repo.is_private ? (
                  <>
                    <Lock className="w-3 h-3 mr-1" />
                    Private
                  </>
                ) : (
                  'Public'
                )}
              </span>
              {repo.is_archived && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-800 ml-2">
                  <Archive className="w-3 h-3 mr-1" />
                  Archived
                </span>
              )}
              {isViewOnly && (
                <span
                  title="Code downloads, Raw files, Forking, and Git clone/pull are disabled for your access on this repository"
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-800 ml-2"
                >
                  <Eye className="w-3 h-3 mr-1" />
                  View Only
                </span>
              )}
            </div>

            {repo.is_fork && repo.fork_parent && (
              <div className="text-xs text-gray-500 dark:text-dark-muted flex items-center space-x-1 mt-1">
                <span>forked from</span>
                <a
                  href={`/${repo.fork_parent.owner_name}/${repo.fork_parent.name}`}
                  className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                >
                  {repo.fork_parent.owner_name}/{repo.fork_parent.name}
                </a>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onToggleStar}
              className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-md border shadow-sm transition-colors ${
                isStarred
                  ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400'
                  : 'bg-gray-50 dark:bg-dark-hover border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text hover:bg-gray-100'
              }`}
            >
              <Star className={`w-3.5 h-3.5 mr-1.5 ${isStarred ? 'fill-current' : ''}`} />
              <span>{isStarred ? 'Starred' : 'Star'}</span>
              <span className="ml-2 pl-2 border-l border-gray-300 dark:border-dark-border font-bold">
                {repo.num_stars}
              </span>
            </button>

            {canDownload && (
              <button
                onClick={handleForkClick}
                title="Fork this repository"
                className="inline-flex items-center px-3 py-1 text-xs font-semibold rounded-md border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-hover hover:bg-gray-100 dark:hover:bg-dark-border/60 text-gray-700 dark:text-dark-text shadow-sm transition-colors cursor-pointer"
              >
                <GitFork className="w-3.5 h-3.5 mr-1.5" />
                <span>Fork</span>
                <span className="ml-2 pl-2 border-l border-gray-300 dark:border-dark-border font-bold">
                  {repo.num_forks}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 overflow-x-auto text-sm font-medium border-t border-gray-100 dark:border-dark-border/40 pt-1 -mb-px">
          <a
            href={basePath}
            className={`flex items-center space-x-2 py-3 px-3 border-b-2 font-medium transition-colors whitespace-nowrap ${
              activeTab === 'code'
                ? 'border-emerald-600 text-gray-900 dark:text-white font-semibold'
                : 'border-transparent text-gray-500 dark:text-dark-muted hover:text-gray-700 dark:hover:text-dark-text'
            }`}
          >
            <Code className="w-4 h-4" />
            <span>Code</span>
          </a>

          <a
            href={`${basePath}/issues`}
            className={`flex items-center space-x-2 py-3 px-3 border-b-2 font-medium transition-colors whitespace-nowrap ${
              activeTab === 'issues'
                ? 'border-emerald-600 text-gray-900 dark:text-white font-semibold'
                : 'border-transparent text-gray-500 dark:text-dark-muted hover:text-gray-700 dark:hover:text-dark-text'
            }`}
          >
            <CircleDot className="w-4 h-4" />
            <span>Issues</span>
            {repo.num_issues > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-xs bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-dark-muted">
                {repo.num_issues}
              </span>
            )}
          </a>

          {repo.allow_download_and_pulls !== false && (
            <a
              href={`${basePath}/pulls`}
              className={`flex items-center space-x-2 py-3 px-3 border-b-2 font-medium transition-colors whitespace-nowrap ${
                activeTab === 'pulls'
                  ? 'border-emerald-600 text-gray-900 dark:text-white font-semibold'
                  : 'border-transparent text-gray-500 dark:text-dark-muted hover:text-gray-700 dark:hover:text-dark-text'
              }`}
            >
              <GitPullRequest className="w-4 h-4" />
              <span>Pull Requests</span>
              {repo.num_pulls > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-xs bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-dark-muted">
                  {repo.num_pulls}
                </span>
              )}
            </a>
          )}

          <a
            href={`${basePath}/commits`}
            className={`flex items-center space-x-2 py-3 px-3 border-b-2 font-medium transition-colors whitespace-nowrap ${
              activeTab === 'commits'
                ? 'border-emerald-600 text-gray-900 dark:text-white font-semibold'
                : 'border-transparent text-gray-500 dark:text-dark-muted hover:text-gray-700 dark:hover:text-dark-text'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Commits</span>
          </a>

          <a
            href={`${basePath}/branches`}
            className={`flex items-center space-x-2 py-3 px-3 border-b-2 font-medium transition-colors whitespace-nowrap ${
              activeTab === 'branches'
                ? 'border-emerald-600 text-gray-900 dark:text-white font-semibold'
                : 'border-transparent text-gray-500 dark:text-dark-muted hover:text-gray-700 dark:hover:text-dark-text'
            }`}
          >
            <GitBranch className="w-4 h-4" />
            <span>Branches</span>
          </a>

          <a
            href={`${basePath}/projects`}
            className={`flex items-center space-x-2 py-3 px-3 border-b-2 font-medium transition-colors whitespace-nowrap ${
              activeTab === 'projects'
                ? 'border-emerald-600 text-gray-900 dark:text-white font-semibold'
                : 'border-transparent text-gray-500 dark:text-dark-muted hover:text-gray-700 dark:hover:text-dark-text'
            }`}
          >
            <Kanban className="w-4 h-4" />
            <span>Projects</span>
          </a>

          {repo.enable_wiki !== false && (
            <a
              href={`${basePath}/wiki`}
              className={`flex items-center space-x-2 py-3 px-3 border-b-2 font-medium transition-colors whitespace-nowrap ${
                activeTab === 'wiki'
                  ? 'border-emerald-600 text-gray-900 dark:text-white font-semibold'
                  : 'border-transparent text-gray-500 dark:text-dark-muted hover:text-gray-700 dark:hover:text-dark-text'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Wiki</span>
            </a>
          )}

          {canAdmin ? (
            <a
              href={`${basePath}/pages`}
              className={`flex items-center space-x-2 py-3 px-3 border-b-2 font-medium transition-colors whitespace-nowrap ${
                activeTab === 'pages'
                  ? 'border-emerald-600 text-gray-900 dark:text-white font-semibold'
                  : 'border-transparent text-gray-500 dark:text-dark-muted hover:text-gray-700 dark:hover:text-dark-text'
              }`}
            >
              <Globe className="w-4 h-4" />
              <span>Pages</span>
              {repo.enable_pages && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              )}
            </a>
          ) : repo.enable_pages ? (
            <a
              href={pagesSiteURL}
              target="_blank"
              rel="noopener noreferrer"
              title="Open published ProGit Pages site"
              className="flex items-center space-x-1.5 py-3 px-3 border-b-2 border-transparent text-gray-500 dark:text-dark-muted hover:text-emerald-600 dark:hover:text-emerald-400 font-medium transition-colors whitespace-nowrap"
            >
              <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Pages</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <ExternalLink className="w-3 h-3 opacity-75" />
            </a>
          ) : null}

          {(canAdmin || activeTab === 'settings') && (
            <a
              href={`${basePath}/settings`}
              className={`flex items-center space-x-2 py-3 px-3 border-b-2 font-medium transition-colors whitespace-nowrap ${
                activeTab === 'settings'
                  ? 'border-emerald-600 text-gray-900 dark:text-white font-semibold'
                  : 'border-transparent text-gray-500 dark:text-dark-muted hover:text-gray-700 dark:hover:text-dark-text'
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
              <span>Settings</span>
            </a>
          )}
        </div>
      </div>

      {repo.is_archived && (
        <div className="bg-amber-500/10 border-t border-amber-500/30 px-4 py-2 text-center text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center justify-center space-x-2">
          <Archive className="w-4 h-4 flex-shrink-0" />
          <span>This repository has been archived by the owner. It is now read-only.</span>
        </div>
      )}

      {/* Fork Modal */}
      {showForkModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 dark:bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl max-w-lg w-full shadow-2xl overflow-hidden transition-all">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dark-border">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                  <GitFork className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Create a new fork</h3>
                  <p className="text-xs text-gray-500 dark:text-dark-muted">Fork {repo.owner_name}/{repo.name} to your account</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowForkModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFork} className="p-6 space-y-4">
              {forkError && (
                <div className="flex items-center space-x-2 p-3 text-sm rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{forkError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1.5">
                  Owner & Repository name
                </label>
                <div className="flex items-center space-x-2">
                  <select
                    value={selectedOwner}
                    onChange={(e) => setSelectedOwner(e.target.value)}
                    className="w-1/2 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                  >
                    {user && <option value={user.username}>{user.username}</option>}
                    {orgs.map((org) => (
                      <option key={org.id} value={org.name}>
                        {org.name} (Organization)
                      </option>
                    ))}
                  </select>
                  <span className="text-gray-400 dark:text-dark-muted font-bold text-lg">/</span>
                  <input
                    type="text"
                    value={forkName}
                    onChange={(e) => setForkName(e.target.value)}
                    required
                    placeholder="Repository name"
                    className="w-1/2 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                {selectedOwner === repo.owner_name && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    You cannot fork into the same account that currently owns the repository. Select an organization or different destination.
                  </p>
                )}
              </div>

              <div className="p-3 bg-gray-50 dark:bg-dark-hover rounded-lg text-xs text-gray-500 dark:text-dark-muted space-y-1">
                <p>• A copy of <strong>{repo.owner_name}/{repo.name}</strong> will be created in <strong>{selectedOwner || 'your account'}</strong>.</p>
                <p>• All branches, commits, tags, and commit histories will be preserved.</p>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-gray-200 dark:border-dark-border">
                <button
                  type="button"
                  onClick={() => setShowForkModal(false)}
                  className="px-4 py-2 text-xs font-semibold border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-border/60 transition-colors rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={forking || (selectedOwner === repo.owner_name)}
                  className="inline-flex items-center px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
                >
                  {forking ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Forking...
                    </>
                  ) : (
                    <>
                      <GitFork className="w-3.5 h-3.5 mr-1.5" />
                      Create fork
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

