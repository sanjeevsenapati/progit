import React, { useEffect, useState } from 'react';
import { api, Repository, PullRequest, Comment, FileDiff } from '../lib/api';
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
  ShieldCheck 
} from 'lucide-react';

interface PullDetailProps {
  owner: string;
  repo: string;
  index: number;
}

export const PullDetail: React.FC<PullDetailProps> = ({ owner, repo: repoName, index }) => {
  const { user } = useAuth();
  const [repoData, setRepoData] = useState<Repository | null>(null);
  const [pull, setPull] = useState<PullRequest | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [files, setFiles] = useState<FileDiff[]>([]);
  const [activeTab, setActiveTab] = useState<'conversation' | 'files'>('conversation');
  const [newComment, setNewComment] = useState('');
  const [mergeStyle, setMergeStyle] = useState<'merge' | 'squash' | 'rebase'>('merge');
  const [merging, setMerging] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const r = await api.getRepo(owner, repoName);
        setRepoData(r.repository);

        const p = await api.getPull(owner, repoName, index);
        setPull(p);

        const cList = await api.listComments(owner, repoName, index);
        setComments(cList || []);

        const diffData = await api.getPullDiff(owner, repoName, index);
        setFiles(diffData.files || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
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

  if (loading && !repoData) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading pull request...</div>;
  }

  if (!repoData || !pull || !pull.issue) {
    return <div className="py-20 text-center text-sm">Pull request not found</div>;
  }

  const issue = pull.issue;

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
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Conversation</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-xs bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-dark-muted">
              {comments.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('files')}
            className={`pb-2 border-b-2 flex items-center space-x-1.5 transition-colors ${
              activeTab === 'files'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-gray-500 hover:text-gray-700'
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

            {/* Comments */}
            {comments.map(c => (
              <div key={c.id} className="flex items-start space-x-3">
                <div className="w-9 h-9 rounded-full bg-teal-700 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 mt-1">
                  {c.poster_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
                  <div className="px-4 py-2 bg-gray-50 dark:bg-dark-hover/40 border-b border-gray-200 dark:border-dark-border text-xs text-gray-500 dark:text-dark-muted">
                    <strong className="text-gray-900 dark:text-white">{c.poster_name}</strong>: {c.type}
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
                    className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs shadow-sm transition-colors"
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
                  placeholder="Leave a review comment..."
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white text-sm"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm"
                >
                  Comment
                </button>
              </form>
            )}
          </div>
        ) : (
          /* Files Changed / Diff */
          <div className="space-y-6">
            {files.map((file, idx) => (
              <div key={idx} className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 dark:bg-dark-hover/40 border-b border-gray-200 dark:border-dark-border flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span>{file.new_path || file.old_path}</span>
                  </span>
                  <span className="text-gray-400">+{file.additions} -{file.deletions}</span>
                </div>
                <div className="p-4 overflow-x-auto text-xs font-mono leading-relaxed bg-gray-950 text-gray-100">
                  <pre className="whitespace-pre">
                    {file.patch.split('\n').map((line, lIdx) => {
                      let color = 'text-gray-400';
                      if (line.startsWith('+') && !line.startsWith('+++')) color = 'text-emerald-400';
                      else if (line.startsWith('-') && !line.startsWith('---')) color = 'text-red-400';
                      return <div key={lIdx} className={color}>{line}</div>;
                    })}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

