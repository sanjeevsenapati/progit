import React, { useEffect, useState } from 'react';
import { api, Repository, Project } from '../lib/api';
import { RepoNav } from '../components/RepoNav';
import { 
  Kanban, 
  Plus, 
  CheckCircle2, 
  Clock, 
  X, 
  Layers, 
  Check, 
  FolderPlus 
} from 'lucide-react';

interface ProjectsListProps {
  owner: string;
  repo: string;
}

export const ProjectsList: React.FC<ProjectsListProps> = ({ owner, repo: repoName }) => {
  const [repoData, setRepoData] = useState<Repository | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'open' | 'closed'>('open');
  const [canWrite, setCanWrite] = useState(false);

  // New Project modal
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const r = await api.getRepo(owner, repoName);
        setRepoData(r.repository);
        setCanWrite(Boolean(r.can_write || r.permissions?.write));

        const list = await api.listProjects(owner, repoName);
        setProjects(list || []);
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [owner, repoName]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      setCreating(true);
      setError('');
      const p = await api.createProject(owner, repoName, {
        title: title.trim(),
        description: description.trim(),
      });
      setProjects((prev) => [p, ...prev]);
      setShowModal(false);
      setTitle('');
      setDescription('');
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const filteredProjects = projects.filter((p) =>
    filter === 'open' ? !p.is_closed : p.is_closed
  );

  const openCount = projects.filter((p) => !p.is_closed).length;
  const closedCount = projects.filter((p) => p.is_closed).length;

  if (loading && !repoData) {
    return (
      <div className="py-20 text-center text-sm text-gray-400">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        Loading projects...
      </div>
    );
  }

  if (!repoData) {
    return <div className="py-20 text-center text-sm">Repository not found</div>;
  }

  return (
    <div>
      <RepoNav repo={repoData} activeTab="projects" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center space-x-2">
              <Kanban className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span>Projects</span>
            </h1>
            <p className="text-xs text-gray-500 dark:text-dark-muted mt-0.5">
              Coordinate, track, and update your work in a flexible Kanban board.
            </p>
          </div>

          {canWrite && (
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Project</span>
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-4 border-b border-gray-200 dark:border-dark-border text-xs font-medium pb-2">
          <button
            onClick={() => setFilter('open')}
            className={`flex items-center space-x-1.5 pb-1 ${
              filter === 'open'
                ? 'text-gray-900 dark:text-white font-bold border-b-2 border-emerald-600'
                : 'text-gray-500 hover:text-gray-700 dark:text-dark-muted'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{openCount} Open</span>
          </button>
          <button
            onClick={() => setFilter('closed')}
            className={`flex items-center space-x-1.5 pb-1 ${
              filter === 'closed'
                ? 'text-gray-900 dark:text-white font-bold border-b-2 border-emerald-600'
                : 'text-gray-500 hover:text-gray-700 dark:text-dark-muted'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{closedCount} Closed</span>
          </button>
        </div>

        {/* Project List */}
        <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl divide-y divide-gray-100 dark:divide-dark-border/40 shadow-sm overflow-hidden">
          {filteredProjects.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <Layers className="w-10 h-10 text-gray-300 dark:text-dark-muted mx-auto" />
              <h3 className="text-sm font-bold text-gray-800 dark:text-white">
                No {filter} projects found
              </h3>
              <p className="text-xs text-gray-500 dark:text-dark-muted max-w-sm mx-auto">
                Organize issues, tasks, and ideas with visual boards to manage releases and sprints.
              </p>
              {canWrite && (
                <button
                  onClick={() => setShowModal(true)}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-500"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create your first project</span>
                </button>
              )}
            </div>
          ) : (
            filteredProjects.map((p) => {
              const total = p.total_cards || 0;
              const done = p.done_cards || 0;
              const percent = total > 0 ? Math.round((done / total) * 100) : 0;

              return (
                <a
                  key={p.id}
                  href={`/${owner}/${repoName}/projects/${p.id}`}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-dark-hover/30 transition-colors block"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-gray-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400">
                        {p.title}
                      </span>
                      {p.is_closed && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 dark:bg-dark-hover dark:text-dark-muted">
                          Closed
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <p className="text-xs text-gray-500 dark:text-dark-muted line-clamp-2">
                        {p.description}
                      </p>
                    )}
                    <p className="text-[11px] text-gray-400">
                      Created by @{p.creator_name || 'user'} • {new Date(p.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="sm:text-right min-w-40 space-y-1">
                    <div className="flex items-center justify-between sm:justify-end space-x-2 text-xs">
                      <span className="font-mono font-bold text-gray-700 dark:text-dark-text">
                        {done}/{total} done
                      </span>
                      <span className="text-gray-400 font-mono text-[11px]">({percent}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-dark-hover h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${percent}%` }}
                      ></div>
                    </div>
                  </div>
                </a>
              );
            })
          )}
        </div>
      </div>

      {/* Create Project Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-surface rounded-xl max-w-md w-full border border-gray-200 dark:border-dark-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-dark-border pb-3">
              <div className="flex items-center space-x-2">
                <FolderPlus className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-bold text-base text-gray-900 dark:text-white">
                  Create new project
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                  Project Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Q4 Sprint Roadmap"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Goals, milestones, or notes for this board..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-gray-200 dark:border-dark-border">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-border/60 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

