import React, { useEffect, useState } from 'react';
import { api, User, SSHKey, AccessToken } from '../lib/api';
import { useAuth } from '../lib/theme';
import { showModalConfirm } from '../components/ModalDialog';
import { 
  User as UserIcon, 
  Key, 
  Shield, 
  Trash2, 
  Plus, 
  Copy, 
  Check, 
  AlertCircle, 
  Lock, 
  Mail, 
  MapPin, 
  Globe, 
  Image as ImageIcon,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';

export const UserSettings: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'account' | 'ssh' | 'tokens'>('profile');
  
  // Profile State
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [location, setLocation] = useState(user?.location || '');
  const [website, setWebsite] = useState(user?.website || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  
  // Password State
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  
  // SSH Keys State
  const [keys, setKeys] = useState<SSHKey[]>([]);
  const [showAddKey, setShowAddKey] = useState(false);
  const [newKeyTitle, setNewKeyTitle] = useState('');
  const [newKeyContent, setNewKeyContent] = useState('');
  const [addingKey, setAddingKey] = useState(false);
  const [keySuccess, setKeySuccess] = useState('');
  
  // Tokens State
  const [tokens, setTokens] = useState<AccessToken[]>([]);
  const [showAddToken, setShowAddToken] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenScopes, setNewTokenScopes] = useState('repo');
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [addingToken, setAddingToken] = useState(false);
  
  const [error, setError] = useState('');

  // Sync profile form when user updates
  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setEmail(user.email || '');
      setBio(user.bio || '');
      setLocation(user.location || '');
      setWebsite(user.website || '');
      setAvatarUrl(user.avatar_url || '');
    }
  }, [user]);

  useEffect(() => {
    setError('');
    setProfileSuccess('');
    setPasswordSuccess('');
    setKeySuccess('');

    if (activeTab === 'ssh') {
      api.listSSHKeys()
        .then(data => setKeys(Array.isArray(data) ? data : []))
        .catch(err => console.error('Failed to load SSH keys:', err));
    } else if (activeTab === 'tokens') {
      api.listTokens()
        .then(data => setTokens(Array.isArray(data) ? data : []))
        .catch(err => console.error('Failed to load access tokens:', err));
    }
  }, [activeTab]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setProfileSuccess('');
    setSavingProfile(true);

    try {
      await api.updateUserSettings({
        full_name: fullName,
        email: email,
        bio: bio,
        location: location,
        website: website,
        avatar_url: avatarUrl,
      });
      setProfileSuccess('Profile updated successfully.');
      setTimeout(() => setProfileSuccess(''), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPasswordSuccess('');

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      await api.updateUserPassword({
        old_password: oldPassword,
        new_password: newPassword,
      });
      setPasswordSuccess('Password updated successfully.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(''), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleAddSSHKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setKeySuccess('');
    setAddingKey(true);

    try {
      const k = await api.createSSHKey(newKeyTitle.trim(), newKeyContent.trim());
      setKeys(prev => [k, ...(prev || [])]);
      setNewKeyTitle('');
      setNewKeyContent('');
      setShowAddKey(false);
      setKeySuccess('SSH key added successfully.');
      setTimeout(() => setKeySuccess(''), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to add SSH key. Please check the public key format.');
    } finally {
      setAddingKey(false);
    }
  };

  const handleDeleteSSHKey = async (id: number) => {
    const confirmed = await showModalConfirm({
      title: 'Delete SSH Key',
      message: 'Are you sure you want to delete this SSH key? This action cannot be undone.',
      confirmText: 'Delete key',
      cancelText: 'Cancel',
      isDanger: true,
    });
    if (!confirmed) return;
    setError('');
    try {
      await api.deleteSSHKey(id);
      setKeys(prev => (prev || []).filter(k => k.id !== id));
      setKeySuccess('SSH key deleted.');
      setTimeout(() => setKeySuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete SSH key');
    }
  };

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setAddingToken(true);

    try {
      const res = await api.createToken(newTokenName.trim(), newTokenScopes);
      setTokens(prev => [res.token, ...(prev || [])]);
      setRawToken(res.raw_token);
      setNewTokenName('');
      setShowAddToken(false);
    } catch (err: any) {
      setError(err.message || 'Failed to generate access token');
    } finally {
      setAddingToken(false);
    }
  };

  const handleDeleteToken = async (id: number) => {
    const confirmed = await showModalConfirm({
      title: 'Revoke Access Token',
      message: 'Are you sure you want to revoke this access token? Any applications using it will immediately lose access.',
      confirmText: 'Revoke token',
      cancelText: 'Cancel',
      isDanger: true,
    });
    if (!confirmed) return;
    setError('');
    try {
      await api.deleteToken(id);
      setTokens(prev => (prev || []).filter(t => t.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to revoke token');
    }
  };

  const handleCopyToken = () => {
    if (rawToken) {
      navigator.clipboard.writeText(rawToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!user) {
    return (
      <div className="py-20 text-center text-sm text-gray-500">
        Please <a href="/login" className="text-emerald-600 underline">sign in</a> to view settings.
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Settings Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 dark:border-dark-border pb-5 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-sm text-gray-500 dark:text-dark-muted mt-1">
            Manage your personal profile, credentials, and API access keys.
          </p>
        </div>
        <a
          href={`/user/${user.username}`}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>View Public Profile</span>
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Sidebar Navigation */}
        <div className="space-y-1">
          <button
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center space-x-2.5 px-3 py-2 text-sm font-semibold rounded-lg text-left transition-colors ${
              activeTab === 'profile'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold'
                : 'text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover'
            }`}
          >
            <UserIcon className="w-4 h-4 flex-shrink-0" />
            <span>Public profile</span>
          </button>

          <button
            onClick={() => setActiveTab('account')}
            className={`w-full flex items-center space-x-2.5 px-3 py-2 text-sm font-semibold rounded-lg text-left transition-colors ${
              activeTab === 'account'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold'
                : 'text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover'
            }`}
          >
            <Lock className="w-4 h-4 flex-shrink-0" />
            <span>Account & Password</span>
          </button>

          <button
            onClick={() => setActiveTab('ssh')}
            className={`w-full flex items-center space-x-2.5 px-3 py-2 text-sm font-semibold rounded-lg text-left transition-colors ${
              activeTab === 'ssh'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold'
                : 'text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover'
            }`}
          >
            <Key className="w-4 h-4 flex-shrink-0" />
            <span>SSH and GPG keys</span>
          </button>

          <button
            onClick={() => setActiveTab('tokens')}
            className={`w-full flex items-center space-x-2.5 px-3 py-2 text-sm font-semibold rounded-lg text-left transition-colors ${
              activeTab === 'tokens'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold'
                : 'text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover'
            }`}
          >
            <Shield className="w-4 h-4 flex-shrink-0" />
            <span>Personal access tokens</span>
          </button>
        </div>

        {/* Settings Body */}
        <div className="md:col-span-3 space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 text-sm flex items-center space-x-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: PUBLIC PROFILE */}
          {activeTab === 'profile' && (
            <div className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-6">
              <div className="border-b border-gray-200 dark:border-dark-border pb-4">
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Public Profile</h2>
                <p className="text-xs text-gray-500 dark:text-dark-muted mt-0.5">
                  Information you provide here will be displayed publicly on your personal overview.
                </p>
              </div>

              {profileSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{profileSuccess}</span>
                </div>
              )}

              <form onSubmit={handleUpdateProfile} className="space-y-5">
                {/* Avatar Preview */}
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xl overflow-hidden ring-2 ring-emerald-500/20">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                    ) : (
                      user.username.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text uppercase mb-1">
                      Profile Picture URL
                    </label>
                    <input
                      type="url"
                      value={avatarUrl}
                      onChange={e => setAvatarUrl(e.target.value)}
                      placeholder="https://example.com/avatar.jpg"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text uppercase mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      disabled
                      value={user.username}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-dark-border bg-gray-100 dark:bg-dark-bg text-gray-500 cursor-not-allowed font-mono"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Username changes are managed by site administrators.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text uppercase mb-1">
                      Public Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text uppercase mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text uppercase mb-1">
                    Bio
                  </label>
                  <textarea
                    rows={3}
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    placeholder="Tell us a little bit about yourself, what you build, and what technologies you love..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text uppercase mb-1">
                      Location
                    </label>
                    <input
                      type="text"
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      placeholder="e.g. San Francisco, CA"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text uppercase mb-1">
                      URL / Website
                    </label>
                    <input
                      type="url"
                      value={website}
                      onChange={e => setWebsite(e.target.value)}
                      placeholder="https://example.com"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs shadow-sm transition-colors flex items-center space-x-1.5"
                  >
                    <span>{savingProfile ? 'Saving...' : 'Update profile'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: ACCOUNT & PASSWORD */}
          {activeTab === 'account' && (
            <div className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-6">
              <div className="border-b border-gray-200 dark:border-dark-border pb-4">
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Change Password</h2>
                <p className="text-xs text-gray-500 dark:text-dark-muted mt-0.5">
                  Update the password associated with your ProGit account.
                </p>
              </div>

              {passwordSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{passwordSuccess}</span>
                </div>
              )}

              <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-md">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text uppercase mb-1">
                    Current Password *
                  </label>
                  <input
                    type="password"
                    required
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    placeholder="Enter existing password"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text uppercase mb-1">
                    New Password *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text uppercase mb-1">
                    Confirm New Password *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs shadow-sm transition-colors"
                  >
                    <span>{savingPassword ? 'Updating...' : 'Update password'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: SSH KEYS */}
          {activeTab === 'ssh' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 dark:border-dark-border pb-4 gap-3">
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">SSH Keys</h2>
                  <p className="text-xs text-gray-500 dark:text-dark-muted mt-0.5">
                    This is a list of SSH public keys associated with your account for Git CLI operations.
                  </p>
                </div>
                {!showAddKey && (
                  <button
                    onClick={() => setShowAddKey(true)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New SSH key</span>
                  </button>
                )}
              </div>

              {keySuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{keySuccess}</span>
                </div>
              )}

              {/* Add Key Form */}
              {showAddKey && (
                <form onSubmit={handleAddSSHKey} className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-200 dark:border-dark-border pb-3">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-white">Add New SSH Key</h3>
                    <button
                      type="button"
                      onClick={() => setShowAddKey(false)}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase">Title *</label>
                    <input
                      type="text"
                      required
                      value={newKeyTitle}
                      onChange={e => setNewKeyTitle(e.target.value)}
                      placeholder="e.g. Work MacBook Pro, Home Desktop"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase">Key Content *</label>
                    <textarea
                      rows={4}
                      required
                      value={newKeyContent}
                      onChange={e => setNewKeyContent(e.target.value)}
                      placeholder="Begins with 'ssh-rsa', 'ssh-ed25519', or 'ecdsa-sha2-'..."
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Paste your public key file contents (e.g. ~/.ssh/id_ed25519.pub).</p>
                  </div>
                  <div className="flex items-center space-x-2 pt-1">
                    <button
                      type="submit"
                      disabled={addingKey}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs shadow-sm transition-colors"
                    >
                      {addingKey ? 'Adding...' : 'Add SSH key'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddKey(false)}
                      className="px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border text-xs text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Keys list */}
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm divide-y divide-gray-100 dark:divide-dark-border overflow-hidden">
                {(!keys || keys.length === 0) ? (
                  <div className="p-8 text-center text-xs text-gray-400 space-y-2">
                    <Key className="w-8 h-8 mx-auto text-gray-300 dark:text-dark-muted" />
                    <p>There are no SSH keys associated with your account.</p>
                  </div>
                ) : (
                  keys.map(k => (
                    <div key={k.id} className="p-4 flex items-center justify-between hover:bg-gray-50/50 dark:hover:bg-dark-hover/30 transition-colors">
                      <div className="flex items-start space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-100 dark:border-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5">
                          <Key className="w-4 h-4" />
                        </div>
                        <div className="space-y-0.5">
                          <div className="font-bold text-sm text-gray-900 dark:text-white">
                            {k.title}
                          </div>
                          <p className="text-xs font-mono text-gray-500 dark:text-dark-muted select-all">
                            {k.fingerprint}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            Added on {new Date(k.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteSSHKey(k.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                        title="Delete SSH key"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 4: ACCESS TOKENS */}
          {activeTab === 'tokens' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 dark:border-dark-border pb-4 gap-3">
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">Personal Access Tokens</h2>
                  <p className="text-xs text-gray-500 dark:text-dark-muted mt-0.5">
                    Tokens you have generated that can be used to access the ProGit REST API and Git CLI over HTTP.
                  </p>
                </div>
                {!showAddToken && (
                  <button
                    onClick={() => setShowAddToken(true)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Generate new token</span>
                  </button>
                )}
              </div>

              {/* Raw token banner */}
              {rawToken && (
                <div className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 space-y-2 animate-in fade-in">
                  <h3 className="font-bold text-sm text-emerald-900 dark:text-emerald-200 flex items-center space-x-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Make sure to copy your personal access token now!</span>
                  </h3>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300">
                    You won't be able to see this token again once you navigate away from this page.
                  </p>
                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="text"
                      readOnly
                      value={rawToken}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-dark-surface text-xs font-mono select-all text-emerald-900 dark:text-white font-bold"
                    />
                    <button
                      onClick={handleCopyToken}
                      className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-dark-surface hover:bg-emerald-100 dark:hover:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-semibold"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Generate Token Form */}
              {showAddToken && (
                <form onSubmit={handleCreateToken} className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-200 dark:border-dark-border pb-3">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-white">New Personal Access Token</h3>
                    <button
                      type="button"
                      onClick={() => setShowAddToken(false)}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase">Note / Description *</label>
                    <input
                      type="text"
                      required
                      value={newTokenName}
                      onChange={e => setNewTokenName(e.target.value)}
                      placeholder="e.g. CI/CD Deployment, CLI token"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase">Select Scopes</label>
                    <div className="space-y-2 pt-1 text-xs">
                      <label className="flex items-center space-x-2 text-gray-700 dark:text-dark-text cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newTokenScopes.includes('repo')}
                          onChange={e => {
                            if (e.target.checked) setNewTokenScopes(prev => prev ? `${prev},repo` : 'repo');
                            else setNewTokenScopes(prev => prev.replace('repo', '').replace(/^,|,$/g, ''));
                          }}
                          className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="font-semibold">repo</span>
                        <span className="text-gray-400">— Full control of private and public repositories</span>
                      </label>
                      <label className="flex items-center space-x-2 text-gray-700 dark:text-dark-text cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newTokenScopes.includes('user')}
                          onChange={e => {
                            if (e.target.checked) setNewTokenScopes(prev => prev ? `${prev},user` : 'user');
                            else setNewTokenScopes(prev => prev.replace('user', '').replace(/^,|,$/g, ''));
                          }}
                          className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="font-semibold">user</span>
                        <span className="text-gray-400">— Read and update user profile data</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 pt-2">
                    <button
                      type="submit"
                      disabled={addingToken}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs shadow-sm transition-colors"
                    >
                      {addingToken ? 'Generating...' : 'Generate token'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddToken(false)}
                      className="px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border text-xs text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Tokens List */}
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm divide-y divide-gray-100 dark:divide-dark-border overflow-hidden">
                {(!tokens || tokens.length === 0) ? (
                  <div className="p-8 text-center text-xs text-gray-400 space-y-2">
                    <Shield className="w-8 h-8 mx-auto text-gray-300 dark:text-dark-muted" />
                    <p>There are no personal access tokens generated.</p>
                  </div>
                ) : (
                  tokens.map(t => (
                    <div key={t.id} className="p-4 flex items-center justify-between hover:bg-gray-50/50 dark:hover:bg-dark-hover/30 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-sm text-gray-900 dark:text-white">{t.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-mono">
                            {t.scopes || 'repo'}
                          </span>
                        </div>
                        <p className="text-xs font-mono text-gray-500 dark:text-dark-muted">
                          {t.token_prefix}••••••••••••••••••••
                        </p>
                        <p className="text-[11px] text-gray-400">
                          Created on {new Date(t.created_at).toLocaleDateString()}
                          {t.last_used_at && ` • Last used ${new Date(t.last_used_at).toLocaleDateString()}`}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteToken(t.id)}
                        className="px-2.5 py-1 text-xs rounded-lg border border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      >
                        Revoke
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
