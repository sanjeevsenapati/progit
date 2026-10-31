import React, { useEffect, useState } from 'react';
import { api, Repository, CollaboratorUser } from '../lib/api';
import { RepoNav } from '../components/RepoNav';
import { 
  Settings, 
  Trash2, 
  AlertTriangle, 
  BookOpen, 
  Globe, 
  Check, 
  ExternalLink,
  Save,
  Lock,
  Unlock,
  Users,
  UserPlus,
  Shield
} from 'lucide-react';

interface RepoSettingsProps {
  owner: string;
  repo: string;
}

export const RepoSettings: React.FC<RepoSettingsProps> = ({ owner, repo: repoName }) => {
  const [repoData, setRepoData] = useState<Repository | null>(null);
  const [confirmDelete, setConfirmDelete] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Collaborators
  const [collaborators, setCollaborators] = useState<CollaboratorUser[]>([]);
  const [newCollabUser, setNewCollabUser] = useState('');
  const [newCollabMode, setNewCollabMode] = useState('write');
  const [collabMsg, setCollabMsg] = useState('');
  const [addingCollab, setAddingCollab] = useState(false);

  // Editable fields
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [enableWiki, setEnableWiki] = useState(true);
  const [enablePages, setEnablePages] = useState(false);
  const [pagesBranch, setPagesBranch] = useState('main');
  const [pagesFolder, setPagesFolder] = useState('/');

  useEffect(() => {
    async function load() {
      try {
        const r = await api.getRepo(owner, repoName);
        setRepoData(r.repository);
        setDescription(r.repository.description || '');
        setIsPrivate(r.repository.is_private);
        setEnableWiki(r.repository.enable_wiki !== false);
        setEnablePages(r.repository.enable_pages === true);
        setPagesBranch(r.repository.pages_branch || r.repository.default_branch || 'main');
        setPagesFolder(r.repository.pages_folder || '/');

        const collabs = await api.getCollaborators(owner, repoName);
        setCollaborators(collabs || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [owner, repoName]);

  const handleAddCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollabUser.trim()) return;
    try {
      setAddingCollab(true);
      setCollabMsg('');
      await api.addCollaborator(owner, repoName, newCollabUser.trim(), newCollabMode);
      setCollabMsg(`Collaborator @${newCollabUser} added with ${newCollabMode} permissions`);
      setNewCollabUser('');
      const collabs = await api.getCollaborators(owner, repoName);
      setCollaborators(collabs || []);
      setTimeout(() => setCollabMsg(''), 4000);
    } catch (err: any) {
      alert(err.message || 'Failed to add collaborator');
    } finally {
      setAddingCollab(false);
    }
  };

  const handleRemoveCollaborator = async (username: string) => {
    if (!confirm(`Are you sure you want to remove collaborator @${username}?`)) return;
    try {
      await api.removeCollaborator(owner, repoName, username);
      setCollaborators(prev => prev.filter(c => c.username !== username));
    } catch (err: any) {
      alert(err.message || 'Failed to remove collaborator');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const updated = await api.updateRepoSettings(owner, repoName, {
        description,
        is_private: isPrivate,
        enable_wiki: enableWiki,
        enable_pages: enablePages,
        pages_branch: pagesBranch,
        pages_folder: pagesFolder,
      });
      setRepoData(updated);
      setSuccessMessage('Repository settings updated successfully');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      alert(err.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmDelete !== `${owner}/${repoName}`) {
      alert(`Please type "${owner}/${repoName}" to confirm deletion.`);
      return;
    }
    try {
      await api.deleteRepo(owner, repoName);
      alert('Repository deleted successfully');
      window.location.href = '/dashboard';
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading && !repoData) {
    return (
      <div className="py-20 text-center text-sm text-gray-400">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        Loading settings...
      </div>
    );
  }

  if (!repoData) {
    return <div className="py-20 text-center text-sm">Repository not found</div>;
  }

  const pagesURL = `${window.location.origin}/pages/${owner}/${repoName}/`;

  return (
    <div>
      <RepoNav repo={repoData} activeTab="settings" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
          <Settings className="w-5 h-5 mr-2 text-emerald-600 dark:text-emerald-400" />
          Repository Settings
        </h1>

        {successMessage && (
          <div className="p-3 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center">
            <Check className="w-4 h-4 mr-1.5" />
            {successMessage}
          </div>
        )}

        {/* General Details & Features Form */}
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-5">
            <h2 className="font-bold text-base text-gray-900 dark:text-white border-b border-gray-200 dark:border-dark-border pb-3">
              General Settings
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="text-xs text-gray-400 uppercase font-bold block mb-1">Repository Name</label>
                <input
                  type="text"
                  disabled
                  value={repoData.name}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg/60 text-gray-600 dark:text-gray-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase font-bold block mb-1">Default Branch</label>
                <input
                  type="text"
                  disabled
                  value={repoData.default_branch}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg/60 text-gray-600 dark:text-gray-400"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-400 uppercase font-bold block mb-1">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short description of this repository"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100 dark:border-dark-border/40">
              <label className="flex items-center space-x-2 text-sm font-semibold text-gray-800 dark:text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <span className="flex items-center">
                  {isPrivate ? <Lock className="w-3.5 h-3.5 mr-1 text-amber-500" /> : <Unlock className="w-3.5 h-3.5 mr-1 text-emerald-500" />}
                  Private Repository
                </span>
              </label>
              <p className="text-xs text-gray-500 dark:text-dark-muted pl-6 mt-0.5">
                Private repositories can only be accessed by you and invited collaborators.
              </p>
            </div>
          </div>

          {/* Features Configuration */}
          <div className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-6">
            <h2 className="font-bold text-base text-gray-900 dark:text-white border-b border-gray-200 dark:border-dark-border pb-3">
              Features
            </h2>

            {/* Wiki Feature Toggle */}
            <div className="flex items-start justify-between pb-4 border-b border-gray-100 dark:border-dark-border/40">
              <div className="space-y-1">
                <div className="flex items-center space-x-2 text-sm font-bold text-gray-900 dark:text-white">
                  <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Wikis</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-dark-muted">
                  First-class wiki documentation backed by an independent Git repository (<code className="font-mono text-[11px]">{repoName}.wiki.git</code>).
                </p>
              </div>
              <input
                type="checkbox"
                checked={enableWiki}
                onChange={(e) => setEnableWiki(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer mt-1"
              />
            </div>

            {/* ProGit Pages Toggle */}
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2 text-sm font-bold text-gray-900 dark:text-white">
                    <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>ProGit Pages</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-dark-muted">
                    Publish HTML, CSS, JavaScript, and Markdown websites directly from a branch in your repository.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={enablePages}
                  onChange={(e) => setEnablePages(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer mt-1"
                />
              </div>

              {enablePages && (
                <div className="p-4 rounded-lg bg-gray-50 dark:bg-dark-hover/30 border border-gray-200 dark:border-dark-border space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-700 dark:text-dark-text block mb-1">
                        Publish Branch
                      </label>
                      <input
                        type="text"
                        value={pagesBranch}
                        onChange={(e) => setPagesBranch(e.target.value)}
                        placeholder="e.g. gh-pages or main"
                        className="w-full px-3 py-1.5 text-xs rounded-md border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 dark:text-dark-text block mb-1">
                        Source Folder
                      </label>
                      <select
                        value={pagesFolder}
                        onChange={(e) => setPagesFolder(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-md border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="/">/ (root)</option>
                        <option value="/docs">/docs</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-dark-border text-xs">
                    <span className="text-gray-500 dark:text-dark-muted">
                      Published site URL:
                    </span>
                    <a
                      href={pagesURL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-emerald-600 dark:text-emerald-400 hover:underline flex items-center"
                    >
                      {pagesURL}
                      <ExternalLink className="w-3.5 h-3.5 ml-1" />
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : 'Save Settings'}</span>
              </button>
            </div>
          </div>
        </form>

        {/* Collaborators & Access Controls */}
        <div className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-dark-border pb-3">
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="font-bold text-base text-gray-900 dark:text-white">
                Collaborators & Edit Permissions
              </h2>
            </div>
            <span className="text-xs text-gray-500 dark:text-dark-muted">
              {collaborators.length} active {collaborators.length === 1 ? 'collaborator' : 'collaborators'}
            </span>
          </div>

          <p className="text-xs text-gray-500 dark:text-dark-muted">
            Grant users write or admin permissions to allow them to push commits, edit files online, upload documents, and manage project boards.
          </p>

          {collabMsg && (
            <div className="p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center">
              <Check className="w-4 h-4 mr-1.5 flex-shrink-0" />
              {collabMsg}
            </div>
          )}

          {/* Add collaborator form */}
          <form onSubmit={handleAddCollaborator} className="flex flex-col sm:flex-row items-center gap-2">
            <input
              type="text"
              required
              value={newCollabUser}
              onChange={(e) => setNewCollabUser(e.target.value)}
              placeholder="Username to invite..."
              className="w-full sm:flex-1 px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <select
              value={newCollabMode}
              onChange={(e) => setNewCollabMode(e.target.value)}
              className="w-full sm:w-44 px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="write">Write (Edit & Upload)</option>
              <option value="admin">Admin (Full Access)</option>
              <option value="read">Read Only</option>
            </select>
            <button
              type="submit"
              disabled={addingCollab}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{addingCollab ? 'Adding...' : 'Add Collaborator'}</span>
            </button>
          </form>

          {/* Collaborator List */}
          <div className="divide-y divide-gray-100 dark:divide-dark-border/40 border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
            {collaborators.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-400">
                No external collaborators have been added yet.
              </div>
            ) : (
              collaborators.map((c) => (
                <div key={c.user_id} className="p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-dark-hover/30 text-xs">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                      {c.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">@{c.username}</p>
                      {c.full_name && <p className="text-gray-400 text-[11px]">{c.full_name}</p>}
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                      c.mode === 'admin' 
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
                        : c.mode === 'write'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'bg-gray-100 text-gray-700 dark:bg-dark-hover dark:text-gray-300'
                    }`}>
                      {c.mode}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCollaborator(c.username)}
                      className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      title="Remove collaborator"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Danger Zone */}
        <div className="p-6 rounded-xl border border-red-300 dark:border-red-900/60 bg-red-50/30 dark:bg-red-950/20 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 text-red-600 dark:text-red-400 font-bold">
            <AlertTriangle className="w-5 h-5" />
            <span>Danger Zone</span>
          </div>

          <p className="text-xs text-gray-600 dark:text-dark-muted">
            Deleting a repository is irreversible. All branches, commits, issues, and wiki data will be completely deleted from the server.
          </p>

          <form onSubmit={handleDelete} className="space-y-3 pt-2">
            <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text">
              Please type <span className="font-bold font-mono text-red-600">{owner}/{repoName}</span> to confirm:
            </label>
            <div className="flex items-center space-x-3">
              <input
                type="text"
                required
                value={confirmDelete}
                onChange={e => setConfirmDelete(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-dark-surface text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
              />
              <button
                type="submit"
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs shadow-sm transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete repository</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
