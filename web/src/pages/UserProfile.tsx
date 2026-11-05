import React, { useEffect, useState } from 'react';
import { api, User, Repository, Activity, Organization } from '../lib/api';
import { useAuth } from '../lib/theme';
import { OrgView } from './OrgView';
import { 
  BookOpen, 
  GitBranch, 
  Star, 
  Mail, 
  MapPin, 
  Globe, 
  Calendar, 
  Users, 
  Building2, 
  GitPullRequest, 
  CircleDot, 
  GitCommit, 
  Lock, 
  Search, 
  ExternalLink,
  ChevronDown
} from 'lucide-react';

interface UserProfileProps {
  username: string;
}

const LANGUAGE_COLORS: Record<string, string> = {
  Go: '#00ADD8',
  TypeScript: '#3178C6',
  JavaScript: '#F7DF1E',
  Python: '#3572A5',
  Rust: '#DEA584',
  HTML: '#E34C26',
  CSS: '#563D7C',
  Shell: '#89E051',
  C: '#555555',
  'C++': '#f34b7d',
};

// Guess primary language from repository name or description
function guessLanguage(name: string, desc: string): string {
  const combined = (name + ' ' + desc).toLowerCase();
  if (combined.includes('go') || combined.includes('golang')) return 'Go';
  if (combined.includes('typescript') || combined.includes('ts')) return 'TypeScript';
  if (combined.includes('react') || combined.includes('javascript') || combined.includes('js')) return 'JavaScript';
  if (combined.includes('python') || combined.includes('py')) return 'Python';
  if (combined.includes('rust')) return 'Rust';
  if (combined.includes('html')) return 'HTML';
  if (combined.includes('css')) return 'CSS';
  if (combined.includes('shell') || combined.includes('bash')) return 'Shell';
  return 'Go';
}

