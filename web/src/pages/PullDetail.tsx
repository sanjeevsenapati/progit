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
  Clock,
  Trash2,
  Columns,
  Split
} from 'lucide-react';
import { detectLanguage, highlightCode } from '../lib/codeEditor';

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

interface SplitRow {
  header?: string;
  left?: { lineNum?: number; text: string; type: 'del' | 'normal' };
  right?: { lineNum?: number; text: string; type: 'add' | 'normal' };
}

function buildSplitRows(lines: ParsedDiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let delQueue: ParsedDiffLine[] = [];

  const flushDels = () => {
    for (const d of delQueue) {
      rows.push({
        left: { lineNum: d.oldLineNumber, text: d.text, type: 'del' },
      });
    }
    delQueue = [];
  };

  for (const line of lines) {
    if (line.type === 'header') {
      flushDels();
      rows.push({ header: line.text });
    } else if (line.type === 'normal') {
      flushDels();
      rows.push({
        left: { lineNum: line.oldLineNumber, text: line.text, type: 'normal' },
        right: { lineNum: line.newLineNumber, text: line.text, type: 'normal' },
      });
    } else if (line.type === 'del') {
      delQueue.push(line);
    } else if (line.type === 'add') {
      if (delQueue.length > 0) {
        const d = delQueue.shift()!;
        rows.push({
          left: { lineNum: d.oldLineNumber, text: d.text, type: 'del' },
          right: { lineNum: line.newLineNumber, text: line.text, type: 'add' },
        });
      } else {
        rows.push({
          right: { lineNum: line.newLineNumber, text: line.text, type: 'add' },
        });
      }
    }
  }
  flushDels();
  return rows;
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
  const [repoData, setRepoData] = useState<Repository | null>(() => api.getCachedRepo(owner, repoName)?.repository || null);
  const [canWriteRepo, setCanWriteRepo] = useState(false);
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
  const [showMergeConfirmModal, setShowMergeConfirmModal] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Review changes panel state
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const [reviewState, setReviewState] = useState<'COMMENTED' | 'APPROVED' | 'CHANGES_REQUESTED'>('COMMENTED');
  const [reviewContent, setReviewContent] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Split vs Unified diff mode & post-merge branch deletion
  const [diffViewMode, setDiffViewMode] = useState<'unified' | 'split'>('unified');
  const [deletingBranch, setDeletingBranch] = useState(false);
  const [branchDeleted, setBranchDeleted] = useState(false);

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
      setCanWriteRepo(Boolean(r.can_write || r.permissions?.write || r.permissions?.admin));
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
    setShowMergeConfirmModal(false);
    setMerging(true);
    try {
      const res = await api.mergePull(owner, repoName, index, mergeStyle);
      showToast(`Pull request merged successfully (commit ${res.merge_commit_sha.substring(0, 7)})`, 'success');
      loadData();
    } catch (err: any) {
      showToast(`Merge failed: ${err.message}`, 'error');
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
      showToast('Comment posted', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      showToast('Please log in to submit a review', 'error');
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
      showToast(`Review submitted as ${reviewState}`, 'success');
    } catch (err: any) {
      showToast(`Failed to submit review: ${err.message}`, 'error');
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
      showToast('Line comment added', 'success');
    } catch (err: any) {
      showToast(`Failed to add comment: ${err.message}`, 'error');
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

  // Permission Check: pull request & merge options visible to logged in repo members or requester
  const isRepoMember = Boolean(
    user && (
      canWriteRepo ||
      repoData?.owner_id === user.id ||
      repoData?.owner_name === user.username
    )
  );

  const isRequester = Boolean(
    user && (
      issue?.poster_id === user.id ||
      issue?.poster_name === user.username ||
      pull?.issue?.poster_id === user.id ||
      pull?.issue?.poster_name === user.username
    )
  );

  const canMerge = Boolean(user && (isRepoMember || isRequester));

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
              canMerge ? (
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
                      onClick={() => setShowMergeConfirmModal(true)}
                      disabled={merging}
                      className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
                    >
                      {merging ? 'Merging commits...' : `Merge pull request (${mergeStyle})`}
                    </button>
                  </div>
                </div>
              ) : !user ? (
                <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50/70 dark:bg-dark-surface shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center space-x-2.5 text-gray-600 dark:text-dark-muted">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Pull requests are open for public viewing. Sign in to merge or review this pull request.</span>
                  </div>
                  <a
                    href="/login"
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs text-center self-start sm:self-auto transition-colors"
                  >
                    Sign in to merge
                  </a>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50/70 dark:bg-dark-surface text-xs text-gray-500 dark:text-dark-muted flex items-center space-x-2.5">
                  <AlertCircle className="w-4 h-4 text-gray-400 shrink-0" />
                  <span>Merge options are restricted to repository members and the pull request author.</span>
                </div>
              )
            )}

            {/* Post-Merge: Delete Branch Banner */}
            {pull.is_merged && (
              <div className="p-4 rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-950/20 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center flex-shrink-0">
                    <GitMerge className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-white">Pull request merged and closed</h4>
                    <p className="text-gray-500 dark:text-dark-muted">
                      The <span className="font-mono font-semibold text-purple-700 dark:text-purple-300">{pull.head_branch}</span> branch can now be safely deleted.
                    </p>
                  </div>
                </div>

                {pull.head_branch !== pull.base_branch && !branchDeleted && (
                  <button
                    type="button"
                    disabled={deletingBranch}
                    onClick={async () => {
                      try {
                        setDeletingBranch(true);
                        await api.deleteBranch(owner, repoName, pull.head_branch);
                        setBranchDeleted(true);
                        showToast(`Branch ${pull.head_branch} deleted successfully`);
                      } catch (err: any) {
                        showToast(err.message || 'Failed to delete branch', 'error');
                      } finally {
                        setDeletingBranch(false);
                      }
                    }}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-white dark:bg-dark-surface text-red-600 dark:text-red-400 font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shadow-2xs shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{deletingBranch ? 'Deleting...' : 'Delete branch'}</span>
                  </button>
                )}
                {branchDeleted && (
                  <span className="text-gray-400 dark:text-dark-muted italic">Branch deleted</span>
                )}
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
                  onKeyDown={e => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleAddComment(e as any);
                    }
                  }}
                  placeholder="Leave a comment on this pull request (Cmd+Enter to submit)..."
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-400 hidden sm:inline">Tip: Press Cmd+Enter to submit</span>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm cursor-pointer"
                  >
                    Comment
                  </button>
                </div>
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

              {/* Review Changes Button & Popover + Split/Unified Toggle */}
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1 p-0.5 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-xs">
                  <button
                    type="button"
                    onClick={() => setDiffViewMode('unified')}
                    className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                      diffViewMode === 'unified'
                        ? 'bg-white dark:bg-dark-surface shadow-2xs text-emerald-600 dark:text-emerald-400 font-bold'
                        : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    Unified
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiffViewMode('split')}
                    className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                      diffViewMode === 'split'
                        ? 'bg-white dark:bg-dark-surface shadow-2xs text-emerald-600 dark:text-emerald-400 font-bold'
                        : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    Split
                  </button>
                </div>

                {user && (
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
                          className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-border/60 transition-colors"
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
                )}
              </div>
            </div>

            {/* Split layout: Files sidebar on left + diffs on right */}
            <div className="flex flex-col lg:flex-row gap-6 items-start">
              {/* Changed Files Sidebar (Sticky) */}
              <div className="w-full lg:w-72 shrink-0 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface p-3 shadow-xs space-y-2 sticky top-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-dark-border">
                  <span className="font-bold text-xs text-gray-900 dark:text-white flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Changed files ({files.length})</span>
                  </span>
                </div>
                <div className="max-h-[70vh] overflow-y-auto space-y-1">
                  {files.map((f, i) => (
                    <a
                      key={i}
                      href={`#diff-file-${i}`}
                      className="block px-2 py-1.5 rounded-lg text-xs hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors font-mono truncate text-gray-700 dark:text-dark-text"
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate">{f.new_path || f.old_path}</span>
                        <span className="text-[10px] ml-1 shrink-0 font-sans">
                          <span className="text-emerald-600 font-semibold">+{f.additions}</span>{' '}
                          <span className="text-red-500 font-semibold">-{f.deletions}</span>
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>

              {/* Diffs Area */}
              <div className="flex-1 min-w-0 space-y-6 w-full">
                {files.map((file, idx) => {
                  const filePath = file.new_path || file.old_path;
                  const parsedLines = parseDiffPatch(file.patch);
                  const splitRows = buildSplitRows(parsedLines);

                  return (
                    <div id={`diff-file-${idx}`} key={idx} className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm overflow-hidden scroll-mt-6">
                      <div className="px-4 py-2.5 bg-gray-50 dark:bg-dark-hover/40 border-b border-gray-200 dark:border-dark-border flex items-center justify-between text-xs font-mono">
                        <span className="font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span>{filePath}</span>
                        </span>
                        <span className="text-gray-400 font-sans">
                          <span className="text-emerald-600">+{file.additions}</span> <span className="text-red-500">-{file.deletions}</span>
                        </span>
                      </div>

                      {diffViewMode === 'split' ? (
                        /* Split Diff (Side-by-Side) */
                        <div className="overflow-x-auto text-xs font-mono bg-gray-950 text-gray-100">
                          <table className="w-full border-collapse table-fixed">
                            <colgroup>
                              <col className="w-10" />
                              <col className="w-1/2" />
                              <col className="w-10" />
                              <col className="w-1/2" />
                            </colgroup>
                            <tbody>
                              {splitRows.map((row, rIdx) => {
                                if (row.header) {
                                  return (
                                    <tr key={rIdx} className="bg-blue-950/40 text-blue-300">
                                      <td colSpan={4} className="py-1 px-4 text-xs font-mono">
                                        {row.header}
                                      </td>
                                    </tr>
                                  );
                                }

                                const leftBg = row.left?.type === 'del' ? 'bg-red-950/40 text-red-300' : 'text-gray-300';
                                const rightBg = row.right?.type === 'add' ? 'bg-emerald-950/40 text-emerald-300' : 'text-gray-300';

                                return (
                                  <tr key={rIdx} className="hover:bg-gray-800/40 border-b border-gray-900/50">
                                    {/* Left (Old) Line */}
                                    <td className="w-10 py-0.5 px-2 text-right select-none text-gray-500 border-r border-gray-800 bg-gray-900/40">
                                      {row.left?.lineNum || ''}
                                    </td>
                                    <td className={`py-0.5 px-3 whitespace-pre font-mono leading-relaxed border-r border-gray-800 truncate ${leftBg}`}>
                                      {row.left?.text || ''}
                                    </td>

                                    {/* Right (New) Line */}
                                    <td className="w-10 py-0.5 px-2 text-right select-none text-gray-500 border-r border-gray-800 bg-gray-900/40">
                                      {row.right?.lineNum || ''}
                                    </td>
                                    <td className={`py-0.5 px-3 whitespace-pre font-mono leading-relaxed truncate ${rightBg}`}>
                                      {row.right?.text || ''}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        /* Unified Diff */
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
                                                className="px-3 py-1 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-border/60 transition-colors"
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
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Merge Confirmation Modal */}
      {showMergeConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl max-w-md w-full shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-dark-border pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                  <GitMerge className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-gray-900 dark:text-white">Confirm Merge</h3>
                  <p className="text-xs text-gray-500 dark:text-dark-muted">Merge #{pull.issue?.index_number} into {pull.base_branch}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMergeConfirmModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-dark-text leading-relaxed">
              Are you sure you want to merge commits from <strong className="font-mono text-emerald-600 dark:text-emerald-400">{pull.head_branch}</strong> into <strong className="font-mono text-emerald-600 dark:text-emerald-400">{pull.base_branch}</strong> using a <strong>{mergeStyle}</strong> merge?
            </p>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-gray-100 dark:border-dark-border">
              <button
                type="button"
                onClick={() => setShowMergeConfirmModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-border/60 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={merging}
                onClick={handleMerge}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors flex items-center space-x-1.5"
              >
                {merging && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm & Merge</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Themed Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-2.5 px-4 py-3 rounded-xl shadow-2xl border text-xs font-semibold backdrop-blur-md transition-all animate-bounce-once bg-white dark:bg-dark-surface border-gray-200 dark:border-dark-border text-gray-900 dark:text-white">
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};


