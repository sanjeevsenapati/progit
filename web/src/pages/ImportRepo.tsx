import React, { useEffect, useState } from 'react';
import { api, Organization } from '../lib/api';
import { useAuth } from '../lib/theme';
import { navigate } from '../lib/router';
import { 
  DownloadCloud, 
  GitBranch, 
  Lock, 
  Globe, 
  AlertCircle, 
  Key, 
  Info, 
  Loader2, 
  Check, 
  ShieldAlert,
  ArrowRight
} from 'lucide-react';

export const ImportRepo: React.FC = () => {
  const { user } = useAuth();
  const [cloneUrl, setCloneUrl] = useState('');
  const [name, setName] = useState('');
  const [selectedOwner, setSelectedOwner] = useState('');
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [userEditedName, setUserEditedName] = useState(false);

  useEffect(() => {
    if (user) {
      setSelectedOwner(user.username);
    }
    const params = new URLSearchParams(window.location.search);
    const initialCloneUrl = params.get('clone_url') || '';
    const initialOwner = params.get('owner') || '';
    const initialName = params.get('name') || '';

    if (initialCloneUrl) {
      setCloneUrl(initialCloneUrl);
    }
    if (initialName) {
      setName(initialName);
      setUserEditedName(true);
    }

    api.listUserOrgs().then((list) => {
      setOrgs(list || []);
      if (initialOwner) {
        setSelectedOwner(initialOwner);
      }
    }).catch(console.error);
  }, [user]);

  const handleCloneUrlChange = (value: string) => {
    setCloneUrl(value);
    if (!userEditedName) {
      const trimmed = value.trim().replace(/\/+$/, '');
      const parts = trimmed.split(/[/:]/);
      if (parts.length > 0) {
        let repoPart = parts[parts.length - 1];
        repoPart = repoPart.replace(/\.git$/, '');
        if (repoPart && /^[a-zA-Z0-9_\.\-]+$/.test(repoPart)) {
          setName(repoPart);
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!cloneUrl.trim()) {
      setError('Please provide a remote clone URL.');
      return;
    }

    if (!name.trim()) {
      setError('Please provide a repository name.');
      return;
    }

    setLoading(true);

    try {
      const repo = await api.importRepo({
        clone_url: cloneUrl.trim(),
        owner: selectedOwner || (user ? user.username : undefined),
        name: name.trim(),
        description: description.trim(),
        private: isPrivate,
        auth_username: requiresAuth ? authUsername.trim() : undefined,
        auth_password: requiresAuth ? authPassword.trim() : undefined,
      });

      navigate(`/${repo.owner_name}/${repo.name}`);
    } catch (err: any) {
      setError(err.message || 'Failed to import repository. Please check your URL and credentials.');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <div className="border-b border-gray-200 dark:border-dark-border pb-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <DownloadCloud className="w-6 h-6 mr-2.5 text-emerald-600 dark:text-emerald-400" />
            Import your project to ProGit
          </h1>
          <p className="text-sm text-gray-500 dark:text-dark-muted mt-1">
            Clone an existing Git repository from GitHub, GitLab, Bitbucket, or any Git remote URL.
          </p>
        </div>
        <a
          href="/new"
          className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1 shrink-0"
        >
          <span>Create blank repository instead</span>
          <span>&rarr;</span>
        </a>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 text-sm flex items-start space-x-2.5">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Import Error</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="mb-6 p-5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-sm space-y-3">
          <div className="flex items-center space-x-3">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <div className="font-semibold">
              Importing repository in progress...
            </div>
          </div>
          <p className="text-xs text-emerald-700 dark:text-emerald-300 pl-8">
            ProGit is cloning the remote repository, branches, commits, and tags. This might take a few moments depending on the repository size.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Remote Clone URL */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
            Your old repository's clone URL *
          </label>
          <input
            type="text"
            required
            disabled={loading}
            placeholder="https://github.com/octocat/Hello-World.git"
            value={cloneUrl}
            onChange={(e) => handleCloneUrlChange(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border text-sm text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
          />
          <p className="text-xs text-gray-500 dark:text-dark-muted mt-1.5 flex items-center space-x-1">
            <Info className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span>Enter the HTTP, HTTPS, or Git clone URL of the repository you want to import.</span>
          </p>
        </div>

        {/* Authentication Options (for private source repos) */}
        <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50/60 dark:bg-dark-hover/20 space-y-3">
          <label className="flex items-center space-x-2.5 cursor-pointer">
            <input
              type="checkbox"
              disabled={loading}
              checked={requiresAuth}
              onChange={(e) => setRequiresAuth(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
            />
            <span className="text-sm font-semibold text-gray-800 dark:text-dark-text flex items-center space-x-1.5">
              <Key className="w-4 h-4 text-amber-500" />
              <span>This repository requires authentication to clone (private repository)</span>
            </span>
          </label>

          {requiresAuth && (
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-gray-200 dark:border-dark-border/60">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1">
                  Username (optional)
                </label>
                <input
                  type="text"
                  disabled={loading}
                  placeholder="e.g. octocat or personal-token"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border text-xs text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1">
                  Password / Personal Access Token *
                </label>
                <input
                  type="password"
                  disabled={loading}
                  placeholder="Personal access token or password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border text-xs text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <p className="sm:col-span-2 text-xs text-gray-500 dark:text-dark-muted">
                Tip: For GitHub, GitLab, or Bitbucket, provide a Personal Access Token with read repository permissions. Credentials are never stored.
              </p>
            </div>
          )}
        </div>

        {/* Target Owner & Repository Name */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
            Owner & Repository Name *
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="sm:w-56">
              <select
                disabled={loading}
                value={selectedOwner}
                onChange={(e) => setSelectedOwner(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border text-sm font-semibold text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {user && <option value={user.username}>{user.username} (personal)</option>}
                {orgs.map((o) => (
                  <option key={o.id} value={o.name}>
                    {o.name} (organization)
                  </option>
                ))}
              </select>
            </div>

            <span className="hidden sm:inline text-gray-400 dark:text-dark-muted font-bold text-base">/</span>

            <input
              type="text"
              required
              disabled={loading}
              placeholder="repository-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setUserEditedName(true);
              }}
              className="flex-1 px-3 py-2 rounded-lg bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border text-sm font-semibold text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-dark-muted mt-1.5">
            Target repository path in ProGit.
          </p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
            Description <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            disabled={loading}
            placeholder="Short description of this repository"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Privacy */}
        <div className="space-y-3 pt-2">
          <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text uppercase tracking-wider">
            Privacy
          </label>

          <label className={`flex items-start space-x-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
            !isPrivate 
              ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20' 
              : 'border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover'
          }`}>
            <input
              type="radio"
              name="privacy"
              disabled={loading}
              checked={!isPrivate}
              onChange={() => setIsPrivate(false)}
              className="mt-1 text-emerald-600 focus:ring-emerald-500"
            />
            <div>
              <div className="flex items-center space-x-1.5 font-bold text-sm text-gray-900 dark:text-white">
                <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Public</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-dark-muted mt-0.5">
                Anyone on the internet can see this repository. You choose who can commit.
              </p>
            </div>
          </label>

          <label className={`flex items-start space-x-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
            isPrivate 
              ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20' 
              : 'border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover'
          }`}>
            <input
              type="radio"
              name="privacy"
              disabled={loading}
              checked={isPrivate}
              onChange={() => setIsPrivate(true)}
              className="mt-1 text-emerald-600 focus:ring-emerald-500"
            />
            <div>
              <div className="flex items-center space-x-1.5 font-bold text-sm text-gray-900 dark:text-white">
                <Lock className="w-4 h-4 text-amber-500" />
                <span>Private</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-dark-muted mt-0.5">
                You choose who can see and commit to this repository.
              </p>
            </div>
          </label>
        </div>

        {/* Submit */}
        <div className="pt-4 border-t border-gray-200 dark:border-dark-border flex items-center justify-between">
          <a
            href="/dashboard"
            className="text-xs font-semibold text-gray-500 hover:text-gray-800 dark:hover:text-white"
          >
            Cancel
          </a>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md hover:shadow-lg disabled:opacity-50 transition-all flex items-center space-x-2 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Importing repository...</span>
              </>
            ) : (
              <>
                <DownloadCloud className="w-4 h-4" />
                <span>Begin import</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
