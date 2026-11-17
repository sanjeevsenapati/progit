import React, { useEffect, useState } from 'react';
import { api, Organization, OrgMember, Team, Repository } from '../lib/api';
import { showToast, showModalConfirm } from '../components/ModalDialog';
import { 
  Building2, 
  BookOpen, 
  Users, 
  Shield, 
  MapPin, 
  Globe, 
  Plus, 
  Lock, 
  Star, 
  GitFork, 
  Trash2, 
  UserPlus, 
  Settings, 
  Edit3,
  Check, 
  X 
} from 'lucide-react';

interface OrgViewProps {
  orgName: string;
}

export const OrgView: React.FC<OrgViewProps> = ({ orgName }) => {
  const [org, setOrg] = useState<Organization | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTab, setActiveTab] = useState<'repos' | 'members' | 'teams' | 'settings'>('repos');
  const [loading, setLoading] = useState(true);

  // Edit organization state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [savingOrg, setSavingOrg] = useState(false);

  // Add member modal
  const [newMemberUser, setNewMemberUser] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('member');
  const [addingMember, setAddingMember] = useState(false);
  const [memberMsg, setMemberMsg] = useState('');

  // Add team modal
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [teamPerm, setTeamPerm] = useState('write');
  const [creatingTeam, setCreatingTeam] = useState(false);

  useEffect(() => {
    loadOrgData();
  }, [orgName]);

  const loadOrgData = async () => {
    try {
      setLoading(true);
      const res = await api.getOrg(orgName);
      setOrg(res.organization);
      setIsMember(res.is_member);
      setIsAdmin(res.is_admin);

      if (res.organization) {
        setEditFullName(res.organization.full_name || '');
        setEditDesc(res.organization.description || '');
        setEditLocation(res.organization.location || '');
        setEditWebsite(res.organization.website || '');
        setEditAvatarUrl(res.organization.avatar_url || '');
      }

      const [rList, mList, tList] = await Promise.all([
        api.listOrgRepos(orgName),
        api.listOrgMembers(orgName),
        api.listOrgTeams(orgName),
      ]);
      setRepos(rList || []);
      setMembers(mList || []);
      setTeams(tList || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingOrg(true);
      const res = await api.updateOrg(orgName, {
        full_name: editFullName.trim(),
        description: editDesc.trim(),
        location: editLocation.trim(),
        website: editWebsite.trim(),
        avatar_url: editAvatarUrl.trim(),
      });
      setOrg(res.organization);
      setShowEditModal(false);
      showToast('Organization profile updated successfully', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update organization', 'error');
    } finally {
      setSavingOrg(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberUser.trim()) return;

    try {
      setAddingMember(true);
      setMemberMsg('');
      await api.addOrgMember(orgName, newMemberUser.trim(), newMemberRole);
      setMemberMsg(`Added @${newMemberUser} to organization`);
      showToast(`Added @${newMemberUser} to organization`, 'success');
      setNewMemberUser('');
      const mList = await api.listOrgMembers(orgName);
      setMembers(mList || []);
      setTimeout(() => setMemberMsg(''), 4000);
    } catch (err: any) {
      showToast(err.message || 'Failed to add member', 'error');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (username: string) => {
    const confirmed = await showModalConfirm({
      title: 'Remove Member',
      message: `Are you sure you want to remove @${username} from ${orgName}?`,
      confirmText: 'Remove member',
      cancelText: 'Cancel',
      isDanger: true,
    });
    if (!confirmed) return;

    try {
      await api.removeOrgMember(orgName, username);
      setMembers((prev) => prev.filter((m) => m.username !== username));
      showToast(`Removed @${username} from organization`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to remove member', 'error');
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;

    try {
      setCreatingTeam(true);
      const t = await api.createOrgTeam(orgName, {
        name: teamName.trim(),
        description: teamDesc.trim(),
        permission: teamPerm,
      });
      setTeams((prev) => [...prev, t]);
      setShowTeamModal(false);
      setTeamName('');
      setTeamDesc('');
      showToast(`Team "${t.name}" created successfully`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to create team', 'error');
    } finally {
      setCreatingTeam(false);
    }
  };

  if (loading && !org) {
    return (
      <div className="py-20 text-center text-sm text-gray-400">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        Loading organization...
      </div>
    );
  }

  if (!org) {
    return <div className="py-20 text-center text-sm">Organization not found</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg">
      {/* Org Header */}
      <div className="bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border pt-8 pb-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-600 flex items-center justify-center text-white font-extrabold text-2xl shadow-md flex-shrink-0">
                {org.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {org.full_name || org.name}
                </h1>
                <p className="text-xs font-mono text-gray-500 dark:text-dark-muted">
                  @{org.name}
                </p>
                {org.description && (
                  <p className="text-xs text-gray-700 dark:text-dark-text mt-1 max-w-xl">
                    {org.description}
                  </p>
                )}
                <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-dark-muted mt-2">
                  {org.location && (
                    <span className="flex items-center space-x-1">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{org.location}</span>
                    </span>
                  )}
                  {org.website && (
                    <a
                      href={org.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-1 text-emerald-600 hover:underline"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>{org.website.replace(/^https?:\/\//, '')}</span>
                    </a>
                  )}
                </div>
              </div>
            </div>

            {isAdmin && (
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditFullName(org.full_name || '');
                    setEditDesc(org.description || '');
                    setEditLocation(org.location || '');
                    setEditWebsite(org.website || '');
                    setEditAvatarUrl(org.avatar_url || '');
                    setShowEditModal(true);
                  }}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover hover:bg-gray-50 dark:hover:bg-dark-border/60 text-gray-700 dark:text-dark-text font-semibold text-xs shadow-xs transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5 text-gray-500 dark:text-dark-muted" />
                  <span>Edit Organization</span>
                </button>
                <a
                  href={`/new?owner=${org.name}`}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Repository</span>
                </a>
              </div>
            )}
          </div>

          {/* Org Tabs */}
          <div className="flex space-x-2 border-t border-gray-100 dark:border-dark-border/40 pt-2 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('repos')}
              className={`flex items-center space-x-1.5 py-2 px-3 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'repos'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold'
                  : 'text-gray-600 dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-dark-hover'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Repositories</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-gray-200 dark:bg-dark-hover text-gray-700 dark:text-dark-muted">
                {repos.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('members')}
              className={`flex items-center space-x-1.5 py-2 px-3 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'members'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold'
                  : 'text-gray-600 dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-dark-hover'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>People</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-gray-200 dark:bg-dark-hover text-gray-700 dark:text-dark-muted">
                {members.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('teams')}
              className={`flex items-center space-x-1.5 py-2 px-3 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'teams'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold'
                  : 'text-gray-600 dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-dark-hover'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Teams</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-gray-200 dark:bg-dark-hover text-gray-700 dark:text-dark-muted">
                {teams.length}
              </span>
            </button>

            {isAdmin && (
              <button
                onClick={() => setActiveTab('settings')}
                className={`flex items-center space-x-1.5 py-2 px-3 rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'settings'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold'
                    : 'text-gray-600 dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-dark-hover'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Repositories Tab */}
        {activeTab === 'repos' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                Repositories ({repos.length})
              </h2>
              {isAdmin && (
                <a
                  href={`/new?owner=${org.name}`}
                  className="inline-flex items-center space-x-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create repository in @{org.name}</span>
                </a>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {repos.length === 0 ? (
                <div className="col-span-2 p-12 text-center bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border text-xs text-gray-400">
                  This organization doesn't have any repositories yet.
                </div>
              ) : (
                repos.map((r) => (
                  <div
                    key={r.id}
                    className="p-5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-xs hover:border-emerald-500/50 transition-colors flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <BookOpen className="w-4 h-4 text-gray-400" />
                        <a
                          href={`/${r.owner_name}/${r.name}`}
                          className="font-bold text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                        >
                          {r.name}
                        </a>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold border border-gray-200 dark:border-dark-border text-gray-500">
                          {r.is_private ? 'Private' : 'Public'}
                        </span>
                      </div>
                      {r.description && (
                        <p className="text-xs text-gray-600 dark:text-dark-muted mt-2 line-clamp-2">
                          {r.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center space-x-4 text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100 dark:border-dark-border/40">
                      <span className="flex items-center space-x-1">
                        <Star className="w-3.5 h-3.5" />
                        <span>{r.num_stars}</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <GitFork className="w-3.5 h-3.5" />
                        <span>{r.num_forks}</span>
                      </span>
                      <span>Updated {new Date(r.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Members Tab */}
        {activeTab === 'members' && (
          <div className="space-y-6">
            {isAdmin && (
              <div className="p-5 bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-xs space-y-3">
                <h3 className="font-bold text-xs text-gray-900 dark:text-white flex items-center space-x-1.5">
                  <UserPlus className="w-4 h-4 text-emerald-600" />
                  <span>Invite member to @{org.name}</span>
                </h3>

                {memberMsg && (
                  <div className="p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center">
                    <Check className="w-4 h-4 mr-1.5 flex-shrink-0" />
                    {memberMsg}
                  </div>
                )}

                <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row items-center gap-2">
                  <input
                    type="text"
                    required
                    value={newMemberUser}
                    onChange={(e) => setNewMemberUser(e.target.value)}
                    placeholder="Enter existing username..."
                    className="w-full sm:flex-1 px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <select
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value)}
                    className="w-full sm:w-44 px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Administrator</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button
                    type="submit"
                    disabled={addingMember}
                    className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50 whitespace-nowrap"
                  >
                    <span>{addingMember ? 'Adding...' : 'Add Member'}</span>
                  </button>
                </form>
              </div>
            )}

            <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border/40 shadow-xs overflow-hidden">
              {members.map((m) => (
                <div key={m.user_id} className="p-4 flex items-center justify-between text-xs hover:bg-gray-50 dark:hover:bg-dark-hover/30">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs">
                      {m.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <a href={`/user/${m.username}`} className="font-bold text-gray-900 dark:text-white hover:underline">
                        @{m.username}
                      </a>
                      {m.full_name && <p className="text-gray-400 text-[11px]">{m.full_name}</p>}
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                      m.role === 'owner'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
                        : m.role === 'admin'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-dark-hover dark:text-gray-300'
                    }`}>
                      {m.role}
                    </span>

                    {isAdmin && (
                      <button
                        onClick={() => handleRemoveMember(m.username)}
                        className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                        title="Remove member"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Teams Tab */}
        {activeTab === 'teams' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  Teams ({teams.length})
                </h3>
                <p className="text-xs text-gray-500 dark:text-dark-muted">
                  Organize members into functional teams with tailored repository permissions.
                </p>
              </div>

              {isAdmin && (
                <button
                  onClick={() => setShowTeamModal(true)}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Team</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {teams.map((t) => (
                <div
                  key={t.id}
                  className="p-5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Shield className="w-4 h-4 text-emerald-600" />
                      <span className="font-bold text-sm text-gray-900 dark:text-white">
                        {t.name}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      t.permission === 'view_only'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                    }`}>
                      {t.permission === 'view_only' ? 'View Only' : t.permission}
                    </span>
                  </div>

                  {t.description && (
                    <p className="text-xs text-gray-500 dark:text-dark-muted">
                      {t.description}
                    </p>
                  )}

                  <div className="text-[11px] text-gray-400 pt-2 border-t border-gray-100 dark:border-dark-border/40">
                    {t.num_members || 0} members in this team
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && isAdmin && (
          <div className="max-w-3xl space-y-6">
            <div className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-xs space-y-6">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Organization Profile Settings
                </h3>
                <p className="text-xs text-gray-500 dark:text-dark-muted mt-1">
                  Manage your organization's public brand, display name, description, location, and website.
                </p>
              </div>

              <form onSubmit={handleUpdateOrg} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                    Organization Identifier
                  </label>
                  <input
                    type="text"
                    disabled
                    value={org.name}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-dark-border/60 bg-gray-100 dark:bg-dark-bg/60 text-gray-500 font-mono cursor-not-allowed"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">Unique organization slug used for routing and git namespaces.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                    Display Name (Full Name)
                  </label>
                  <input
                    type="text"
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    placeholder="e.g. Acme Corporation"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                    Description / Bio
                  </label>
                  <textarea
                    rows={3}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Short description of your organization's mission and projects"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                      Location
                    </label>
                    <input
                      type="text"
                      value={editLocation}
                      onChange={(e) => setEditLocation(e.target.value)}
                      placeholder="e.g. San Francisco, CA"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                      Website URL
                    </label>
                    <input
                      type="url"
                      value={editWebsite}
                      onChange={(e) => setEditWebsite(e.target.value)}
                      placeholder="https://example.com"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                    Avatar URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={editAvatarUrl}
                    onChange={(e) => setEditAvatarUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="pt-4 border-t border-gray-200 dark:border-dark-border flex justify-end">
                  <button
                    type="submit"
                    disabled={savingOrg}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>{savingOrg ? 'Saving Changes...' : 'Save Organization Profile'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Edit Organization Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-200 dark:border-dark-border w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <div className="flex items-center space-x-2">
                <Edit3 className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-base text-gray-900 dark:text-white">
                  Edit Organization Profile
                </h3>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateOrg} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                  Organization Name
                </label>
                <input
                  type="text"
                  disabled
                  value={org.name}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-dark-border/60 bg-gray-100 dark:bg-dark-bg/60 text-gray-500 font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                  Display Name (Full Name)
                </label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="e.g. Acme Corporation"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                  Description / Bio
                </label>
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Short description of your organization"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                    Location
                  </label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    placeholder="e.g. San Francisco, CA"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                    Website URL
                  </label>
                  <input
                    type="url"
                    value={editWebsite}
                    onChange={(e) => setEditWebsite(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                  Avatar URL
                </label>
                <input
                  type="url"
                  value={editAvatarUrl}
                  onChange={(e) => setEditAvatarUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-gray-200 dark:border-dark-border">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-border/60 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingOrg}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {savingOrg ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Team Modal */}
      {showTeamModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-surface rounded-xl max-w-md w-full border border-gray-200 dark:border-dark-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-dark-border pb-3">
              <h3 className="font-bold text-base text-gray-900 dark:text-white">
                Create new team
              </h3>
              <button
                onClick={() => setShowTeamModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                  Team Name *
                </label>
                <input
                  type="text"
                  required
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Developers, QA, DevOps"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                  Description
                </label>
                <input
                  type="text"
                  value={teamDesc}
                  onChange={(e) => setTeamDesc(e.target.value)}
                  placeholder="Responsibilities or purpose of this team"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                  Repository Permission Level *
                </label>
                <select
                  value={teamPerm}
                  onChange={(e) => setTeamPerm(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="write">Write (Can push, edit files, and upload)</option>
                  <option value="admin">Admin (Can push and manage repository settings)</option>
                  <option value="read">Read (Browse code and clone)</option>
                  <option value="view_only">View Only (Browse web UI only, no downloads)</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-gray-200 dark:border-dark-border">
                <button
                  type="button"
                  onClick={() => setShowTeamModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-border/60 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingTeam}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {creatingTeam ? 'Creating...' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

