import React, { useEffect, useState } from 'react';
import { api, Repository, PullRequest, Comment, FileDiff, PullReview, PullReviewComment } from '../lib/api';
import { useAuth } from '../lib/theme';
import { RepoNav } from '../components/RepoNav';
import { 
  GitPullRequest, 
  GitMerge, 
  CheckCircle2, 
  FileText, 
  MessageSquare, 
  Send, 
  Check, 
  ShieldCheck,
  AlertCircle,
  ChevronDown,
  Plus,
  X,
  Loader2,
  Clock
} from 'lucide-react';

interface PullDetailProps {
  owner: string;
  repo: string;
  index: number;
}

interface ParsedDiffLine {
  type: 'header' | 'add' | 'del' | 'normal';
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

function parseDiffPatch(patch: string): ParsedDiffLine[] {
  if (!patch) return [];
  const lines = patch.split('\n');
  const result: ParsedDiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      result.push({ type: 'header', text: line });
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      result.push({ type: 'add', text: line, newLineNumber: newLine++ });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      result.push({ type: 'del', text: line, oldLineNumber: oldLine++ });
    } else {
      result.push({
        type: 'normal',
        text: line,
        oldLineNumber: oldLine > 0 ? oldLine++ : undefined,
        newLineNumber: newLine > 0 ? newLine++ : undefined,
      });
    }
  }
  return result;
}

