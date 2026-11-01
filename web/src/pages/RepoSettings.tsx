import React, { useEffect, useState } from 'react';
import { api, Repository, CollaboratorUser, Webhook, WebhookDelivery } from '../lib/api';
import { useAuth } from '../lib/theme';
import { RepoNav } from '../components/RepoNav';
import { showToast, showModalConfirm } from '../components/ModalDialog';
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
  Shield,
  ShieldAlert,
  AlertCircle,
  X,
  Webhook as WebhookIcon,
  Plus,
  Play,
  History,
  Edit3,
  Eye,
  EyeOff,
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  Loader2,
  CheckCircle2
} from 'lucide-react';

interface RepoSettingsProps {
  owner: string;
  repo: string;
}

export const RepoSettings: React.FC<RepoSettingsProps> = ({ owner, repo: repoName }) => {
  const { user } = useAuth();
  const [repoData, setRepoData] = useState<Repository | null>(null);
  const [canAdmin, setCanAdmin] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Collaborators
  const [collaborators, setCollaborators] = useState<CollaboratorUser[]>([]);
  const [newCollabUser, setNewCollabUser] = useState('');
  const [newCollabMode, setNewCollabMode] = useState('write');
  const [collabMsg, setCollabMsg] = useState('');
  const [collabError, setCollabError] = useState('');
  const [addingCollab, setAddingCollab] = useState(false);

  // Webhooks
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loadingHooks, setLoadingHooks] = useState(false);
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [editingHook, setEditingHook] = useState<Webhook | null>(null);
  const [hookURL, setHookURL] = useState('');
  const [hookSecret, setHookSecret] = useState('');
  const [hookContentType, setHookContentType] = useState('json');
  const [hookEvents, setHookEvents] = useState('push,issue,pull_request');
  const [hookActive, setHookActive] = useState(true);
  const [savingHook, setSavingHook] = useState(false);
  const [testingHookId, setTestingHookId] = useState<number | null>(null);

  // Webhook Deliveries Modal
  const [showDeliveriesModal, setShowDeliveriesModal] = useState(false);
  const [selectedHook, setSelectedHook] = useState<Webhook | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [expandedDeliveryId, setExpandedDeliveryId] = useState<number | null>(null);

  // Danger Zone States
  const [confirmDelete, setConfirmDelete] = useState('');
  const [transferTarget, setTransferTarget] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [togglingArchive, setTogglingArchive] = useState(false);

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
        const hasAdminAccess = !!(user && (user.is_admin || user.username === owner || (r as any).permissions?.admin));
        setCanAdmin(hasAdminAccess);

        setDescription(r.repository.description || '');
        setIsPrivate(r.repository.is_private);
        setEnableWiki(r.repository.enable_wiki !== false);
        setEnablePages(r.repository.enable_pages === true);
        setPagesBranch(r.repository.pages_branch || r.repository.default_branch || 'main');
        setPagesFolder(r.repository.pages_folder || '/');

        if (hasAdminAccess) {
          const [collabs, hooks] = await Promise.all([
            api.getCollaborators(owner, repoName).catch(() => []),
            api.listWebhooks(owner, repoName).catch(() => [])
          ]);
          setCollaborators(collabs || []);
          setWebhooks(hooks || []);
        }
      } catch (err: any) {
        console.error(err);
        setCanAdmin(false);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [owner, repoName, user]);

  // Collaborators Handlers
  const handleAddCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollabUser.trim()) return;
    try {
      setAddingCollab(true);
      setCollabMsg('');
      setCollabError('');
      await api.addCollaborator(owner, repoName, newCollabUser.trim(), newCollabMode);
      setCollabMsg(`Collaborator @${newCollabUser} added with ${newCollabMode} permissions`);
      showToast(`Collaborator @${newCollabUser} added successfully`);
      setNewCollabUser('');
      const collabs = await api.getCollaborators(owner, repoName);
      setCollaborators(collabs || []);
      setTimeout(() => setCollabMsg(''), 4000);
    } catch (err: any) {
      const msg = err.message || 'Failed to add collaborator';
      setCollabError(msg);
      showToast(msg, 'error');
    } finally {
      setAddingCollab(false);
    }
  };

  const handleRemoveCollaborator = async (username: string) => {
    const confirmed = await showModalConfirm({
      title: 'Remove Collaborator',
      message: `Are you sure you want to remove collaborator @${username}? They will lose push, edit, and management permissions on this repository.`,
      confirmText: 'Remove Collaborator',
      cancelText: 'Cancel',
      isDanger: true,
    });
    if (!confirmed) return;

    try {
      await api.removeCollaborator(owner, repoName, username);
      setCollaborators(prev => prev.filter(c => c.username !== username));
      showToast(`Collaborator @${username} removed`);
    } catch (err: any) {
      showToast(err.message || 'Failed to remove collaborator', 'error');
    }
  };

  // Webhooks Handlers
  const openCreateWebhookModal = () => {
    setEditingHook(null);
    setHookURL('');
    setHookSecret('');
    setHookContentType('json');
    setHookEvents('push,issue,pull_request');
    setHookActive(true);
    setShowWebhookModal(true);
  };

  const openEditWebhookModal = (hook: Webhook) => {
    setEditingHook(hook);
    setHookURL(hook.url);
    setHookSecret('');
    setHookContentType(hook.content_type || 'json');
    setHookEvents(hook.events || 'push,issue,pull_request');
    setHookActive(hook.is_active);
    setShowWebhookModal(true);
  };

  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hookURL.trim()) {
      showToast('Payload URL is required', 'error');
      return;
    }
    try {
      setSavingHook(true);
      if (editingHook) {
        const updated = await api.updateWebhook(owner, repoName, editingHook.id, {
          url: hookURL.trim(),
          secret: hookSecret.trim() || undefined,
          content_type: hookContentType,
          events: hookEvents,
          is_active: hookActive,
        });
        setWebhooks(prev => prev.map(h => (h.id === updated.id ? updated : h)));
        showToast('Webhook updated successfully');
      } else {
        const created = await api.createWebhook(owner, repoName, {
          url: hookURL.trim(),
          secret: hookSecret.trim(),
          content_type: hookContentType,
          events: hookEvents,
          is_active: hookActive,
        });
        setWebhooks(prev => [created, ...prev]);
        showToast('Webhook created successfully');
      }
      setShowWebhookModal(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to save webhook', 'error');
    } finally {
      setSavingHook(false);
    }
  };

  const handleDeleteWebhook = async (id: number) => {
    const confirmed = await showModalConfirm({
      title: 'Delete Webhook',
      message: 'Are you sure you want to delete this webhook? Incoming event dispatches and delivery history will be permanently removed.',
      confirmText: 'Delete Webhook',
      cancelText: 'Cancel',
      isDanger: true,
    });
    if (!confirmed) return;

    try {
      await api.deleteWebhook(owner, repoName, id);
      setWebhooks(prev => prev.filter(h => h.id !== id));
      showToast('Webhook deleted');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete webhook', 'error');
    }
  };

  const handleTestWebhook = async (hook: Webhook) => {
    try {
      setTestingHookId(hook.id);
      const res = await api.testWebhook(owner, repoName, hook.id);
      if (res.delivery && res.delivery.status_code >= 200 && res.delivery.status_code < 300) {
        showToast(`Test ping successful! HTTP ${res.delivery.status_code} (${res.delivery.duration_ms}ms)`, 'success');
      } else if (res.delivery) {
        showToast(`Test ping responded with HTTP ${res.delivery.status_code} (${res.delivery.duration_ms}ms)`, 'error');
      } else {
        showToast('Test ping dispatched', 'info');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to test webhook', 'error');
    } finally {
      setTestingHookId(null);
    }
  };

  const openDeliveriesModal = async (hook: Webhook) => {
    setSelectedHook(hook);
    setShowDeliveriesModal(true);
    setLoadingDeliveries(true);
    try {
      const list = await api.listWebhookDeliveries(owner, repoName, hook.id);
      setDeliveries(list || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch deliveries', 'error');
    } finally {
      setLoadingDeliveries(false);
    }
  };

  // Danger Zone Handlers
  const handleToggleVisibility = async () => {
    const targetStatus = !isPrivate;
    const confirmed = await showModalConfirm({
      title: targetStatus ? 'Make Repository Private' : 'Make Repository Public',
      message: targetStatus
        ? 'Making this repository private means only you and designated collaborators will be able to clone, view code, or file issues.'
        : 'Making this repository public means anyone on the internet will be able to view code, clone repositories, and read documentation.',
      confirmText: targetStatus ? 'Make Private' : 'Make Public',
      cancelText: 'Cancel',
      isDanger: targetStatus,
    });
    if (!confirmed) return;

    try {
      setTogglingVisibility(true);
      const res = await api.changeRepoVisibility(owner, repoName, targetStatus);
      setIsPrivate(res.is_private);
      if (repoData) {
        setRepoData({ ...repoData, is_private: res.is_private });
      }
      showToast(`Repository visibility changed to ${res.is_private ? 'Private' : 'Public'}`);
    } catch (err: any) {
      showToast(err.message || 'Failed to change repository visibility', 'error');
    } finally {
      setTogglingVisibility(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!repoData) return;
    const targetStatus = !repoData.is_archived;
    const confirmed = await showModalConfirm({
      title: targetStatus ? 'Archive this repository' : 'Unarchive this repository',
      message: targetStatus
        ? `Are you sure you want to archive ${owner}/${repoName}? The repository will become read-only. Push operations, issue creation, and pull requests will be disabled.`
        : `Unarchiving ${owner}/${repoName} will restore normal write operations, allowing commits, pull requests, and issues.`,
      confirmText: targetStatus ? 'Yes, archive repository' : 'Unarchive repository',
      cancelText: 'Cancel',
      isDanger: targetStatus,
    });
    if (!confirmed) return;

    try {
      setTogglingArchive(true);
      const res = await api.toggleRepoArchive(owner, repoName, targetStatus);
      setRepoData({ ...repoData, is_archived: res.is_archived });
      showToast(res.is_archived ? 'Repository archived (read-only mode active)' : 'Repository unarchived (write access restored)');
    } catch (err: any) {
      showToast(err.message || 'Failed to update repository archive status', 'error');
    } finally {
      setTogglingArchive(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTarget.trim()) {
      showToast('Please specify the destination username or organization name', 'error');
      return;
    }

    const confirmed = await showModalConfirm({
      title: 'Transfer Repository Ownership',
      message: `Are you sure you want to transfer ownership of ${owner}/${repoName} to "${transferTarget.trim()}"? You may lose administrative control if you are not an owner of the destination organization.`,
      confirmText: 'Transfer repository',
      cancelText: 'Cancel',
      isDanger: true,
    });
    if (!confirmed) return;

    try {
      setTransferring(true);
      const res = await api.transferRepo(owner, repoName, transferTarget.trim());
      showToast(`Repository successfully transferred to ${res.new_owner}`);
      setTimeout(() => {
        window.location.href = res.redirect_url || `/${res.new_owner}/${repoName}`;
      }, 1000);
    } catch (err: any) {
      showToast(err.message || 'Failed to transfer repository', 'error');
    } finally {
      setTransferring(false);
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
      showToast('Repository settings updated successfully');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      showToast(err.message || 'Failed to update settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmDelete !== `${owner}/${repoName}`) {
      showToast(`Please type "${owner}/${repoName}" to confirm deletion.`, 'error');
      return;
    }

    const confirmed = await showModalConfirm({
      title: 'Delete Repository Permanently',
      message: `Are you absolutely certain? This will permanently erase ${owner}/${repoName}, including all code, branches, tags, commit logs, issues, wiki pages, and project boards. This action cannot be reversed.`,
      confirmText: 'Yes, delete this repository',
      cancelText: 'Cancel',
      isDanger: true,
    });
    if (!confirmed) return;

    try {
      await api.deleteRepo(owner, repoName);
      showToast('Repository deleted successfully');
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 500);
    } catch (err: any) {
      showToast(err.message || 'Failed to delete repository', 'error');
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

  if (!canAdmin) {
    return (
      <div>
        <RepoNav repo={repoData} activeTab="settings" />
        <div className="max-w-xl mx-auto my-16 p-8 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto border border-red-200 dark:border-red-900/50">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Access Restricted</h2>
          <p className="text-xs text-gray-500 dark:text-dark-muted leading-relaxed">
            You do not have administrator permissions to manage settings or collaborators for <strong>{owner}/{repoName}</strong>.
          </p>
          <div className="pt-2">
            <a
              href={`/${owner}/${repoName}`}
              className="inline-flex items-center px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-colors"
            >
              Return to repository
            </a>
          </div>
        </div>
      </div>
    );
  }

  const pagesURL = `${window.location.origin}/pages/${owner}/${repoName}/`;

  return (
    <div>
      <RepoNav repo={repoData} activeTab="settings" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {successMessage && (
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 flex items-center space-x-3 text-emerald-800 dark:text-emerald-300 text-sm">
            <Check className="w-5 h-5 flex-shrink-0" />
            <span>{successMessage}</span>
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
                <label className="block text-xs font-semibold text-gray-500 dark:text-dark-muted mb-1">
                  Repository Name
                </label>
                <input
                  type="text"
                  disabled
                  value={repoName}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-hover text-gray-500 dark:text-dark-muted cursor-not-allowed text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-dark-muted mb-1">
                  Default Branch
                </label>
                <input
                  type="text"
                  disabled
                  value={repoData.default_branch || 'main'}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-hover text-gray-500 dark:text-dark-muted cursor-not-allowed text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1">
                Description
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Short description of this repository..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400"
              />
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
                <div className="flex items-center space-x-2">
                  <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-semibold text-sm text-gray-900 dark:text-white">Built-in Git Wiki</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-dark-muted max-w-xl">
                  Host documentation alongside your project with its own versioned Git repository and markdown viewer.
                </p>
              </div>
              <input
                type="checkbox"
                checked={enableWiki}
                onChange={e => setEnableWiki(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded border-gray-300 dark:border-dark-border focus:ring-emerald-500 mt-1 cursor-pointer"
              />
            </div>

            {/* ProGit Pages Feature Toggle */}
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-semibold text-sm text-gray-900 dark:text-white">ProGit Pages Static Hosting</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-dark-muted max-w-xl">
                    Publish HTML, CSS, JavaScript, and documentation directly from a repository branch.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={enablePages}
                  onChange={e => setEnablePages(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-gray-300 dark:border-dark-border focus:ring-emerald-500 mt-1 cursor-pointer"
                />
              </div>

              {enablePages && (
                <div className="p-4 rounded-lg bg-gray-50 dark:bg-dark-hover/40 border border-gray-200 dark:border-dark-border space-y-3 animate-fade-in text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-gray-700 dark:text-dark-text mb-1">
                        Source Branch
                      </label>
                      <input
                        type="text"
                        value={pagesBranch}
                        onChange={e => setPagesBranch(e.target.value)}
                        placeholder="main"
                        className="w-full px-2.5 py-1.5 rounded-md border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface font-mono text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-gray-700 dark:text-dark-text mb-1">
                        Source Directory
                      </label>
                      <select
                        value={pagesFolder}
                        onChange={e => setPagesFolder(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-md border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white"
                      >
                        <option value="/">/ (root directory)</option>
                        <option value="/docs">/docs (documentation folder)</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-gray-200 dark:border-dark-border/40">
                    <span className="text-gray-500 dark:text-dark-muted">Published site:</span>
                    <a
                      href={pagesURL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                    >
                      <span>{pagesURL}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving changes...' : 'Save Settings'}</span>
            </button>
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

          {collabError && (
            <div className="p-2.5 rounded-lg bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-xs font-semibold text-red-800 dark:text-red-300 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{collabError}</span>
              </div>
              <button
                type="button"
                onClick={() => setCollabError('')}
                className="p-0.5 text-red-500 hover:text-red-700 dark:hover:text-red-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {collabMsg && (
            <div className="p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Check className="w-4 h-4 flex-shrink-0" />
                <span>{collabMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setCollabMsg('')}
                className="p-0.5 text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Add collaborator form */}
          <form onSubmit={handleAddCollaborator} className="flex flex-col sm:flex-row items-center gap-2">
            <input
              type="text"
              required
              placeholder="Username to invite..."
              value={newCollabUser}
              onChange={e => setNewCollabUser(e.target.value)}
              className="w-full sm:flex-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <select
              value={newCollabMode}
              onChange={e => setNewCollabMode(e.target.value)}
              className="w-full sm:w-auto px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-xs text-gray-900 dark:text-white"
            >
              <option value="write">Write (Edit & Upload)</option>
              <option value="admin">Admin (Manage settings)</option>
              <option value="read">Read Only</option>
            </select>
            <button
              type="submit"
              disabled={addingCollab}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-colors disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              <span>{addingCollab ? 'Adding...' : 'Add'}</span>
            </button>
          </form>

          {/* Collaborators List */}
          <div className="divide-y divide-gray-100 dark:divide-dark-border/40 border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
            {collaborators.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-400 dark:text-dark-muted">
                No collaborators have been added yet. Repository is restricted to {owner}.
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

        {/* Webhooks Section */}
        <div className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-dark-border pb-3">
            <div className="flex items-center space-x-2">
              <WebhookIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="font-bold text-base text-gray-900 dark:text-white">
                Webhooks
              </h2>
            </div>
            <button
              type="button"
              onClick={openCreateWebhookModal}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Webhook</span>
            </button>
          </div>

          <p className="text-xs text-gray-500 dark:text-dark-muted">
            Webhooks allow external services to be notified when events happen on this repository. ProGit will send an HTTP POST payload with HMAC signatures to the URLs configured below.
          </p>

          <div className="divide-y divide-gray-100 dark:divide-dark-border/40 border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
            {webhooks.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-400 dark:text-dark-muted space-y-2">
                <p>No webhooks configured yet.</p>
                <button
                  type="button"
                  onClick={openCreateWebhookModal}
                  className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
                >
                  Configure your first webhook
                </button>
              </div>
            ) : (
              webhooks.map((hook) => (
                <div key={hook.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-dark-hover/30 text-xs">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center space-x-2 flex-wrap">
                      <span className="font-mono font-bold text-gray-900 dark:text-white truncate max-w-sm sm:max-w-md">
                        {hook.url}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        hook.is_active 
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-gray-200 text-gray-600 dark:bg-dark-hover dark:text-gray-400'
                      }`}>
                        {hook.is_active ? 'Active' : 'Inactive'}
                      </span>
                      {hook.has_secret && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                          Secret Active
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-dark-muted flex items-center space-x-2">
                      <span>Events: <strong className="font-mono">{hook.events}</strong></span>
                      <span>•</span>
                      <span>Format: <strong className="font-mono">{hook.content_type}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <button
                      type="button"
                      disabled={testingHookId === hook.id}
                      onClick={() => handleTestWebhook(hook)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors font-medium text-xs disabled:opacity-50"
                      title="Deliver test ping event"
                    >
                      {testingHookId === hook.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                      ) : (
                        <Play className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      )}
                      <span>Test</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openDeliveriesModal(hook)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors font-medium text-xs"
                      title="View delivery logs"
                    >
                      <History className="w-3.5 h-3.5 text-blue-500" />
                      <span>Deliveries</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openEditWebhookModal(hook)}
                      className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
                      title="Edit webhook"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteWebhook(hook.id)}
                      className="p-1.5 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      title="Delete webhook"
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
        <div className="p-6 rounded-xl border border-red-300 dark:border-red-900/60 bg-red-50/20 dark:bg-red-950/10 shadow-sm space-y-6">
          <div className="flex items-center space-x-2 text-red-600 dark:text-red-400 font-bold border-b border-red-200 dark:border-red-900/40 pb-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <h2 className="text-base font-bold">Danger Zone</h2>
          </div>

          <div className="space-y-6 divide-y divide-red-200/60 dark:divide-red-900/40 text-xs">
            {/* 1. Change Visibility */}
            <div className="pt-4 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h3 className="font-bold text-gray-900 dark:text-white">Change repository visibility</h3>
                <p className="text-gray-500 dark:text-dark-muted">
                  This repository is currently <strong className="font-semibold text-gray-900 dark:text-white">{isPrivate ? 'Private' : 'Public'}</strong>.
                  {isPrivate 
                    ? ' Making it public will allow anyone on the internet to view the code.' 
                    : ' Making it private will restrict access to authorized collaborators only.'}
                </p>
              </div>
              <button
                type="button"
                disabled={togglingVisibility}
                onClick={handleToggleVisibility}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-dark-surface hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 font-semibold transition-colors flex-shrink-0"
              >
                {isPrivate ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                <span>{togglingVisibility ? 'Updating...' : isPrivate ? 'Make Public' : 'Make Private'}</span>
              </button>
            </div>

            {/* 2. Archive Repository */}
            <div className="pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h3 className="font-bold text-gray-900 dark:text-white">Archive this repository</h3>
                <p className="text-gray-500 dark:text-dark-muted">
                  {repoData.is_archived
                    ? 'This repository is currently archived and in read-only mode.'
                    : 'Mark this repository as archived and read-only. Push operations, commits, issues, and pull requests will be disabled.'}
                </p>
              </div>
              <button
                type="button"
                disabled={togglingArchive}
                onClick={handleToggleArchive}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg border border-amber-400 dark:border-amber-800 bg-white dark:bg-dark-surface hover:bg-amber-50 dark:hover:bg-amber-950/30 text-amber-700 dark:text-amber-400 font-semibold transition-colors flex-shrink-0"
              >
                {repoData.is_archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                <span>{togglingArchive ? 'Updating...' : repoData.is_archived ? 'Unarchive repository' : 'Archive repository'}</span>
              </button>
            </div>

            {/* 3. Transfer Repository */}
            <div className="pt-6 space-y-3">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Transfer repository ownership</h3>
                <p className="text-gray-500 dark:text-dark-muted">
                  Transfer this repository to another user or to an organization where you have administrator privileges.
                </p>
              </div>
              <form onSubmit={handleTransfer} className="flex flex-col sm:flex-row items-center gap-2">
                <input
                  type="text"
                  required
                  placeholder="Target username or organization..."
                  value={transferTarget}
                  onChange={e => setTransferTarget(e.target.value)}
                  className="w-full sm:flex-1 px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-red-500 font-mono text-xs"
                />
                <button
                  type="submit"
                  disabled={transferring}
                  className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs shadow-sm transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>{transferring ? 'Transferring...' : 'Transfer repository'}</span>
                </button>
              </form>
            </div>

            {/* 4. Delete Repository */}
            <div className="pt-6 space-y-3">
              <div>
                <h3 className="font-bold text-red-600 dark:text-red-400">Delete this repository permanently</h3>
                <p className="text-gray-500 dark:text-dark-muted">
                  Deleting a repository is irreversible. All branches, commits, pull requests, issues, and wiki documentation will be completely deleted from disk.
                </p>
              </div>
              <form onSubmit={handleDelete} className="space-y-3">
                <label className="block text-gray-700 dark:text-dark-text font-medium">
                  Please type <span className="font-bold font-mono text-red-600">{owner}/{repoName}</span> to confirm:
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <input
                    type="text"
                    required
                    value={confirmDelete}
                    onChange={e => setConfirmDelete(e.target.value)}
                    className="w-full sm:flex-1 px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-red-500 font-mono text-xs"
                  />
                  <button
                    type="submit"
                    className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs shadow-sm transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete repository</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Webhook Create / Edit Modal */}
      {showWebhookModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 dark:bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl max-w-lg w-full shadow-2xl overflow-hidden transition-all text-xs">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dark-border">
              <div className="flex items-center space-x-2">
                <WebhookIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  {editingHook ? 'Edit Webhook' : 'Add Webhook'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowWebhookModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWebhook} className="p-6 space-y-4">
              <div>
                <label className="block font-semibold text-gray-700 dark:text-dark-text mb-1">
                  Payload URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://example.com/postreceive"
                  value={hookURL}
                  onChange={e => setHookURL(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-dark-text mb-1">
                    Content Type
                  </label>
                  <select
                    value={hookContentType}
                    onChange={e => setHookContentType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-xs"
                  >
                    <option value="json">application/json</option>
                    <option value="form">application/x-www-form-urlencoded</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 dark:text-dark-text mb-1">
                    Secret Key
                  </label>
                  <input
                    type="password"
                    placeholder={editingHook?.has_secret ? 'Leave blank to keep existing' : 'Optional HMAC secret'}
                    value={hookSecret}
                    onChange={e => setHookSecret(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-dark-text mb-1">
                  Trigger Events
                </label>
                <select
                  value={hookEvents}
                  onChange={e => setHookEvents(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-xs"
                >
                  <option value="push,issue,pull_request">Push, Issues, and Pull Requests (Default)</option>
                  <option value="push">Just the push event</option>
                  <option value="*">Send me everything (All repository events)</option>
                </select>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="hookActiveToggle"
                  checked={hookActive}
                  onChange={e => setHookActive(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-gray-300 dark:border-dark-border focus:ring-emerald-500 cursor-pointer"
                />
                <label htmlFor="hookActiveToggle" className="font-semibold text-gray-700 dark:text-dark-text cursor-pointer">
                  Enable this webhook (deliver payload on repository activities)
                </label>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-gray-200 dark:border-dark-border">
                <button
                  type="button"
                  onClick={() => setShowWebhookModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingHook}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-sm transition-colors disabled:opacity-50"
                >
                  {savingHook ? 'Saving...' : editingHook ? 'Update Webhook' : 'Add Webhook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Webhook Deliveries Modal */}
      {showDeliveriesModal && selectedHook && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 dark:bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden transition-all text-xs max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dark-border flex-shrink-0">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-blue-500" />
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">Recent Deliveries</h3>
                  <p className="text-[11px] font-mono text-gray-500 dark:text-dark-muted truncate max-w-md">
                    {selectedHook.url}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDeliveriesModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-3">
              {loadingDeliveries ? (
                <div className="py-12 text-center text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
                  Loading delivery history...
                </div>
              ) : deliveries.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  No deliveries recorded for this webhook yet. Click "Test" to send a ping event!
                </div>
              ) : (
                deliveries.map((d) => (
                  <div
                    key={d.id}
                    className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden bg-gray-50/50 dark:bg-dark-hover/20 transition-all"
                  >
                    <div
                      onClick={() => setExpandedDeliveryId(expandedDeliveryId === d.id ? null : d.id)}
                      className="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-hover/50"
                    >
                      <div className="flex items-center space-x-2.5">
                        <span className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                          d.status_code >= 200 && d.status_code < 300
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                        }`}>
                          {d.status_code === 0 ? 'FAIL' : d.status_code}
                        </span>
                        <span className="font-mono font-semibold text-gray-900 dark:text-white">
                          {d.event}
                        </span>
                        <span className="text-[11px] text-gray-400 font-mono">
                          {d.duration_ms}ms
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-400">
                        {new Date(d.delivered_at).toLocaleString()}
                      </span>
                    </div>

                    {expandedDeliveryId === d.id && (
                      <div className="p-4 border-t border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-3">
                        <div>
                          <label className="block font-semibold text-gray-700 dark:text-dark-text mb-1">
                            Payload JSON
                          </label>
                          <pre className="p-2.5 rounded bg-gray-100 dark:bg-dark-surface font-mono text-[11px] overflow-x-auto text-gray-800 dark:text-gray-200 max-h-40">
                            {d.payload}
                          </pre>
                        </div>

                        <div>
                          <label className="block font-semibold text-gray-700 dark:text-dark-text mb-1">
                            Response Body
                          </label>
                          <pre className="p-2.5 rounded bg-gray-100 dark:bg-dark-surface font-mono text-[11px] overflow-x-auto text-gray-800 dark:text-gray-200 max-h-32">
                            {d.response_body || '(Empty response body)'}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
