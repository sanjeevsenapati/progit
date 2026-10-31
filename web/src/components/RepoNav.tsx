import React from 'react';
import { Repository } from '../lib/api';
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
  Globe
} from 'lucide-react';

interface RepoNavProps {
  repo: Repository;
  isStarred?: boolean;
  onToggleStar?: () => void;
  activeTab: 'code' | 'issues' | 'pulls' | 'commits' | 'branches' | 'settings' | 'wiki' | 'pages';
}

export const RepoNav: React.FC<RepoNavProps> = ({ repo, isStarred, onToggleStar, activeTab }) => {
  const basePath = `/${repo.owner_name}/${repo.name}`;

  return (
    <div className="bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border pt-5 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Title & Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
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

            <div className="inline-flex items-center px-3 py-1 text-xs font-semibold rounded-md border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-hover text-gray-700 dark:text-dark-text shadow-sm">
              <GitFork className="w-3.5 h-3.5 mr-1.5" />
              <span>Fork</span>
              <span className="ml-2 pl-2 border-l border-gray-300 dark:border-dark-border font-bold">
                {repo.num_forks}
              </span>
            </div>
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
        </div>
      </div>
    </div>
  );
};