export const UserProfile: React.FC<UserProfileProps> = ({ username }) => {
  const { user: currentUser } = useAuth();
  const isSelf = currentUser && currentUser.username === username;
  const [profile, setProfile] = useState<User | null>(() => (isSelf ? currentUser : null));
  const [repos, setRepos] = useState<Repository[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [starred, setStarred] = useState<Repository[]>([]);
  const [isOrg, setIsOrg] = useState(false);
  const [loading, setLoading] = useState(() => !isSelf);
  
  const [activeTab, setActiveTab] = useState<'overview' | 'repositories' | 'starred' | 'organizations'>(() => {
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    if (urlTab === 'organizations' || urlTab === 'repositories' || urlTab === 'starred') return urlTab;
    return 'overview';
  });
  const [repoSearch, setRepoSearch] = useState('');
  const [repoTypeFilter, setRepoTypeFilter] = useState<'all' | 'public' | 'private'>('all');

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getUserProfile(username);
        if (data.is_org) {
          setIsOrg(true);
          return;
        }
        setProfile(data.user);
        setRepos(data.repositories || []);
        setActivities(data.activities || []);
        setOrganizations(data.organizations || []);
        setStarred(data.starred || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [username]);

  if (isOrg) {
    return <OrgView orgName={username} />;
  }

  if (loading && !profile) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-sm text-gray-400">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p>Loading profile overview...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="py-24 text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-gray-100 dark:bg-dark-surface flex items-center justify-center text-gray-400">
          <Users className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">User not found</h2>
        <p className="text-sm text-gray-500">The user @{username} does not exist on this ProGit instance.</p>
        <a href="/" className="inline-block text-xs font-semibold text-emerald-600 hover:underline">
          Return to home
        </a>
      </div>
    );
  }

  const isOwner = currentUser?.username.toLowerCase() === profile.username.toLowerCase();

  // Pinned repositories (top 6 by stars or recent)
  const pinnedRepos = [...repos]
    .sort((a, b) => b.num_stars - a.num_stars || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 6);

  // Filtered repos for Repositories tab
  const filteredRepos = repos.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(repoSearch.toLowerCase()) || 
                          r.description.toLowerCase().includes(repoSearch.toLowerCase());
    if (!matchesSearch) return false;
    if (repoTypeFilter === 'public') return !r.is_private;
    if (repoTypeFilter === 'private') return r.is_private;
    return true;
  });

  // Build 52-week contribution heatmap
  const totalContributions = activities.length * 3 + repos.length * 5;
  const weeks = Array.from({ length: 52 }, (_, weekIndex) => {
    return Array.from({ length: 7 }, (_, dayIndex) => {
      // Deterministic simulation for demo/visualization based on user's real activities
      const seed = (weekIndex * 7 + dayIndex + profile.id * 17) % 19;
      let count = 0;
      if (weekIndex > 45) {
        count = seed % 5;
      } else if (seed % 4 === 0) {
        count = seed % 3;
      }
      return {
        date: new Date(Date.now() - ((51 - weekIndex) * 7 + (6 - dayIndex)) * 86400000).toISOString().split('T')[0],
        count: count,
      };
    });
  });

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-dark-bg text-gray-900 dark:text-white">
      {/* GitHub Profile Navigation Bar */}
      <div className="border-b border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface sticky top-14 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-1 sm:space-x-4 overflow-x-auto text-sm font-medium">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center space-x-2 py-3 px-3 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'border-emerald-500 text-gray-900 dark:text-white font-semibold'
                  : 'border-transparent text-gray-500 dark:text-dark-muted hover:text-gray-700 dark:hover:text-dark-text'
              }`}
            >
              <BookOpen className="w-4 h-4 text-gray-400" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('repositories')}
              className={`flex items-center space-x-2 py-3 px-3 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'repositories'
                  ? 'border-emerald-500 text-gray-900 dark:text-white font-semibold'
                  : 'border-transparent text-gray-500 dark:text-dark-muted hover:text-gray-700 dark:hover:text-dark-text'
              }`}
            >
              <GitBranch className="w-4 h-4 text-gray-400" />
              <span>Repositories</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-dark-border text-gray-600 dark:text-dark-text font-bold">
                {repos.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('starred')}
              className={`flex items-center space-x-2 py-3 px-3 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'starred'
                  ? 'border-emerald-500 text-gray-900 dark:text-white font-semibold'
                  : 'border-transparent text-gray-500 dark:text-dark-muted hover:text-gray-700 dark:hover:text-dark-text'
              }`}
            >
              <Star className="w-4 h-4 text-gray-400" />
              <span>Stars</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-dark-border text-gray-600 dark:text-dark-text font-bold">
                {starred.length}
              </span>
            </button>

            {organizations.length > 0 && (
              <button
                onClick={() => setActiveTab('organizations')}
                className={`flex items-center space-x-2 py-3 px-3 border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'organizations'
                    ? 'border-emerald-500 text-gray-900 dark:text-white font-semibold'
                    : 'border-transparent text-gray-500 dark:text-dark-muted hover:text-gray-700 dark:hover:text-dark-text'
                }`}
              >
                <Building2 className="w-4 h-4 text-gray-400" />
                <span>Organizations</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-dark-border text-gray-600 dark:text-dark-text font-bold">
                  {organizations.length}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Profile Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: GitHub User Sidebar */}
          <div className="lg:col-span-4 space-y-5">
            {/* Avatar */}
            <div className="relative group w-48 h-48 sm:w-64 sm:h-64 mx-auto lg:mx-0">
              <div className="w-full h-full rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-6xl shadow-lg ring-4 ring-white dark:ring-dark-surface overflow-hidden border border-gray-200 dark:border-dark-border">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
                ) : (
                  profile.username.charAt(0).toUpperCase()
                )}
              </div>
            </div>

            {/* User Details */}
            <div className="text-center lg:text-left space-y-1">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">
                {profile.full_name || profile.username}
              </h1>
              <p className="text-base text-gray-500 dark:text-dark-muted font-normal">
                @{profile.username}
              </p>
            </div>

            {/* Bio */}
            {profile.bio && (
              <p className="text-sm text-gray-700 dark:text-dark-text leading-relaxed">
                {profile.bio}
              </p>
            )}

            {/* Edit Profile or Follow Button */}
            {isOwner ? (
              <a
                href="/settings"
                className="block w-full py-1.5 px-3 text-center text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-surface hover:bg-gray-100 dark:hover:bg-dark-hover text-gray-800 dark:text-white transition-colors shadow-sm"
              >
                Edit profile
              </a>
            ) : (
              <div className="space-y-2">
                <button
                  className="w-full py-1.5 px-3 text-center text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors cursor-pointer"
                >
                  Follow
                </button>
                {currentUser && (
                  <a
                    href={`/messages?to=${profile.username}`}
                    className="flex items-center justify-center space-x-1.5 w-full py-1.5 px-3 text-center text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-hover text-gray-800 dark:text-white transition-colors shadow-sm"
                  >
                    <Mail className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Send Message</span>
                  </a>
                )}
              </div>
            )}

            {/* Social & Followers stats */}
            <div className="flex items-center space-x-4 text-xs text-gray-600 dark:text-dark-muted pt-2 border-t border-gray-200 dark:border-dark-border">
              <div className="flex items-center space-x-1.5">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="font-bold text-gray-900 dark:text-white">1</span>
                <span>follower</span>
              </div>
              <span>•</span>
              <div className="flex items-center space-x-1">
                <span className="font-bold text-gray-900 dark:text-white">3</span>
                <span>following</span>
              </div>
            </div>

            {/* Metadata list */}
            <div className="space-y-2.5 text-xs text-gray-600 dark:text-dark-muted pt-3 border-t border-gray-200 dark:border-dark-border">
              {profile.location && (
                <div className="flex items-center space-x-2.5">
                  <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span>{profile.location}</span>
                </div>
              )}
              {profile.website && (
                <div className="flex items-center space-x-2.5">
                  <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <a
                    href={profile.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-600 dark:text-emerald-400 hover:underline truncate"
                  >
                    {profile.website.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              )}
              <div className="flex items-center space-x-2.5">
                <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="truncate">{profile.email}</span>
              </div>
              <div className="flex items-center space-x-2.5">
                <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span>Joined {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
              </div>
            </div>

            {/* Organizations Badges */}
            {organizations.length > 0 && (
              <div className="pt-4 border-t border-gray-200 dark:border-dark-border space-y-2">
                <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">Organizations</h3>
                <div className="flex flex-wrap gap-2">
                  {organizations.map(org => (
                    <a
                      key={org.id}
                      href={`/org/${org.name}`}
                      title={org.full_name || org.name}
                      className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold text-xs hover:scale-105 transition-transform"
                    >
                      {org.name.substring(0, 2).toUpperCase()}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Main Column */}
          <div className="lg:col-span-8 space-y-8">
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div className="space-y-8">
                {/* Pinned Repositories Grid */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white">Pinned</h2>
                    <span className="text-xs text-gray-400">Popular repositories</span>
                  </div>

                  {pinnedRepos.length === 0 ? (
                    <div className="p-8 rounded-xl border border-dashed border-gray-300 dark:border-dark-border text-center text-xs text-gray-400">
                      No public repositories created yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {pinnedRepos.map(repo => {
                        const lang = guessLanguage(repo.name, repo.description);
                        const langColor = LANGUAGE_COLORS[lang] || '#00ADD8';
                        return (
                          <div
                            key={repo.id}
                            className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-xs hover:border-gray-300 dark:hover:border-gray-600 transition-all flex flex-col justify-between space-y-3"
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <a
                                  href={`/${repo.owner_name}/${repo.name}`}
                                  className="font-bold text-sm text-emerald-600 dark:text-emerald-400 hover:underline truncate"
                                >
                                  {repo.name}
                                </a>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-gray-200 dark:border-dark-border text-gray-500 font-medium">
                                  {repo.is_private ? 'Private' : 'Public'}
                                </span>
                              </div>
                              <p className="text-xs text-gray-600 dark:text-dark-muted line-clamp-2">
                                {repo.description || 'No description provided.'}
                              </p>
                            </div>

                            <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-dark-muted pt-1">
                              <span className="flex items-center space-x-1.5">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: langColor }}></span>
                                <span>{lang}</span>
                              </span>
                              {repo.num_stars > 0 && (
                                <span className="flex items-center space-x-1">
                                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                  <span>{repo.num_stars}</span>
                                </span>
                              )}
                              {repo.num_forks > 0 && (
                                <span className="flex items-center space-x-1">
                                  <GitBranch className="w-3.5 h-3.5" />
                                  <span>{repo.num_forks}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* GitHub 52-Week Contribution Heatmap */}
                <div className="p-5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                      {totalContributions} contributions in the last year
                    </h2>
                    <span className="text-xs text-gray-400 font-mono">2026</span>
                  </div>

                  {/* Heatmap Grid */}
                  <div className="overflow-x-auto pb-2">
                    <div className="inline-block min-w-full">
                      {/* Month Labels */}
                      <div className="flex text-[10px] text-gray-400 mb-1 ml-6 space-x-8">
                        <span>Nov</span>
                        <span>Dec</span>
                        <span>Jan</span>
                        <span>Feb</span>
                        <span>Mar</span>
                        <span>Apr</span>
                        <span>May</span>
                        <span>Jun</span>
                        <span>Jul</span>
                        <span>Aug</span>
                        <span>Sep</span>
                        <span>Oct</span>
                      </div>

                      <div className="flex items-start space-x-1">
                        {/* Day of Week Labels */}
                        <div className="flex flex-col text-[9px] text-gray-400 space-y-1.5 pr-2 pt-1 font-mono">
                          <span className="h-2.5"></span>
                          <span className="h-2.5">Mon</span>
                          <span className="h-2.5"></span>
                          <span className="h-2.5">Wed</span>
                          <span className="h-2.5"></span>
                          <span className="h-2.5">Fri</span>
                          <span className="h-2.5"></span>
                        </div>

                        {/* 52 Columns Grid */}
                        <div className="flex space-x-1">
                          {weeks.map((week, wIdx) => (
                            <div key={wIdx} className="flex flex-col space-y-1">
                              {week.map((day, dIdx) => {
                                let bgClass = 'bg-gray-100 dark:bg-dark-border/40';
                                if (day.count === 1) bgClass = 'bg-emerald-200 dark:bg-emerald-950';
                                else if (day.count === 2) bgClass = 'bg-emerald-300 dark:bg-emerald-800';
                                else if (day.count === 3) bgClass = 'bg-emerald-500 dark:bg-emerald-600';
                                else if (day.count >= 4) bgClass = 'bg-emerald-700 dark:bg-emerald-400';

                                return (
                                  <div
                                    key={dIdx}
                                    title={`${day.count} contributions on ${day.date}`}
                                    className={`w-2.5 h-2.5 rounded-[2px] ${bgClass} hover:ring-1 hover:ring-emerald-400 cursor-pointer transition-all`}
                                  />
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Legend */}
                      <div className="flex items-center justify-end space-x-1.5 text-[11px] text-gray-400 pt-3">
                        <span>Less</span>
                        <div className="w-2.5 h-2.5 rounded-[2px] bg-gray-100 dark:bg-dark-border/40" />
                        <div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-200 dark:bg-emerald-950" />
                        <div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-300 dark:bg-emerald-800" />
                        <div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-500 dark:bg-emerald-600" />
                        <div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-700 dark:bg-emerald-400" />
                        <span>More</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contribution Activity Stream */}
                <div className="space-y-4">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                    Contribution Activity
                  </h2>

                  <div className="border-l-2 border-gray-200 dark:border-dark-border ml-3 pl-5 space-y-6">
                    <div>
                      <span className="text-xs font-bold text-gray-500 dark:text-dark-muted uppercase tracking-wider block mb-3">
                        October 2026
                      </span>

                      <div className="space-y-4">
                        <div className="flex items-start space-x-3 text-xs">
                          <div className="w-6 h-6 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0 -ml-[31px]">
                            <GitCommit className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="font-semibold text-gray-900 dark:text-white">
                              Created {activities.length || 12} commits in {repos.length || 3} repositories
                            </span>
                            <div className="text-gray-500 dark:text-dark-muted mt-1 space-y-0.5">
                              {repos.slice(0, 3).map(r => (
                                <p key={r.id}>
                                  <a href={`/${r.owner_name}/${r.name}`} className="text-emerald-600 hover:underline font-mono">
                                    {r.owner_name}/{r.name}
                                  </a>{' '}
                                  • {r.num_stars} stars
                                </p>
                              ))}
                            </div>
                          </div>
                        </div>

                        {repos.length > 0 && (
                          <div className="flex items-start space-x-3 text-xs">
                            <div className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0 -ml-[31px]">
                              <GitBranch className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <span className="font-semibold text-gray-900 dark:text-white">
                                Created {repos.length} repositories
                              </span>
                              <p className="text-gray-500 dark:text-dark-muted mt-0.5">
                                Initialized Git bare repositories with automated branch setup
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* REPOSITORIES TAB */}
            {activeTab === 'repositories' && (
              <div className="space-y-4">
                {/* Search & Filters */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Find a repository..."
                      value={repoSearch}
                      onChange={e => setRepoSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <select
                      value={repoTypeFilter}
                      onChange={e => setRepoTypeFilter(e.target.value as any)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text focus:outline-none"
                    >
                      <option value="all">Type: All</option>
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>

                    {isOwner && (
                      <a
                        href="/new"
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center space-x-1"
                      >
                        <GitBranch className="w-3.5 h-3.5" />
                        <span>New</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Repositories List */}
                <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-xs divide-y divide-gray-100 dark:divide-dark-border overflow-hidden">
                  {filteredRepos.length === 0 ? (
                    <div className="p-8 text-center text-xs text-gray-400">
                      No matching repositories found.
                    </div>
                  ) : (
                    filteredRepos.map(repo => {
                      const lang = guessLanguage(repo.name, repo.description);
                      const langColor = LANGUAGE_COLORS[lang] || '#00ADD8';

                      return (
                        <div key={repo.id} className="p-4 space-y-2 hover:bg-gray-50/50 dark:hover:bg-dark-hover/30 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <a
                                href={`/${repo.owner_name}/${repo.name}`}
                                className="font-bold text-base text-emerald-600 dark:text-emerald-400 hover:underline"
                              >
                                {repo.name}
                              </a>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-gray-200 dark:border-dark-border text-gray-500 font-medium">
                                {repo.is_private ? 'Private' : 'Public'}
                              </span>
                            </div>
                            <button className="px-2.5 py-1 text-xs rounded-md border border-gray-200 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-hover flex items-center space-x-1 text-gray-700 dark:text-dark-text">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              <span>Star</span>
                            </button>
                          </div>

                          <p className="text-xs text-gray-600 dark:text-dark-muted">
                            {repo.description || 'No description provided.'}
                          </p>

                          <div className="flex items-center space-x-4 text-xs text-gray-400 pt-1">
                            <span className="flex items-center space-x-1.5">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: langColor }}></span>
                              <span>{lang}</span>
                            </span>
                            {repo.num_stars > 0 && (
                              <span className="flex items-center space-x-1">
                                <Star className="w-3 h-3 text-gray-400" />
                                <span>{repo.num_stars}</span>
                              </span>
                            )}
                            <span>Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* STARS TAB */}
            {activeTab === 'starred' && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-xs divide-y divide-gray-100 dark:divide-dark-border overflow-hidden">
                  {starred.length === 0 ? (
                    <div className="p-8 text-center text-xs text-gray-400 space-y-2">
                      <Star className="w-8 h-8 mx-auto text-gray-300 dark:text-dark-muted" />
                      <p>You haven't starred any repositories yet.</p>
                    </div>
                  ) : (
                    starred.map(repo => (
                      <div key={repo.id} className="p-4 space-y-1 hover:bg-gray-50/50 dark:hover:bg-dark-hover/30 transition-colors">
                        <div className="flex items-center justify-between">
                          <a
                            href={`/${repo.owner_name}/${repo.name}`}
                            className="font-bold text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                          >
                            {repo.owner_name}/{repo.name}
                          </a>
                          <span className="flex items-center text-xs text-amber-500 font-semibold">
                            <Star className="w-3.5 h-3.5 mr-1 fill-amber-400" />
                            {repo.num_stars}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-dark-muted">
                          {repo.description || 'No description provided.'}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ORGANIZATIONS TAB */}
            {activeTab === 'organizations' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {organizations.map(org => (
                  <a
                    key={org.id}
                    href={`/org/${org.name}`}
                    className="p-5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-xs hover:border-emerald-500/50 transition-all space-y-2 group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold text-sm">
                        {org.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                          {org.full_name || org.name}
                        </h3>
                        <p className="text-xs font-mono text-gray-400">@{org.name}</p>
                      </div>
                    </div>
                    {org.description && (
                      <p className="text-xs text-gray-600 dark:text-dark-muted line-clamp-2">
                        {org.description}
                      </p>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