export const PullDetail: React.FC<PullDetailProps> = ({ owner, repo: repoName, index }) => {
  const { user } = useAuth();
  const [repoData, setRepoData] = useState<Repository | null>(null);
  const [pull, setPull] = useState<PullRequest | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [reviews, setReviews] = useState<PullReview[]>([]);
  const [reviewComments, setReviewComments] = useState<PullReviewComment[]>([]);
  const [files, setFiles] = useState<FileDiff[]>([]);
  const [activeTab, setActiveTab] = useState<'conversation' | 'files'>('conversation');
  const [newComment, setNewComment] = useState('');
  const [mergeStyle, setMergeStyle] = useState<'merge' | 'squash' | 'rebase'>('merge');
  const [merging, setMerging] = useState(false);
  const [loading, setLoading] = useState(true);

  // Review changes panel state
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const [reviewState, setReviewState] = useState<'COMMENTED' | 'APPROVED' | 'CHANGES_REQUESTED'>('COMMENTED');
  const [reviewContent, setReviewContent] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Inline commenting state
  const [activeInlineComment, setActiveInlineComment] = useState<{ file: string; line: number } | null>(null);
  const [inlineContent, setInlineContent] = useState('');
  const [submittingInline, setSubmittingInline] = useState(false);

  const loadData = async () => {
    try {
      const [r, p, cList, revList, revComments, diffData] = await Promise.all([
        api.getRepo(owner, repoName),
        api.getPull(owner, repoName, index),
        api.listComments(owner, repoName, index).catch(() => []),
        api.listPullReviews(owner, repoName, index).catch(() => []),
        api.listPullReviewComments(owner, repoName, index).catch(() => []),
        api.getPullDiff(owner, repoName, index).catch(() => ({ base_branch: '', head_branch: '', files: [], mergeable: true })),
      ]);

      setRepoData(r.repository);
      setPull(p);
      setComments(cList || []);
      setReviews(revList || []);
      setReviewComments(revComments || []);
      setFiles(diffData.files || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [owner, repoName, index]);

  const handleMerge = async () => {
    if (!confirm(`Are you sure you want to perform a ${mergeStyle} merge?`)) return;
    setMerging(true);
    try {
      const res = await api.mergePull(owner, repoName, index, mergeStyle);
      alert(`Pull request merged successfully (commit ${res.merge_commit_sha.substring(0, 7)})`);
      window.location.reload();
    } catch (err: any) {
      alert(`Merge failed: ${err.message}`);
    } finally {
      setMerging(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    try {
      const cmt = await api.addComment(owner, repoName, index, newComment.trim());
      setComments(prev => [...prev, cmt]);
      setNewComment('');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('Please log in to submit a review');
      return;
    }
    setSubmittingReview(true);
    try {
      const rev = await api.createPullReview(owner, repoName, index, {
        state: reviewState,
        content: reviewContent.trim(),
      });
      setReviews(prev => [...prev, rev]);
      setReviewContent('');
      setShowReviewPanel(false);
      alert(`Review submitted as ${reviewState}`);
    } catch (err: any) {
      alert(`Failed to submit review: ${err.message}`);
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleAddInlineComment = async (filePath: string, lineNumber: number, hunkText: string) => {
    if (!inlineContent.trim()) return;
    setSubmittingInline(true);
    try {
      const cmt = await api.addPullReviewComment(owner, repoName, index, {
        file_path: filePath,
        line_number: lineNumber,
        diff_hunk: hunkText,
        content: inlineContent.trim(),
      });
      setReviewComments(prev => [...prev, cmt]);
      setInlineContent('');
      setActiveInlineComment(null);
    } catch (err: any) {
      alert(`Failed to add comment: ${err.message}`);
    } finally {
      setSubmittingInline(false);
    }
  };

  if (loading && !repoData) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading pull request...</div>;
  }

  if (!repoData || !pull || !pull.issue) {
    return <div className="py-20 text-center text-sm">Pull request not found</div>;
  }

  const issue = pull.issue;

  // Review calculations
  const approvals = reviews.filter(r => r.state === 'APPROVED');
  const changeRequests = reviews.filter(r => r.state === 'CHANGES_REQUESTED');
  const totalAdditions = files.reduce((acc, f) => acc + (f.additions || 0), 0);
  const totalDeletions = files.reduce((acc, f) => acc + (f.deletions || 0), 0);

  return (
    <div>
      <RepoNav repo={repoData} activeTab="pulls" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-dark-border pb-5 space-y-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {issue.title} <span className="text-gray-400 font-normal">#{issue.index_number}</span>
          </h1>

          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-dark-muted">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold text-white shadow-sm ${
                pull.is_merged
                  ? 'bg-purple-600'
                  : issue.is_closed
                  ? 'bg-red-600'
                  : 'bg-emerald-600'
              }`}
            >
              {pull.is_merged ? (
                <>
                  <GitMerge className="w-3.5 h-3.5 mr-1" />
                  Merged
                </>
              ) : issue.is_closed ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Closed
                </>
              ) : (
                <>
                  <GitPullRequest className="w-3.5 h-3.5 mr-1" />
                  Open
                </>
              )}
            </span>

            <span>
              <strong className="text-gray-800 dark:text-gray-200">{issue.poster_name}</strong> wants to merge commits from{' '}
              <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-dark-hover font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                {pull.head_branch}
              </code>{' '}
              into{' '}
              <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-dark-hover font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                {pull.base_branch}
              </code>
            </span>
          </div>
        </div>

        {/* Tab switch: Conversation / Files Changed */}
        <div className="flex space-x-4 border-b border-gray-200 dark:border-dark-border text-sm font-semibold">
          <button
            onClick={() => setActiveTab('conversation')}
            className={`pb-2 border-b-2 flex items-center space-x-1.5 transition-colors ${
              activeTab === 'conversation'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-dark-text'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Conversation</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-xs bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-dark-muted">
              {comments.length + reviews.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('files')}
            className={`pb-2 border-b-2 flex items-center space-x-1.5 transition-colors ${
              activeTab === 'files'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-dark-text'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Files Changed</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-xs bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-dark-muted">
              {files.length}
            </span>
          </button>
        </div>

        {activeTab === 'conversation' ? (
          <div className="space-y-6">
            {/* Original description */}
            <div className="flex items-start space-x-3">
              <div className="w-9 h-9 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 mt-1">
                {issue.poster_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 dark:bg-dark-hover/40 border-b border-gray-200 dark:border-dark-border text-xs text-gray-500 dark:text-dark-muted">
                  <strong className="text-gray-900 dark:text-white">{issue.poster_name}</strong> opened this pull request
                </div>
                <div className="p-4 text-sm text-gray-800 dark:text-dark-text whitespace-pre-wrap leading-relaxed">
                  {issue.content || 'No description provided.'}
                </div>
              </div>
            </div>

            {/* Structured Reviews */}
            {reviews.map((rev) => {
              const isApprove = rev.state === 'APPROVED';
              const isChanges = rev.state === 'CHANGES_REQUESTED';
              return (
                <div key={`rev-${rev.id}`} className="flex items-start space-x-3">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 mt-1 text-white ${
                      isApprove ? 'bg-emerald-600' : isChanges ? 'bg-red-600' : 'bg-gray-600'
                    }`}
                  >
                    {isApprove ? <Check className="w-4 h-4" /> : isChanges ? <AlertCircle className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                  </div>
                  <div
                    className={`flex-1 rounded-xl border shadow-sm overflow-hidden bg-white dark:bg-dark-surface ${
                      isApprove
                        ? 'border-emerald-300 dark:border-emerald-800/80'
                        : isChanges
                        ? 'border-red-300 dark:border-red-800/80'
                        : 'border-gray-200 dark:border-dark-border'
                    }`}
                  >
                    <div
                      className={`px-4 py-2 border-b flex items-center justify-between text-xs ${
                        isApprove
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
                          : isChanges
                          ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/60 text-red-800 dark:text-red-300'
                          : 'bg-gray-50 dark:bg-dark-hover/40 border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-muted'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5 font-semibold">
                        <span>{rev.reviewer_name}</span>
                        <span>
                          {isApprove ? 'approved these changes' : isChanges ? 'requested changes' : 'submitted a review'}
                        </span>
                      </div>
                      <span className="text-[11px] opacity-75">
                        {new Date(rev.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {rev.content && (
                      <div className="p-4 text-sm text-gray-800 dark:text-dark-text whitespace-pre-wrap leading-relaxed">
                        {rev.content}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Standard Comments */}
            {comments.map((c) => (
              <div key={c.id} className="flex items-start space-x-3">
                <div className="w-9 h-9 rounded-full bg-teal-700 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 mt-1">
                  {c.poster_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
                  <div className="px-4 py-2 bg-gray-50 dark:bg-dark-hover/40 border-b border-gray-200 dark:border-dark-border text-xs text-gray-500 dark:text-dark-muted flex justify-between">
                    <div>
                      <strong className="text-gray-900 dark:text-white">{c.poster_name}</strong> commented
                    </div>
                    <span>{new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="p-4 text-sm text-gray-800 dark:text-dark-text whitespace-pre-wrap">
                    {c.content}
                  </div>
                </div>
              </div>
            ))}

            {/* Merge Action Box */}
            {!pull.is_merged && !issue.is_closed && (
              <div className="p-5 rounded-xl border border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-gray-900 dark:text-white">This branch has no conflicts with the base branch</h3>
                    <p className="text-xs text-gray-500 dark:text-dark-muted">Merging can be performed automatically.</p>
                  </div>
                </div>

                {/* Review status summary inside merge box */}
                <div className="px-3 py-2 rounded-lg bg-white/70 dark:bg-dark-surface/60 border border-emerald-200 dark:border-emerald-900/60 text-xs flex flex-wrap items-center gap-3">
                  {changeRequests.length > 0 ? (
                    <div className="flex items-center text-red-600 dark:text-red-400 font-semibold space-x-1.5">
                      <AlertCircle className="w-4 h-4" />
                      <span>Changes requested by {changeRequests.map(r => r.reviewer_name).join(', ')}</span>
                    </div>
                  ) : approvals.length > 0 ? (
                    <div className="flex items-center text-emerald-600 dark:text-emerald-400 font-semibold space-x-1.5">
                      <Check className="w-4 h-4" />
                      <span>Approved by {approvals.map(r => r.reviewer_name).join(', ')}</span>
                    </div>
                  ) : (
                    <div className="flex items-center text-gray-500 dark:text-dark-muted space-x-1.5">
                      <Clock className="w-4 h-4" />
                      <span>No reviews yet</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 border-t border-emerald-200 dark:border-emerald-900/50">
                  <select
                    value={mergeStyle}
                    onChange={e => setMergeStyle(e.target.value as any)}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface text-xs font-semibold text-gray-800 dark:text-white"
                  >
                    <option value="merge">Create a merge commit</option>
                    <option value="squash">Squash and merge</option>
                    <option value="rebase">Rebase and merge</option>
                  </select>

                  <button
                    onClick={handleMerge}
                    disabled={merging}
                    className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
                  >
                    {merging ? 'Merging commits...' : `Merge pull request (${mergeStyle})`}
                  </button>
                </div>
              </div>
            )}

            {/* Comment box */}
            {user && (
              <form onSubmit={handleAddComment} className="flex-1 space-y-3 pt-4 border-t border-gray-200 dark:border-dark-border">
                <textarea
                  rows={4}
                  required
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Leave a comment on this pull request..."
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm cursor-pointer"
                >
                  Comment
                </button>
              </form>
            )}
          </div>
        ) : (
          /* Files Changed / Diff View with Review Panel */
          <div className="space-y-6">
            {/* Top Review Bar */}
            <div className="flex items-center justify-between p-3.5 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl shadow-sm">
              <div className="text-xs text-gray-600 dark:text-dark-muted font-medium">
                Showing <strong className="text-gray-900 dark:text-white">{files.length} changed file{files.length === 1 ? '' : 's'}</strong> with{' '}
                <strong className="text-emerald-600">+{totalAdditions}</strong> and{' '}
                <strong className="text-red-500">-{totalDeletions}</strong> lines
              </div>

              {/* Review Changes Button & Popover */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowReviewPanel(!showReviewPanel)}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Review changes</span>
                  <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
                </button>

                {showReviewPanel && (
                  <div className="absolute right-0 mt-2 w-96 z-40 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl shadow-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-gray-200 dark:border-dark-border">
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white">Submit your review</h4>
                      <button
                        type="button"
                        onClick={() => setShowReviewPanel(false)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleSubmitReview} className="space-y-4">
                      <div>
                        <textarea
                          rows={3}
                          value={reviewContent}
                          onChange={e => setReviewContent(e.target.value)}
                          placeholder="Leave a comment or review summary..."
                          className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div className="space-y-2 text-xs">
                        <label className="flex items-start space-x-2.5 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-dark-border">
                          <input
                            type="radio"
                            name="review_state"
                            value="COMMENTED"
                            checked={reviewState === 'COMMENTED'}
                            onChange={() => setReviewState('COMMENTED')}
                            className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                          />
                          <div>
                            <span className="font-semibold text-gray-800 dark:text-white">Comment</span>
                            <p className="text-[11px] text-gray-500 dark:text-dark-muted">Submit general feedback without explicit approval.</p>
                          </div>
                        </label>

                        <label className="flex items-start space-x-2.5 p-2 rounded-lg hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 cursor-pointer border border-transparent hover:border-emerald-200 dark:hover:border-emerald-900/40">
                          <input
                            type="radio"
                            name="review_state"
                            value="APPROVED"
                            checked={reviewState === 'APPROVED'}
                            onChange={() => setReviewState('APPROVED')}
                            className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                          />
                          <div>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Approve</span>
                            <p className="text-[11px] text-gray-500 dark:text-dark-muted">Submit feedback and approve merging these changes.</p>
                          </div>
                        </label>

                        <label className="flex items-start space-x-2.5 p-2 rounded-lg hover:bg-red-50/50 dark:hover:bg-red-950/20 cursor-pointer border border-transparent hover:border-red-200 dark:hover:border-red-900/40">
                          <input
                            type="radio"
                            name="review_state"
                            value="CHANGES_REQUESTED"
                            checked={reviewState === 'CHANGES_REQUESTED'}
                            onChange={() => setReviewState('CHANGES_REQUESTED')}
                            className="mt-0.5 text-red-600 focus:ring-red-500"
                          />
                          <div>
                            <span className="font-semibold text-red-600 dark:text-red-400">Request changes</span>
                            <p className="text-[11px] text-gray-500 dark:text-dark-muted">Submit feedback that should be addressed before merging.</p>
                          </div>
                        </label>
                      </div>

                      <div className="pt-2 border-t border-gray-200 dark:border-dark-border flex items-center justify-end space-x-2">
                        <button
                          type="button"
                          onClick={() => setShowReviewPanel(false)}
                          className="px-3 py-1.5 text-xs text-gray-600 dark:text-dark-muted hover:text-gray-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={submittingReview}
                          className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50 cursor-pointer flex items-center space-x-1"
                        >
                          {submittingReview && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                          <span>Submit review</span>
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </div>

            {/* Diffs with line-by-line commenting */}
            {files.map((file, idx) => {
              const filePath = file.new_path || file.old_path;
              const parsedLines = parseDiffPatch(file.patch);

              return (
                <div key={idx} className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 dark:bg-dark-hover/40 border-b border-gray-200 dark:border-dark-border flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <span>{filePath}</span>
                    </span>
                    <span className="text-gray-400 font-sans">
                      <span className="text-emerald-600">+{file.additions}</span> <span className="text-red-500">-{file.deletions}</span>
                    </span>
                  </div>

                  <div className="overflow-x-auto text-xs font-mono bg-gray-950 text-gray-100">
                    <table className="w-full border-collapse">
                      <tbody>
                        {parsedLines.map((line, lIdx) => {
                          const targetLineNum = line.newLineNumber || line.oldLineNumber || 0;
                          const lineComments = reviewComments.filter(
                            rc => rc.file_path === filePath && rc.line_number === targetLineNum
                          );
                          const isReplying =
                            activeInlineComment?.file === filePath &&
                            activeInlineComment?.line === targetLineNum;

                          let rowBg = '';
                          let textClr = 'text-gray-300';
                          if (line.type === 'header') {
                            rowBg = 'bg-blue-950/40 text-blue-300';
                            textClr = 'text-blue-300';
                          } else if (line.type === 'add') {
                            rowBg = 'bg-emerald-950/40 text-emerald-300';
                            textClr = 'text-emerald-300';
                          } else if (line.type === 'del') {
                            rowBg = 'bg-red-950/40 text-red-300';
                            textClr = 'text-red-300';
                          }

                          return (
                            <React.Fragment key={lIdx}>
                              <tr className={`group hover:bg-gray-800/60 ${rowBg}`}>
                                {/* Action / Add comment button */}
                                <td className="w-8 py-0.5 px-1 text-center select-none">
                                  {user && line.type !== 'header' && targetLineNum > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveInlineComment({ file: filePath, line: targetLineNum });
                                        setInlineContent('');
                                      }}
                                      title="Add line comment"
                                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-500 transition-opacity"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  )}
                                </td>

                                {/* Old Line Number */}
                                <td className="w-10 py-0.5 px-2 text-right select-none text-gray-500 border-r border-gray-800">
                                  {line.oldLineNumber || ''}
                                </td>

                                {/* New Line Number */}
                                <td className="w-10 py-0.5 px-2 text-right select-none text-gray-500 border-r border-gray-800">
                                  {line.newLineNumber || ''}
                                </td>

                                {/* Diff Line Content */}
                                <td className={`py-0.5 px-3 whitespace-pre font-mono leading-relaxed ${textClr}`}>
                                  {line.text}
                                </td>
                              </tr>

                              {/* Render any existing review comments under this line */}
                              {lineComments.map((rc) => (
                                <tr key={`rc-${rc.id}`} className="bg-gray-900 border-y border-gray-800">
                                  <td colSpan={4} className="p-3 pl-16">
                                    <div className="bg-white dark:bg-dark-surface border border-emerald-500/30 rounded-lg p-3 text-xs shadow-md space-y-1.5 font-sans">
                                      <div className="flex items-center justify-between text-gray-500 dark:text-dark-muted">
                                        <div className="flex items-center space-x-2">
                                          <div className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-[10px]">
                                            {rc.user_name.charAt(0).toUpperCase()}
                                          </div>
                                          <strong className="text-gray-900 dark:text-white">{rc.user_name}</strong>
                                          <span>line {rc.line_number}</span>
                                        </div>
                                        <span className="text-[10px]">{new Date(rc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                      </div>
                                      <div className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                        {rc.content}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ))}

                              {/* Inline Comment Box */}
                              {isReplying && (
                                <tr className="bg-gray-900 border-y border-emerald-600/40">
                                  <td colSpan={4} className="p-3 pl-16">
                                    <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-lg p-3 shadow-lg space-y-2 font-sans">
                                      <div className="flex items-center justify-between text-xs font-semibold text-gray-800 dark:text-white">
                                        <span>Add comment on line {targetLineNum}</span>
                                        <button
                                          type="button"
                                          onClick={() => setActiveInlineComment(null)}
                                          className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                      <textarea
                                        rows={2}
                                        value={inlineContent}
                                        onChange={e => setInlineContent(e.target.value)}
                                        placeholder="Leave a comment on this line..."
                                        className="w-full px-2.5 py-1.5 text-xs rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                                      />
                                      <div className="flex items-center justify-end space-x-2">
                                        <button
                                          type="button"
                                          onClick={() => setActiveInlineComment(null)}
                                          className="px-2.5 py-1 text-xs text-gray-600 dark:text-dark-muted hover:text-gray-800"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          disabled={submittingInline || !inlineContent.trim()}
                                          onClick={() => handleAddInlineComment(filePath, targetLineNum, line.text)}
                                          className="px-3 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded disabled:opacity-50 cursor-pointer flex items-center space-x-1"
                                        >
                                          {submittingInline && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                                          <span>Add comment</span>
                                        </button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};


