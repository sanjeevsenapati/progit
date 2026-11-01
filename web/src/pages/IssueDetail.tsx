import React, { useEffect, useState } from 'react';
import { api, Repository, Issue, Comment, User } from '../lib/api';
import { useAuth } from '../lib/theme';
import { RepoNav } from '../components/RepoNav';
import { showToast } from '../components/ModalDialog';
import { CircleDot, CheckCircle2, Send, UserCheck, Settings, X, ChevronDown } from 'lucide-react';

interface IssueDetailProps {
  owner: string;
  repo: string;
  index: number;
}

export const IssueDetail: React.FC<IssueDetailProps> = ({ owner, repo: repoName, index }) => {
  const { user } = useAuth();
  const [repoData, setRepoData] = useState<Repository | null>(null);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [assignees, setAssignees] = useState<User[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const r = await api.getRepo(owner, repoName);
        setRepoData(r.repository);

        const iss = await api.getIssue(owner, repoName, index);
        setIssue(iss);

        const cList = await api.listComments(owner, repoName, index);
        setComments(cList || []);

        const list = await api.listRepoAssignees(owner, repoName);
        setAssignees(list || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [owner, repoName, index]);

  const handleToggleState = async () => {
    if (!issue) return;
    try {
      const updated = await api.updateIssue(owner, repoName, index, !issue.is_closed);
      setIssue(updated);
      const cList = await api.listComments(owner, repoName, index);
      setComments(cList || []);
      showToast(issue.is_closed ? 'Issue reopened' : 'Issue closed', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to update issue', 'error');
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const cmt = await api.addComment(owner, repoName, index, newComment.trim());
      setComments(prev => [...prev, cmt]);
      setNewComment('');
      showToast('Comment posted', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to post comment', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssign = async (assigneeUsername: string) => {
    if (!issue) return;
    try {
      setAssigning(true);
      const updated = await api.assignIssue(owner, repoName, index, assigneeUsername);
      setIssue(updated);
      const cList = await api.listComments(owner, repoName, index);
      setComments(cList || []);
      setAssigneeMenuOpen(false);
      showToast(assigneeUsername ? `Assigned to @${assigneeUsername}` : 'Issue unassigned', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update assignee', 'error');
    } finally {
      setAssigning(false);
    }
  };

  if (loading && !repoData) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading issue...</div>;
  }

  if (!repoData || !issue) {
    return <div className="py-20 text-center text-sm">Issue not found</div>;
  }

  return (
    <div>
      <RepoNav repo={repoData} activeTab="issues" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Issue Header */}
        <div className="border-b border-gray-200 dark:border-dark-border pb-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {issue.title} <span className="text-gray-400 font-normal">#{issue.index_number}</span>
            </h1>

            {user && (
              <button
                onClick={handleToggleState}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border shadow-sm transition-colors ${
                  issue.is_closed
                    ? 'border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-hover text-gray-800 dark:text-white'
                    : 'border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300'
                }`}
              >
                {issue.is_closed ? 'Reopen issue' : 'Close issue'}
              </button>
            )}
          </div>

          <div className="flex items-center space-x-3 text-xs text-gray-500 dark:text-dark-muted">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold text-white shadow-sm ${
                issue.is_closed ? 'bg-purple-600' : 'bg-emerald-600'
              }`}
            >
              {issue.is_closed ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Closed
                </>
              ) : (
                <>
                  <CircleDot className="w-3.5 h-3.5 mr-1" />
                  Open
                </>
              )}
            </span>
            <span>
              <strong className="text-gray-800 dark:text-gray-200">{issue.poster_name}</strong> opened this issue on{' '}
              {new Date(issue.created_at).toLocaleString()}
            </span>
            <span>•</span>
            <span>{comments.length} comments</span>
          </div>
        </div>

        {/* Content Layout: Main Conversation Thread + Meta Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Conversation Column */}
          <div className="lg:col-span-3 space-y-6">
            {/* Main Description Box */}
            <div className="flex items-start space-x-3">
              <div className="w-9 h-9 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 mt-1">
                {issue.poster_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 dark:bg-dark-hover/40 border-b border-gray-200 dark:border-dark-border text-xs text-gray-500 dark:text-dark-muted flex items-center justify-between">
                  <span>
                    <strong className="text-gray-900 dark:text-white">{issue.poster_name}</strong> commented on{' '}
                    {new Date(issue.created_at).toLocaleString()}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-dark-muted border border-gray-200 dark:border-dark-border">
                    Author
                  </span>
                </div>
                <div className="p-5 text-sm text-gray-800 dark:text-dark-text whitespace-pre-wrap leading-relaxed">
                  {issue.content || 'No description provided.'}
                </div>
              </div>
            </div>

            {/* Subsequent Comments & Events */}
            {comments.map(c => {
              if (c.type === 'close' || c.type === 'reopen' || c.type === 'merge') {
                return (
                  <div key={c.id} className="flex items-center space-x-3 text-xs text-gray-500 dark:text-dark-muted pl-12 py-2">
                    <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                    <span>
                      <strong className="text-gray-800 dark:text-gray-200">{c.poster_name}</strong> {c.type === 'close' ? 'closed this issue' : c.type === 'reopen' ? 'reopened this issue' : c.content} on{' '}
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                  </div>
                );
              }

              if (c.type === 'assign') {
                return (
                  <div key={c.id} className="flex items-center space-x-3 text-xs text-gray-500 dark:text-dark-muted pl-12 py-2">
                    <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <span>
                      <strong className="text-gray-800 dark:text-gray-200">{c.poster_name}</strong> {c.content} on{' '}
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                  </div>
                );
              }

              return (
                <div key={c.id} className="flex items-start space-x-3">
                  <div className="w-9 h-9 rounded-full bg-teal-700 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 mt-1">
                    {c.poster_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
                    <div className="px-4 py-2 bg-gray-50 dark:bg-dark-hover/40 border-b border-gray-200 dark:border-dark-border text-xs text-gray-500 dark:text-dark-muted">
                      <strong className="text-gray-900 dark:text-white">{c.poster_name}</strong> commented on{' '}
                      {new Date(c.created_at).toLocaleString()}
                    </div>
                    <div className="p-4 text-sm text-gray-800 dark:text-dark-text whitespace-pre-wrap leading-relaxed">
                      {c.content}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Add Comment Form */}
            {user ? (
              <div className="flex items-start space-x-3 pt-4 border-t border-gray-200 dark:border-dark-border">
                <div className="w-9 h-9 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 mt-1">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <form onSubmit={handleAddComment} className="flex-1 space-y-3">
                  <textarea
                    rows={4}
                    required
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder="Leave a comment (Markdown supported)..."
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs shadow-sm cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{submitting ? 'Posting...' : 'Comment'}</span>
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-center text-sm">
                <a href="/login" className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
                  Sign in
                </a>{' '}
                to join this conversation.
              </div>
            )}
          </div>

          {/* Right Sidebar: Assignees & Metadata */}
          <div className="space-y-6">
            <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-dark-border/60">
                <span className="text-xs font-bold text-gray-700 dark:text-dark-text uppercase tracking-wider flex items-center space-x-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Assignees</span>
                </span>
                {user && (
                  <div className="relative">
                    <button
                      onClick={() => setAssigneeMenuOpen(!assigneeMenuOpen)}
                      className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
                      title="Edit assignee"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>

                    {assigneeMenuOpen && (
                      <div className="absolute right-0 mt-2 w-64 rounded-xl shadow-2xl py-1.5 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-xs z-50 divide-y divide-gray-100 dark:divide-dark-border/40">
                        <div className="px-3 py-1.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                          Assign collaborator
                        </div>
                        <div className="py-1 max-h-56 overflow-y-auto">
                          {issue.assignee_name && (
                            <button
                              onClick={() => handleAssign('')}
                              disabled={assigning}
                              className="w-full text-left px-3.5 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 font-medium flex items-center space-x-2"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Clear assignee</span>
                            </button>
                          )}
                          {assignees.length === 0 ? (
                            <div className="px-3.5 py-2 text-gray-400 text-[11px]">
                              No collaborators found in this repository.
                            </div>
                          ) : (
                            assignees.map(dev => (
                              <button
                                key={dev.id}
                                onClick={() => handleAssign(dev.username)}
                                disabled={assigning}
                                className={`w-full text-left px-3.5 py-1.5 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors ${
                                  issue.assignee_name === dev.username ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-dark-text'
                                }`}
                              >
                                <div className="flex items-center space-x-2 truncate">
                                  <div className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                                    {dev.username.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="truncate">@{dev.username}</span>
                                </div>
                                {issue.assignee_name === dev.username && (
                                  <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5 rounded font-bold">
                                    Current
                                  </span>
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {issue.assignee_name ? (
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-7 h-7 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs">
                      {issue.assignee_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <a
                        href={`/user/${issue.assignee_name}`}
                        className="font-bold text-xs text-gray-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400"
                      >
                        @{issue.assignee_name}
                      </a>
                    </div>
                  </div>
                  {user && (
                    <button
                      onClick={() => handleAssign('')}
                      className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
                      title="Remove assignee"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-400 pt-1">
                  No one assigned.{' '}
                  {user && (
                    <button
                      onClick={() => setAssigneeMenuOpen(true)}
                      className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
                    >
                      Assign someone
                    </button>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
