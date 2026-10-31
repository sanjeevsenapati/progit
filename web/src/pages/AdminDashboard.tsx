import React, { useEffect, useState } from 'react';
import { api, User, Repository } from '../lib/api';
import { showModalConfirm } from '../components/ModalDialog';
import {
  Shield,
  Users,
  Database,
  Server,
  FolderGit2,
  Clock,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  Trash2,
  UserCheck,
  UserX,
  RefreshCw,
  Cpu,
  Layers,
  Settings,
  HardDrive,
  X
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'repos' | 'system'>('overview');
  const [loading, setLoading] = useState(true);

  // User creation modal
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  // Status message
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    try {
      const [s, uList, rList] = await Promise.all([
        api.getAdminStats(),
        api.getAdminUsers(),
        api.getAdminRepos(),
      ]);
      setStats(s);
      setUsers(uList || []);
      setRepos(rList || []);
    } catch (err: any) {
      console.error(err);
      setStatusMsg({ type: 'error', text: err.message || 'Failed to load administration data.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleAdmin = async (u: User) => {
    const action = u.is_admin ? 'revoke' : 'grant';
    const confirmed = await showModalConfirm({
      title: `${u.is_admin ? 'Revoke' : 'Grant'} Admin Privileges`,
      message: `Are you sure you want to ${action} admin privileges for @${u.username}?`,
      confirmText: `${u.is_admin ? 'Revoke' : 'Grant'} privileges`,
      cancelText: 'Cancel',
      isDanger: u.is_admin,
    });
    if (!confirmed) return;

    try {
      await api.adminUpdateUser(u.id, { is_admin: !u.is_admin });
      setStatusMsg({ type: 'success', text: `Updated admin privileges for @${u.username}.` });
      loadData();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to update user.' });
    }
  };

  const handleToggleActive = async (u: User) => {
    const action = u.is_active ? 'suspend' : 'reactivate';
    const confirmed = await showModalConfirm({
      title: `${u.is_active ? 'Suspend' : 'Reactivate'} Account`,
      message: `Are you sure you want to ${action} account @${u.username}?`,
      confirmText: `${u.is_active ? 'Suspend' : 'Reactivate'} account`,
      cancelText: 'Cancel',
      isDanger: u.is_active,
    });
    if (!confirmed) return;

    try {
      await api.adminUpdateUser(u.id, { is_active: !u.is_active });
      setStatusMsg({ type: 'success', text: `Account @${u.username} has been ${u.is_active ? 'suspended' : 'activated'}.` });
      loadData();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to update user status.' });
    }
  };

  const handleDeleteUser = async (u: User) => {
    const confirmed = await showModalConfirm({
      title: 'Delete User Account',
      message: `Are you sure you want to permanently delete user @${u.username} and all their repositories? This action cannot be undone.`,
      confirmText: 'Delete user',
      cancelText: 'Cancel',
      isDanger: true,
    });
    if (!confirmed) return;

    try {
      await api.adminDeleteUser(u.id);
      setStatusMsg({ type: 'success', text: `User @${u.username} and associated repositories deleted.` });
      loadData();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to delete user.' });
    }
  };

  const handleDeleteRepo = async (r: Repository) => {
    const confirmed = await showModalConfirm({
      title: 'Delete Repository Permanently',
      message: `Are you sure you want to permanently delete repository ${r.owner_name}/${r.name} from disk? This action cannot be undone.`,
      confirmText: 'Delete repository',
      cancelText: 'Cancel',
      isDanger: true,
    });
    if (!confirmed) return;

    try {
      await api.adminDeleteRepo(r.id);
      setStatusMsg({ type: 'success', text: `Repository ${r.owner_name}/${r.name} deleted successfully.` });
      loadData();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to delete repository.' });
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    try {
      await api.adminCreateUser({
        username: newUsername,
        email: newEmail,
        password: newPassword,
        full_name: newFullName,
        is_admin: newIsAdmin,
      });
      setShowAddUserModal(false);
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      setNewFullName('');
      setNewIsAdmin(false);
      setStatusMsg({ type: 'success', text: `User @${newUsername} created successfully.` });
      loadData();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to create user.' });
    } finally {
      setModalLoading(false);
    }
  };

  const handleMaintenance = async (op: 'checkpoint_wal' | 'vacuum') => {
    try {
      const res = await api.adminRunMaintenance(op);
      setStatusMsg({ type: 'success', text: res.message });
      loadData();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Maintenance failed.' });
    }
  };

  if (loading) {
    return <div className="py-24 text-center text-sm text-gray-400">Loading admin console...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="border-b border-gray-200 dark:border-dark-border pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <Shield className="w-6 h-6 mr-2 text-emerald-600 dark:text-emerald-400" />
            ProGit Administration Panel
          </h1>
          <p className="text-sm text-gray-500 dark:text-dark-muted mt-1">
            Super Administrator management for users, repositories, maintenance, and server runtime.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowAddUserModal(true)}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-sm transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create User</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-xl text-sm flex items-center justify-between border ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-800 dark:text-red-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
          <button
            onClick={() => setStatusMsg(null)}
            className="text-xs font-semibold hover:underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-4 border-b border-gray-200 dark:border-dark-border text-sm font-semibold">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-2 border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          System Overview
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-2 border-b-2 transition-colors ${
            activeTab === 'users'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Users ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('repos')}
          className={`pb-2 border-b-2 transition-colors ${
            activeTab === 'repos'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Repositories ({repos.length})
        </button>
        <button
          onClick={() => setActiveTab('system')}
          className={`pb-2 border-b-2 transition-colors ${
            activeTab === 'system'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Configuration
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-2">
              <span className="text-xs font-bold text-gray-400 uppercase">Total Users</span>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.users_count}</p>
            </div>
            <div className="p-5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-2">
              <span className="text-xs font-bold text-gray-400 uppercase">Total Repositories</span>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.repositories_count}</p>
            </div>
            <div className="p-5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-2">
              <span className="text-xs font-bold text-gray-400 uppercase">Server Uptime</span>
              <p className="text-xl font-bold text-gray-900 dark:text-white font-mono">{stats.uptime}</p>
            </div>
            <div className="p-5 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-2">
              <span className="text-xs font-bold text-gray-400 uppercase">Built-in SSH Server</span>
              <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                {stats.ssh_enabled ? `Active (Port ${stats.ssh_port || 2222})` : 'Disabled'}
              </p>
            </div>
          </div>

          {/* Runtime Metrics */}
          <div className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-4">
            <h3 className="font-bold text-base text-gray-900 dark:text-white flex items-center space-x-2">
              <Cpu className="w-5 h-5 text-emerald-600" />
              <span>Go Runtime & Memory Telemetry</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-dark-hover">
                <span className="text-gray-400 block mb-1">Go Version</span>
                <span className="font-bold text-gray-900 dark:text-white">{stats.go_version || 'Go 1.26+'}</span>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-dark-hover">
                <span className="text-gray-400 block mb-1">Goroutines</span>
                <span className="font-bold text-gray-900 dark:text-white">{stats.num_goroutines || 0}</span>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-dark-hover">
                <span className="text-gray-400 block mb-1">Allocated Memory</span>
                <span className="font-bold text-gray-900 dark:text-white">
                  {stats.memory_alloc_mb ? `${stats.memory_alloc_mb.toFixed(2)} MB` : 'N/A'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-dark-hover">
                <span className="text-gray-400 block mb-1">Active Sessions</span>
                <span className="font-bold text-gray-900 dark:text-white">{stats.active_sessions_count || 1}</span>
              </div>
            </div>
          </div>

          {/* Maintenance Actions */}
          <div className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-4">
            <h3 className="font-bold text-base text-gray-900 dark:text-white flex items-center space-x-2">
              <HardDrive className="w-5 h-5 text-emerald-600" />
              <span>Database Operations & Maintenance</span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-dark-muted">
              Perform online transactional maintenance on the SQLite database and WAL write-ahead log.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleMaintenance('checkpoint_wal')}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-dark-hover dark:hover:bg-dark-border text-gray-800 dark:text-dark-text text-xs font-semibold transition-colors flex items-center space-x-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Checkpoint & Truncate WAL</span>
              </button>
              <button
                onClick={() => handleMaintenance('vacuum')}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-dark-hover dark:hover:bg-dark-border text-gray-800 dark:text-dark-text text-xs font-semibold transition-colors flex items-center space-x-1.5"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Run Database VACUUM</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm divide-y divide-gray-100 dark:divide-dark-border overflow-hidden">
          <div className="p-4 bg-gray-50 dark:bg-dark-hover flex justify-between items-center text-xs font-bold text-gray-500 uppercase tracking-wider">
            <span>User Account</span>
            <span>Administrative Controls</span>
          </div>
          {users.map(u => (
            <div key={u.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <a href={`/user/${u.username}`} className="font-bold text-sm text-gray-900 dark:text-white hover:underline">
                    @{u.username}
                  </a>
                  {u.is_admin ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                      Super Admin
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-dark-muted">
                      Standard User
                    </span>
                  )}
                  {!u.is_active && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400">
                      Suspended
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 dark:text-dark-muted flex items-center space-x-2">
                  <span>{u.email}</span>
                  {u.full_name && <span>• {u.full_name}</span>}
                  <span>• Joined {new Date(u.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleToggleAdmin(u)}
                  title={u.is_admin ? 'Demote to regular user' : 'Promote to administrator'}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center space-x-1 ${
                    u.is_admin
                      ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100'
                      : 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>{u.is_admin ? 'Demote' : 'Make Admin'}</span>
                </button>

                <button
                  onClick={() => handleToggleActive(u)}
                  title={u.is_active ? 'Suspend account' : 'Reactivate account'}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center space-x-1 ${
                    u.is_active
                      ? 'border-gray-200 dark:border-dark-border text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover'
                      : 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100'
                  }`}
                >
                  {u.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                  <span>{u.is_active ? 'Suspend' : 'Activate'}</span>
                </button>

                <button
                  onClick={() => handleDeleteUser(u)}
                  title="Permanently delete user account and repositories"
                  className="p-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Repositories Tab */}
      {activeTab === 'repos' && (
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm divide-y divide-gray-100 dark:divide-dark-border overflow-hidden">
          <div className="p-4 bg-gray-50 dark:bg-dark-hover flex justify-between items-center text-xs font-bold text-gray-500 uppercase tracking-wider">
            <span>Repository</span>
            <span>Administrative Controls</span>
          </div>
          {repos.map(r => (
            <div key={r.id} className="p-4 flex items-center justify-between">
              <div>
                <a href={`/${r.owner_name}/${r.name}`} className="font-bold text-sm text-emerald-600 dark:text-emerald-400 hover:underline">
                  {r.owner_name} / {r.name}
                </a>
                <p className="text-xs text-gray-500 dark:text-dark-muted mt-0.5">{r.description || 'No description'}</p>
                <div className="flex items-center space-x-3 text-xs text-gray-400 mt-1">
                  <span>{r.is_private ? 'Private' : 'Public'}</span>
                  <span>•</span>
                  <span>{r.num_stars} stars</span>
                  <span>•</span>
                  <span>Branch: {r.default_branch}</span>
                </div>
              </div>
              <button
                onClick={() => handleDeleteRepo(r)}
                title="Permanently delete repository from disk"
                className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Repo</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Configuration Tab */}
      {activeTab === 'system' && stats && (
        <div className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-4">
          <h3 className="font-bold text-base text-gray-900 dark:text-white flex items-center space-x-2">
            <Settings className="w-5 h-5 text-emerald-600" />
            <span>Active Server Configuration</span>
          </h3>
          <div className="space-y-2 text-xs font-mono">
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-dark-hover flex justify-between">
              <span className="text-gray-500">Application Name:</span>
              <span className="font-bold text-gray-800 dark:text-white">{stats.app_name}</span>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-dark-hover flex justify-between">
              <span className="text-gray-500">Server Domain:</span>
              <span className="font-bold text-gray-800 dark:text-white">{stats.domain}</span>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-dark-hover flex justify-between">
              <span className="text-gray-500">Root URL:</span>
              <span className="font-bold text-gray-800 dark:text-white">{stats.root_url}</span>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-dark-hover flex justify-between">
              <span className="text-gray-500">Database Path:</span>
              <span className="font-bold text-gray-800 dark:text-white">{stats.database_path}</span>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-dark-hover flex justify-between">
              <span className="text-gray-500">Repositories Directory:</span>
              <span className="font-bold text-gray-800 dark:text-white">{stats.repositories_path}</span>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-dark-hover flex justify-between">
              <span className="text-gray-500">Installation Lock Status:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {stats.install_locked ? 'Locked (Production Safe)' : 'Unlocked'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-dark-surface rounded-xl max-w-md w-full p-6 border border-gray-200 dark:border-dark-border shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-dark-border">
              <h3 className="font-bold text-base text-gray-900 dark:text-white flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>Create New User</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddUserModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase">
                  Username *
                </label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase">
                  Full Name
                </label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={e => setNewFullName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase">
                  Initial Password *
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="isAdminCheckbox"
                  checked={newIsAdmin}
                  onChange={e => setNewIsAdmin(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="isAdminCheckbox" className="text-xs font-medium text-gray-700 dark:text-dark-text">
                  Grant Administrator Privileges
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-border/60 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
                >
                  {modalLoading ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
