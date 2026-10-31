import React, { useEffect, useState } from 'react';
import { api, Repository, Issue, Comment } from '../lib/api';
import { useAuth } from '../lib/theme';
import { RepoNav } from '../components/RepoNav';
import { showToast } from '../components/ModalDialog';
import { CircleDot, CheckCircle2, MessageSquare, Send } from 'lucide-react';

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
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const r = await api.getRepo(owner, repoName);
        setRepoData(r.repository);

        const iss = await api.getIssue(owner, repoName, index);
        setIssue(iss);

        const cList = await api.listComments(owner, repoName, index);
        setComments(cList || []);
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

  if (loading && !repoData) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading issue...</div>;
  }

  if (!repoData || !issue) {
    return <div className="py-20 text-center text-sm">Issue not found</div>;
  }

  return (
    <div>
      <RepoNav repo={repoData} activeTab="issues" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
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

        {/* Conversation Thread */}
        <div className="space-y-6">
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

          {/* Subsequent Comments */}
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
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs shadow-sm"
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
      </div>
    </div>
  );
};

