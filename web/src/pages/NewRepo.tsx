import React, { useEffect, useState } from 'react';
import { api, Organization } from '../lib/api';
import { useAuth } from '../lib/theme';
import { navigate } from '../lib/router';
import { GitBranch, Lock, Globe, AlertCircle, Building2 } from 'lucide-react';

export const NewRepo: React.FC = () => {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [selectedOwner, setSelectedOwner] = useState('');
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [description, setDescription] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [instanceDefaultBranch, setInstanceDefaultBranch] = useState('main');
  const [isPrivate, setIsPrivate] = useState(false);
  const [autoInit, setAutoInit] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setSelectedOwner(user.username);
    }
    const params = new URLSearchParams(window.location.search);
    const initialOwner = params.get('owner');
    if (initialOwner) {
      setSelectedOwner(initialOwner);
    }

    api.getHealth().then((h) => {
      if (h?.default_branch) {
        setInstanceDefaultBranch(h.default_branch);
        setDefaultBranch(prev => (prev === 'main' ? h.default_branch! : prev));
      }
    }).catch(() => {});

    api.listUserOrgs().then((list) => {
      setOrgs(list || []);
      if (initialOwner) {
        setSelectedOwner(initialOwner);
      }
    }).catch(console.error);
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const repo = await api.createRepo({
        name,
        owner: selectedOwner || (user ? user.username : undefined),
        description,
        private: isPrivate,
        auto_init: autoInit,
        default_branch: defaultBranch.trim() || undefined,
      });
      navigate(`/${repo.owner_name}/${repo.name}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create repository');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <div className="border-b border-gray-200 dark:border-dark-border pb-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <GitBranch className="w-6 h-6 mr-2 text-emerald-600 dark:text-emerald-400" />
            Create a new repository
          </h1>
          <p className="text-sm text-gray-500 dark:text-dark-muted mt-1">
            A repository contains all project files, revision history, and collaboration tools.
          </p>
        </div>
        <a
          href="/new/import"
          className="text-xs sm:text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1 shrink-0"
        >
          <span>Import a repository</span>
          <span>&rarr;</span>
        </a>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 text-sm flex items-center space-x-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
            Owner & Repository Name *
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Owner Dropdown */}
            <div className="sm:w-56">
              <select
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

            {/* Repository Name Input */}
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-mono"
              placeholder="my-awesome-project"
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-dark-muted mt-1">
            Choose whether to create under your personal account or an organization you manage.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
            Description (optional)
          </label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            placeholder="Short description of this project"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
            Default Branch
          </label>
          <input
            type="text"
            value={defaultBranch}
            onChange={e => setDefaultBranch(e.target.value)}
            className="w-full sm:w-64 px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-mono"
            placeholder={instanceDefaultBranch}
          />
          <p className="text-xs text-gray-500 dark:text-dark-muted mt-1">
            Initial branch for this repository (instance default: <code className="font-mono">{instanceDefaultBranch}</code>).
          </p>
        </div>

        {/* Visibility */}
        <div className="pt-4 border-t border-gray-200 dark:border-dark-border space-y-3">
          <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text uppercase tracking-wider">
            Repository Visibility
          </label>

          <label className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface cursor-pointer hover:border-emerald-500 transition-colors">
            <input
              type="radio"
              name="visibility"
              checked={!isPrivate}
              onChange={() => setIsPrivate(false)}
              className="mt-1 text-emerald-600 focus:ring-emerald-500"
            />
            <div className="flex-1">
              <div className="flex items-center space-x-1.5 font-semibold text-sm text-gray-900 dark:text-white">
                <Globe className="w-4 h-4 text-emerald-500" />
                <span>Public</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-dark-muted mt-0.5">
                Anyone on the internet can see this repository. You choose who can commit.
              </p>
            </div>
          </label>

          <label className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface cursor-pointer hover:border-emerald-500 transition-colors">
            <input
              type="radio"
              name="visibility"
              checked={isPrivate}
              onChange={() => setIsPrivate(true)}
              className="mt-1 text-emerald-600 focus:ring-emerald-500"
            />
            <div className="flex-1">
              <div className="flex items-center space-x-1.5 font-semibold text-sm text-gray-900 dark:text-white">
                <Lock className="w-4 h-4 text-amber-500" />
                <span>Private</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-dark-muted mt-0.5">
                You choose who can see and commit to this repository.
              </p>
            </div>
          </label>
        </div>

        {/* Initialize with README */}
        <div className="pt-4 border-t border-gray-200 dark:border-dark-border">
          <label className="flex items-center space-x-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoInit}
              onChange={e => setAutoInit(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm font-medium text-gray-800 dark:text-dark-text">
              Initialize this repository with a README
            </span>
          </label>
          <p className="text-xs text-gray-500 dark:text-dark-muted ml-6 mt-0.5">
            Allows you to immediately clone the repository to your computer.
          </p>
        </div>

        <div className="pt-4 border-t border-gray-200 dark:border-dark-border">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-sm shadow-sm transition-colors"
          >
            {loading ? 'Creating repository...' : 'Create repository'}
          </button>
        </div>
      </form>
    </div>
  );
};

