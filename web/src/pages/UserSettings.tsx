import React, { useEffect, useState } from 'react';
import { api, User, SSHKey, AccessToken } from '../lib/api';
import { useAuth } from '../lib/theme';
import { User as UserIcon, Key, Shield, Trash2, Plus, Copy, Check, AlertCircle } from 'lucide-react';

export const UserSettings: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'ssh' | 'tokens'>('profile');
  const [keys, setKeys] = useState<SSHKey[]>([]);
  const [tokens, setTokens] = useState<AccessToken[]>([]);
  
  // New Key Form
  const [newKeyTitle, setNewKeyTitle] = useState('');
  const [newKeyContent, setNewKeyContent] = useState('');
  
  // New Token Form
  const [newTokenName, setNewTokenName] = useState('');
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (activeTab === 'ssh') {
      api.listSSHKeys().then(setKeys).catch(console.error);
    } else if (activeTab === 'tokens') {
      api.listTokens().then(setTokens).catch(console.error);
    }
  }, [activeTab]);

  const handleAddSSHKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const k = await api.createSSHKey(newKeyTitle, newKeyContent);
      setKeys(prev => [k, ...prev]);
      setNewKeyTitle('');
      setNewKeyContent('');
    } catch (err: any) {
      setError(err.message || 'Failed to add SSH key');
    }
  };

  const handleDeleteSSHKey = async (id: number) => {
    if (!confirm('Are you sure you want to delete this SSH key?')) return;
    try {
      await api.deleteSSHKey(id);
      setKeys(prev => prev.filter(k => k.id !== id));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.createToken(newTokenName);
      setTokens(prev => [res.token, ...prev]);
      setRawToken(res.raw_token);
      setNewTokenName('');
    } catch (err: any) {
      setError(err.message || 'Failed to create token');
    }
  };

  const handleDeleteToken = async (id: number) => {
    if (!confirm('Are you sure you want to revoke this access token?')) return;
    try {
      await api.deleteToken(id);
      setTokens(prev => prev.filter(t => t.id !== id));
    } catch (err: any) {
      alert(err.message);
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Account Settings</h1>
        <p className="text-sm text-gray-500 dark:text-dark-muted mt-1">Manage your profile, public keys, and personal access tokens.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Sidebar Tabs */}
        <div className="space-y-1">
          <button
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center space-x-2 px-3 py-2 text-sm font-semibold rounded-lg text-left transition-colors ${
              activeTab === 'profile'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold'
                : 'text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover'
            }`}
          >
            <UserIcon className="w-4 h-4" />
            <span>Profile</span>
          </button>

          <button
            onClick={() => setActiveTab('ssh')}
            className={`w-full flex items-center space-x-2 px-3 py-2 text-sm font-semibold rounded-lg text-left transition-colors ${
              activeTab === 'ssh'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold'
                : 'text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>SSH Public Keys</span>
          </button>

          <button
            onClick={() => setActiveTab('tokens')}
            className={`w-full flex items-center space-x-2 px-3 py-2 text-sm font-semibold rounded-lg text-left transition-colors ${
              activeTab === 'tokens'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold'
                : 'text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Personal Access Tokens</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="md:col-span-3">
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 text-sm flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-4">
              <h2 className="font-bold text-base text-gray-900 dark:text-white border-b border-gray-200 dark:border-dark-border pb-3">Public Profile</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="text-xs text-gray-400 uppercase font-bold">Username</label>
                  <p className="font-semibold text-gray-800 dark:text-white">@{user.username}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase font-bold">Email</label>
                  <p className="font-semibold text-gray-800 dark:text-white">{user.email}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase font-bold">Full Name</label>
                  <p className="font-semibold text-gray-800 dark:text-white">{user.full_name || 'Not provided'}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase font-bold">Account Role</label>
                  <p className="font-semibold text-gray-800 dark:text-white">{user.is_admin ? 'Administrator' : 'User'}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ssh' && (
            <div className="space-y-6">
              {/* Add Key Form */}
              <form onSubmit={handleAddSSHKey} className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-4">
                <h2 className="font-bold text-base text-gray-900 dark:text-white border-b border-gray-200 dark:border-dark-border pb-3">Add SSH Key</h2>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase">Key Title *</label>
                  <input
                    type="text"
                    required
                    value={newKeyTitle}
                    onChange={e => setNewKeyTitle(e.target.value)}
                    placeholder="e.g. Work MacBook Pro"
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
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-colors"
                >
                  Add SSH Key
                </button>
              </form>

              {/* Keys list */}
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm divide-y divide-gray-100 dark:divide-dark-border overflow-hidden">
                {keys.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400">There are no SSH keys associated with your account.</div>
                ) : (
                  keys.map(k => (
                    <div key={k.id} className="p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="font-bold text-sm text-gray-900 dark:text-white flex items-center space-x-2">
                          <Key className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>{k.title}</span>
                        </div>
                        <p className="text-xs font-mono text-gray-400">{k.fingerprint}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteSSHKey(k.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg"
                        title="Delete key"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'tokens' && (
            <div className="space-y-6">
              {/* Raw token banner */}
              {rawToken && (
                <div className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 space-y-2">
                  <h3 className="font-bold text-sm text-emerald-900 dark:text-emerald-200">Make sure to copy your personal access token now!</h3>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300">You won't be able to see it again.</p>
                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="text"
                      readOnly
                      value={rawToken}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-dark-surface text-xs font-mono select-all text-emerald-900 dark:text-white"
                    />
                    <button
                      onClick={handleCopyToken}
                      className="p-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-dark-surface hover:bg-emerald-100 dark:hover:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Generate Token Form */}
              <form onSubmit={handleCreateToken} className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-4">
                <h2 className="font-bold text-base text-gray-900 dark:text-white border-b border-gray-200 dark:border-dark-border pb-3">Generate New Token</h2>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase">Token Description *</label>
                  <input
                    type="text"
                    required
                    value={newTokenName}
                    onChange={e => setNewTokenName(e.target.value)}
                    placeholder="e.g. CI/CD Pipeline or CLI access"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-colors"
                >
                  Generate Token
                </button>
              </form>

              {/* Tokens List */}
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm divide-y divide-gray-100 dark:divide-dark-border overflow-hidden">
                {tokens.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400">There are no personal access tokens generated.</div>
                ) : (
                  tokens.map(t => (
                    <div key={t.id} className="p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="font-bold text-sm text-gray-900 dark:text-white">{t.name}</span>
                        <p className="text-xs font-mono text-gray-400">{t.token_prefix}••••••••••••••••••••</p>
                      </div>
                      <button
                        onClick={() => handleDeleteToken(t.id)}
                        className="px-2.5 py-1 text-xs rounded border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
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

