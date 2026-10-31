import React, { useEffect, useState } from 'react';
import { api, User, Repository } from '../lib/api';
import { User as UserIcon, GitBranch, Star, Mail, MapPin, Globe } from 'lucide-react';

interface UserProfileProps {
  username: string;
}

export const UserProfile: React.FC<UserProfileProps> = ({ username }) => {
  const [profile, setProfile] = useState<User | null>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getUserProfile(username);
        setProfile(data.user);
        setRepos(data.repositories || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [username]);

  if (loading) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading user profile...</div>;
  }

  if (!profile) {
    return <div className="py-20 text-center text-sm">User not found</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Left Column: Avatar & Bio */}
        <div className="space-y-4">
          <div className="w-32 h-32 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-4xl shadow-md ring-4 ring-emerald-500/20">
            {profile.username.charAt(0).toUpperCase()}
          </div>

          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{profile.full_name || profile.username}</h1>
            <p className="text-sm text-gray-500 dark:text-dark-muted font-mono">@{profile.username}</p>
          </div>

          {profile.bio && (
            <p className="text-xs text-gray-700 dark:text-dark-text leading-relaxed">{profile.bio}</p>
          )}

          <div className="space-y-2 text-xs text-gray-600 dark:text-dark-muted pt-2 border-t border-gray-100 dark:border-dark-border">
            <div className="flex items-center space-x-2">
              <Mail className="w-3.5 h-3.5 text-gray-400" />
              <span>{profile.email}</span>
            </div>
            {profile.location && (
              <div className="flex items-center space-x-2">
                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                <span>{profile.location}</span>
              </div>
            )}
            {profile.website && (
              <div className="flex items-center space-x-2">
                <Globe className="w-3.5 h-3.5 text-gray-400" />
                <a href={profile.website} target="_blank" rel="noreferrer" className="text-emerald-600 dark:text-emerald-400 hover:underline">
                  {profile.website}
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Repositories */}
        <div className="md:col-span-3 space-y-6">
          <h2 className="text-base font-bold text-gray-900 dark:text-white border-b border-gray-200 dark:border-dark-border pb-3">
            Repositories ({repos.length})
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {repos.map(r => (
              <div
                key={r.id}
                className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-2 hover:border-emerald-500/50 transition-all"
              >
                <div className="flex items-center justify-between">
                  <a
                    href={`/${r.owner_name}/${r.name}`}
                    className="font-bold text-sm text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1.5"
                  >
                    <GitBranch className="w-4 h-4 flex-shrink-0" />
                    <span>{r.name}</span>
                  </a>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-gray-200 dark:border-dark-border text-gray-500">
                    {r.is_private ? 'Private' : 'Public'}
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-dark-muted line-clamp-2">
                  {r.description || 'No description provided.'}
                </p>
                <div className="flex items-center space-x-3 text-[11px] text-gray-400 pt-2 border-t border-gray-100 dark:border-dark-border">
                  <span className="flex items-center">
                    <Star className="w-3 h-3 mr-0.5 fill-amber-400 text-amber-400" />
                    {r.num_stars}
                  </span>
                  <span>Updated {new Date(r.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

