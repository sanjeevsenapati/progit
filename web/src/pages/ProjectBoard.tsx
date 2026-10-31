import React, { useEffect, useState } from 'react';
import { api, Repository, Project, ProjectColumn, ProjectCard, Issue } from '../lib/api';
import { RepoNav } from '../components/RepoNav';
import { showToast, showModalConfirm } from '../components/ModalDialog';
import { 
  Kanban, 
  Plus, 
  X, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  CircleDot, 
  CheckCircle2, 
  Lock, 
  Unlock, 
  FileText, 
  Check, 
  MoveRight 
} from 'lucide-react';

interface ProjectBoardProps {
  owner: string;
  repo: string;
  projectId: number;
}

export const ProjectBoard: React.FC<ProjectBoardProps> = ({ owner, repo: repoName, projectId }) => {
  const [repoData, setRepoData] = useState<Repository | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [canWrite, setCanWrite] = useState(false);

  // New column state
  const [newColTitle, setNewColTitle] = useState('');
  const [showAddCol, setShowAddCol] = useState(false);

  // New card modal
  const [targetColumnId, setTargetColumnId] = useState<number | null>(null);
  const [cardType, setCardType] = useState<'note' | 'issue'>('note');
  const [cardNote, setCardNote] = useState('');
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [addingCard, setAddingCard] = useState(false);

  useEffect(() => {
    loadBoard();
  }, [owner, repoName, projectId]);

  const loadBoard = async () => {
    try {
      setLoading(true);
      const r = await api.getRepo(owner, repoName);
      setRepoData(r.repository);
      setCanWrite(Boolean(r.can_write || r.permissions?.write));

      const p = await api.getProject(owner, repoName, projectId);
      setProject(p);

      const iss = await api.listIssues(owner, repoName, 'open');
      setIssues(iss || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColTitle.trim()) return;
    try {
      const order = (project?.columns?.length || 0) + 1;
      await api.createProjectColumn(owner, repoName, projectId, {
        title: newColTitle.trim(),
        order_num: order,
      });
      setNewColTitle('');
      setShowAddCol(false);
      showToast('Column created successfully', 'success');
      await loadBoard();
    } catch (err: any) {
      showToast(err.message || 'Failed to create column', 'error');
    }
  };

  const handleDeleteColumn = async (columnId: number) => {
    const confirmed = await showModalConfirm({
      title: 'Delete Column',
      message: 'Are you sure you want to delete this column and all its cards? This cannot be undone.',
      confirmText: 'Delete column',
      cancelText: 'Cancel',
      isDanger: true,
    });
    if (!confirmed) return;

    try {
      await api.deleteProjectColumn(owner, repoName, projectId, columnId);
      showToast('Column deleted', 'info');
      await loadBoard();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete column', 'error');
    }
  };

  const handleCreateCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetColumnId) return;

    try {
      setAddingCard(true);
      const content = cardType === 'note' ? cardNote.trim() : '';
      const issueId = cardType === 'issue' && selectedIssueId ? selectedIssueId : undefined;

      await api.createProjectCard(owner, repoName, projectId, {
        column_id: targetColumnId,
        content,
        issue_id: issueId,
        order_num: 1,
      });

      setTargetColumnId(null);
      setCardNote('');
      setSelectedIssueId(null);
      showToast('Card added to column', 'success');
      await loadBoard();
    } catch (err: any) {
      showToast(err.message || 'Failed to add card', 'error');
    } finally {
      setAddingCard(false);
    }
  };

  const handleMoveCard = async (cardId: number, targetColId: number) => {
    try {
      await api.moveProjectCard(owner, repoName, projectId, cardId, {
        column_id: targetColId,
        order_num: 1,
      });
      await loadBoard();
    } catch (err: any) {
      showToast(err.message || 'Failed to move card', 'error');
    }
  };

  const handleDeleteCard = async (cardId: number) => {
    const confirmed = await showModalConfirm({
      title: 'Delete Card',
      message: 'Are you sure you want to delete this card?',
      confirmText: 'Delete card',
      cancelText: 'Cancel',
      isDanger: true,
    });
    if (!confirmed) return;

    try {
      await api.deleteProjectCard(owner, repoName, projectId, cardId);
      showToast('Card deleted', 'info');
      await loadBoard();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete card', 'error');
    }
  };

  const handleToggleClose = async () => {
    if (!project) return;
    try {
      await api.updateProject(owner, repoName, projectId, {
        title: project.title,
        description: project.description,
        is_closed: !project.is_closed,
      });
      showToast(project.is_closed ? 'Project reopened' : 'Project closed', 'info');
      await loadBoard();
    } catch (err: any) {
      showToast(err.message || 'Failed to update project status', 'error');
    }
  };

  if (loading && !project) {
    return (
      <div className="py-20 text-center text-sm text-gray-400">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        Loading project board...
      </div>
    );
  }

  if (!repoData || !project) {
    return <div className="py-20 text-center text-sm">Project not found</div>;
  }

  const columns = project.columns || [];

  return (
    <div className="min-h-screen flex flex-col">
      <RepoNav repo={repoData} activeTab="projects" />

      {/* Project Board Header */}
      <div className="bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <a
              href={`/${owner}/${repoName}/projects`}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-dark-hover"
              title="Back to projects"
            >
              <ChevronLeft className="w-5 h-5" />
            </a>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base font-bold text-gray-900 dark:text-white">
                  {project.title}
                </h1>
                {project.is_closed && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 dark:bg-dark-hover dark:text-dark-muted">
                    Closed
                  </span>
                )}
              </div>
              {project.description && (
                <p className="text-xs text-gray-500 dark:text-dark-muted">
                  {project.description}
                </p>
              )}
            </div>
          </div>

          {canWrite && (
            <div className="flex items-center space-x-2">
              <button
                onClick={handleToggleClose}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text text-xs font-semibold shadow-sm transition-colors"
              >
                {project.is_closed ? (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Reopen Project</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Close Project</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Kanban Board Columns Area */}
      <div className="flex-1 overflow-x-auto p-6 bg-gray-50 dark:bg-dark-bg">
        <div className="inline-flex items-start space-x-4 min-h-[500px]">
          {columns.map((col, colIdx) => {
            const cards = col.cards || [];
            return (
              <div
                key={col.id}
                className="w-72 flex-shrink-0 bg-gray-100 dark:bg-dark-surface/90 rounded-xl border border-gray-200 dark:border-dark-border flex flex-col max-h-[calc(100vh-220px)] shadow-sm"
              >
                {/* Column Header */}
                <div className="p-3 border-b border-gray-200 dark:border-dark-border/60 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-xs text-gray-800 dark:text-white">
                      {col.title}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-gray-200 dark:bg-dark-hover text-gray-700 dark:text-dark-muted">
                      {cards.length}
                    </span>
                  </div>

                  {canWrite && (
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => setTargetColumnId(col.id)}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-dark-hover text-gray-500 dark:text-dark-muted"
                        title="Add card"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteColumn(col.id)}
                        className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500"
                        title="Delete column"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Cards Container */}
                <div className="p-2 space-y-2.5 overflow-y-auto flex-1">
                  {cards.length === 0 ? (
                    <div className="py-6 text-center text-[11px] text-gray-400">
                      No cards in this column
                    </div>
                  ) : (
                    cards.map((card) => (
                      <div
                        key={card.id}
                        className="p-3 bg-white dark:bg-dark-surface rounded-lg border border-gray-200 dark:border-dark-border shadow-xs hover:shadow-sm transition-shadow space-y-2 group"
                      >
                        {card.issue ? (
                          <div className="space-y-1">
                            <div className="flex items-center space-x-1.5 text-emerald-600 dark:text-emerald-400">
                              <CircleDot className="w-3.5 h-3.5 flex-shrink-0" />
                              <a
                                href={`/${owner}/${repoName}/issues/${card.issue.index_number}`}
                                className="font-bold text-xs hover:underline text-gray-900 dark:text-white line-clamp-2"
                              >
                                #{card.issue.index_number} {card.issue.title}
                              </a>
                            </div>
                            <span className="text-[10px] text-gray-400 block">
                              Opened by @{card.issue.poster_name}
                            </span>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-800 dark:text-white whitespace-pre-wrap font-sans">
                            {card.content}
                          </div>
                        )}

                        {/* Card Footer / Move Actions */}
                        {canWrite && (
                          <div className="pt-1.5 border-t border-gray-100 dark:border-dark-border/40 flex items-center justify-between text-[11px] text-gray-400">
                            <div className="flex items-center space-x-1">
                              {colIdx > 0 && (
                                <button
                                  onClick={() => handleMoveCard(card.id, columns[colIdx - 1].id)}
                                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-hover hover:text-gray-700"
                                  title={`Move to ${columns[colIdx - 1].title}`}
                                >
                                  <ChevronLeft className="w-3 h-3" />
                                </button>
                              )}
                              {colIdx < columns.length - 1 && (
                                <button
                                  onClick={() => handleMoveCard(card.id, columns[colIdx + 1].id)}
                                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-hover hover:text-gray-700"
                                  title={`Move to ${columns[colIdx + 1].title}`}
                                >
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              )}
                            </div>

                            <button
                              onClick={() => handleDeleteCard(card.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 rounded transition-opacity"
                              title="Delete card"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Add Card Footer */}
                {canWrite && (
                  <div className="p-2 border-t border-gray-200 dark:border-dark-border/60">
                    <button
                      onClick={() => setTargetColumnId(col.id)}
                      className="w-full flex items-center justify-center space-x-1 py-1.5 rounded-lg text-xs font-semibold text-gray-600 dark:text-dark-muted hover:bg-gray-200 dark:hover:bg-dark-hover transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add card</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add Column Button */}
          {canWrite && (
            <div className="w-72 flex-shrink-0">
              {showAddCol ? (
                <form
                  onSubmit={handleCreateColumn}
                  className="p-3 bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm space-y-2"
                >
                  <input
                    type="text"
                    required
                    autoFocus
                    value={newColTitle}
                    onChange={(e) => setNewColTitle(e.target.value)}
                    placeholder="Column title (e.g. In Review)..."
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <div className="flex items-center justify-end space-x-1.5">
                    <button
                      type="button"
                      onClick={() => setShowAddCol(false)}
                      className="px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-dark-hover rounded"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded shadow-sm"
                    >
                      Add
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setShowAddCol(true)}
                  className="w-full flex items-center justify-center space-x-1.5 py-3 rounded-xl border border-dashed border-gray-300 dark:border-dark-border text-xs font-bold text-gray-500 dark:text-dark-muted hover:border-emerald-500 hover:text-emerald-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Column</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Card Modal */}
      {targetColumnId !== null && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-surface rounded-xl max-w-md w-full border border-gray-200 dark:border-dark-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-dark-border pb-3">
              <h3 className="font-bold text-base text-gray-900 dark:text-white">
                Add card to column
              </h3>
              <button
                onClick={() => setTargetColumnId(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Switch Note vs Issue */}
            <div className="flex rounded-lg border border-gray-200 dark:border-dark-border p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setCardType('note')}
                className={`flex-1 py-1.5 rounded-md transition-colors ${
                  cardType === 'note'
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'text-gray-600 dark:text-dark-muted'
                }`}
              >
                Note / Task
              </button>
              <button
                type="button"
                onClick={() => setCardType('issue')}
                className={`flex-1 py-1.5 rounded-md transition-colors ${
                  cardType === 'issue'
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'text-gray-600 dark:text-dark-muted'
                }`}
              >
                Link Issue
              </button>
            </div>

            <form onSubmit={handleCreateCard} className="space-y-4">
              {cardType === 'note' ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                    Card note / task description *
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={cardNote}
                    onChange={(e) => setCardNote(e.target.value)}
                    placeholder="Write a task, note, or reminder..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                    Select open issue *
                  </label>
                  {issues.length === 0 ? (
                    <p className="text-xs text-gray-400 py-2">
                      No open issues found in this repository.
                    </p>
                  ) : (
                    <select
                      required
                      value={selectedIssueId || ''}
                      onChange={(e) => setSelectedIssueId(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">-- Choose an issue --</option>
                      {issues.map((iss) => (
                        <option key={iss.id} value={iss.id}>
                          #{iss.index_number} {iss.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-3 border-t border-gray-200 dark:border-dark-border">
                <button
                  type="button"
                  onClick={() => setTargetColumnId(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-border/60 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingCard || (cardType === 'issue' && !selectedIssueId)}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {addingCard ? 'Adding...' : 'Add Card'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
