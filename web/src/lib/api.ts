export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  avatar_url: string;
  is_admin: boolean;
  is_active: boolean;
  location: string;
  website: string;
  bio: string;
  created_at: string;
}

export interface Repository {
  id: number;
  owner_id: number;
  owner_name: string;
  name: string;
  description: string;
  is_private: boolean;
  is_fork: boolean;
  fork_parent_id?: number;
  fork_parent?: Repository;
  default_branch: string;
  num_stars: number;
  num_forks: number;
  num_watches: number;
  num_issues: number;
  num_pulls: number;
  size_bytes: number;
  is_archived: boolean;
  enable_wiki?: boolean;
  enable_pages?: boolean;
  pages_branch?: string;
  pages_folder?: string;
  created_at: string;
  updated_at: string;
}

export interface WikiPageMeta {
  slug: string;
  title: string;
  updated_at: string;
  author: string;
}

export interface WikiPage {
  slug: string;
  title: string;
  content: string;
  updated_at: string;
  author: string;
  message?: string;
}

export interface PagesConfig {
  enable_pages: boolean;
  pages_branch: string;
  pages_folder: string;
  pages_url: string;
  branches: string[];
}

export interface TreeEntry {
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  name: string;
  path: string;
  size?: number;
}

export interface Commit {
  sha: string;
  short_sha: string;
  author: string;
  email: string;
  message: string;
  timestamp: string;
}

export interface BranchDetail {
  name: string;
  is_default: boolean;
  commit_sha: string;
  commit_message: string;
  author_name: string;
  commit_time: number;
}

export interface FileDiff {
  old_path: string;
  new_path: string;
  status: string;
  patch: string;
  additions: number;
  deletions: number;
}

export interface CommitDiff {
  commit: Commit;
  files: FileDiff[];
}

export interface Issue {
  id: number;
  repo_id: number;
  repo_owner?: string;
  repo_name?: string;
  index_number: number;
  poster_id: number;
  poster_name: string;
  poster_avatar: string;
  assignee_id?: number;
  assignee_name?: string;
  assignee_avatar?: string;
  title: string;
  content: string;
  is_pull: boolean;
  is_closed: boolean;
  num_comments: number;
  created_at: string;
}

export interface Comment {
  id: number;
  issue_id: number;
  poster_id: number;
  poster_name: string;
  poster_avatar: string;
  type: string;
  content: string;
  created_at: string;
}

export interface PullRequest {
  id: number;
  issue_id: number;
  issue?: Issue;
  head_repo_id: number;
  base_repo_id: number;
  head_branch: string;
  base_branch: string;
  merge_base: string;
  is_merged: boolean;
  merged_at?: string;
  merge_commit_sha?: string;
}

export interface PullReview {
  id: number;
  issue_id: number;
  pull_id: number;
  reviewer_id: number;
  reviewer_name: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
  content: string;
  comments?: PullReviewComment[];
  created_at: string;
  updated_at: string;
}

export interface PullReviewComment {
  id: number;
  review_id: number;
  issue_id: number;
  user_id: number;
  user_name: string;
  file_path: string;
  line_number: number;
  diff_hunk?: string;
  content: string;
  created_at: string;
}

export interface AccessToken {
  id: number;
  name: string;
  token_prefix: string;
  scopes: string;
  created_at: string;
  last_used_at?: string;
}

export interface SSHKey {
  id: number;
  title: string;
  fingerprint: string;
  public_key: string;
  created_at: string;
}

export interface Activity {
  id: number;
  user_id: number;
  username: string;
  repo_id?: number;
  repo_name?: string;
  op_type: string;
  content: string;
  created_at: string;
}

export interface CollaboratorUser {
  user_id: number;
  username: string;
  email: string;
  full_name: string;
  avatar_url: string;
  mode: string;
  created_at: string;
}

export interface Organization {
  id: number;
  name: string;
  full_name: string;
  description: string;
  avatar_url: string;
  location: string;
  website: string;
  num_members?: number;
  num_repos?: number;
  num_teams?: number;
  created_at: string;
  updated_at?: string;
}

export interface OrgMember {
  org_id: number;
  user_id: number;
  username: string;
  full_name: string;
  email: string;
  avatar_url: string;
  role: string;
  created_at: string;
}

export interface Team {
  id: number;
  org_id: number;
  name: string;
  description: string;
  permission: string;
  num_members?: number;
  created_at: string;
}

export interface Project {
  id: number;
  repo_id: number;
  title: string;
  description: string;
  is_closed: boolean;
  creator_id: number;
  creator_name?: string;
  columns?: ProjectColumn[];
  total_cards?: number;
  done_cards?: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectColumn {
  id: number;
  project_id: number;
  title: string;
  order_num: number;
  cards?: ProjectCard[];
  created_at: string;
}

export interface ProjectCard {
  id: number;
  column_id: number;
  project_id: number;
  issue_id?: number;
  issue?: Issue;
  content: string;
  order_num: number;
  creator_id: number;
  creator_name?: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  sender_id: number;
  sender_username: string;
  sender_full_name?: string;
  sender_avatar_url?: string;
  recipient_id: number;
  recipient_username: string;
  recipient_full_name?: string;
  recipient_avatar_url?: string;
  subject: string;
  content: string;
  status: 'pending' | 'accepted' | 'rejected';
  is_read: boolean;
  read_at?: string;
  created_at: string;
}

export type Developer = User;

export interface Webhook {
  id: number;
  repo_id: number;
  url: string;
  has_secret?: boolean;
  content_type: string;
  events: string;
  is_active: boolean;
  created_at: string;
}

export interface WebhookDelivery {
  id: number;
  webhook_id: number;
  event: string;
  payload: string;
  status_code: number;
  response_body: string;
  duration_ms: number;
  delivered_at: string;
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export interface RepoResponse {
  repository: Repository;
  is_starred: boolean;
  can_write?: boolean;
  permissions?: { admin: boolean; write: boolean; read: boolean };
  branches: string[];
  tags: string[];
  clone_url_http: string;
  clone_url_ssh: string;
  wiki_clone_url_http?: string;
  wiki_clone_url_ssh?: string;
  pages_url?: string;
}

export interface DashboardResponse {
  user: User;
  repositories: Repository[];
  activities: Activity[];
  organizations?: Organization[];
  starred?: Repository[];
  root_url?: string;
  domain?: string;
  ssh_port?: number;
  ssh_enabled?: boolean;
}

// In-memory UI cache for sub-second tab switching & back-navigation
const repoCache = new Map<string, { data: RepoResponse; timestamp: number }>();
let dashboardCache: { data: DashboardResponse; timestamp: number } | null = null;

export const api = {
  // Auth
  async register(data: { username: string; email: string; password: string; full_name?: string }) {
    return fetchJSON<{ user: User; token: string }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async login(data: { username: string; password: string }) {
    return fetchJSON<{ user: User; token: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async logout() {
    return fetchJSON<{ message: string }>('/api/v1/auth/logout', { method: 'POST' });
  },

  async me() {
    return fetchJSON<User>('/api/v1/auth/me');
  },

  // Dashboard & Explore
  getCachedDashboard(): DashboardResponse | null {
    return dashboardCache?.data || null;
  },

  async getDashboard() {
    const data = await fetchJSON<DashboardResponse>('/api/v1/user/dashboard');
    dashboardCache = { data, timestamp: Date.now() };
    return data;
  },

  async explore(query?: string, page = 1, limit = 12) {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (page > 1) params.set('page', String(page));
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    const url = qs ? `/api/v1/explore?${qs}` : '/api/v1/explore';
    return fetchJSON<{
      repositories: Repository[];
      data?: Repository[];
      total: number;
      page?: number;
      limit?: number;
      total_pages?: number;
    }>(url);
  },

  async searchRepos(query: string) {
    return fetchJSON<{ ok: boolean; repositories: Repository[]; data: Repository[]; total: number }>(
      `/api/v1/repos/search?q=${encodeURIComponent(query)}`
    );
  },

  // Repositories
  async listRepos(owner?: string, query?: string) {
    const params = new URLSearchParams();
    if (owner) params.set('owner', owner);
    if (query) params.set('q', query);
    const qs = params.toString();
    const url = qs ? `/api/v1/repos?${qs}` : '/api/v1/repos';
    return fetchJSON<Repository[]>(url);
  },

  async createRepo(data: { name: string; owner?: string; description: string; private: boolean; auto_init: boolean }) {
    return fetchJSON<Repository>('/api/v1/repos', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async importRepo(data: {
    clone_url: string;
    owner?: string;
    name: string;
    description: string;
    private: boolean;
    auth_username?: string;
    auth_password?: string;
  }) {
    return fetchJSON<Repository>('/api/v1/repos/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getCachedRepo(owner: string, repo: string): RepoResponse | null {
    const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
    const item = repoCache.get(key);
    return item ? item.data : null;
  },

  async getRepo(owner: string, repo: string) {
    const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
    const res = await fetchJSON<RepoResponse>(`/api/v1/repos/${owner}/${repo}`);
    repoCache.set(key, { data: res, timestamp: Date.now() });
    return res;
  },

  clearRepoCache(owner?: string, repo?: string) {
    if (owner && repo) {
      repoCache.delete(`${owner.toLowerCase()}/${repo.toLowerCase()}`);
    } else {
      repoCache.clear();
    }
  },

  async deleteRepo(owner: string, repo: string) {
    const res = await fetchJSON<{ message: string }>(`/api/v1/repos/${owner}/${repo}`, { method: 'DELETE' });
    this.clearRepoCache(owner, repo);
    dashboardCache = null;
    return res;
  },

  async toggleStar(owner: string, repo: string) {
    const res = await fetchJSON<{ starred: boolean; num_stars: number }>(`/api/v1/repos/${owner}/${repo}/star`, { method: 'POST' });
    const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
    const cached = repoCache.get(key);
    if (cached) {
      cached.data.is_starred = res.starred;
      cached.data.repository.num_stars = res.num_stars;
    }
    return res;
  },

  async forkRepo(owner: string, repo: string, data?: { organization?: string; name?: string }) {
    return fetchJSON<Repository>(`/api/v1/repos/${owner}/${repo}/forks`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  },

  async listForks(owner: string, repo: string) {
    return fetchJSON<Repository[]>(`/api/v1/repos/${owner}/${repo}/forks`);
  },

  // Git Code Browsing
  async getTree(owner: string, repo: string, ref?: string, path?: string) {
    const params = new URLSearchParams();
    if (ref) params.set('ref', ref);
    if (path) params.set('path', path);
    return fetchJSON<{
      entries: TreeEntry[];
      readme?: string;
      latest_commit?: Commit | null;
      total_commits?: number;
    }>(`/api/v1/repos/${owner}/${repo}/tree?${params.toString()}`);
  },

  async getBlob(owner: string, repo: string, ref: string, path: string) {
    return fetchJSON<{ size: number; content: string; is_binary: boolean }>(
      `/api/v1/repos/${owner}/${repo}/blob?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(path)}`
    );
  },

  async getCommits(owner: string, repo: string, ref?: string) {
    const url = ref ? `/api/v1/repos/${owner}/${repo}/commits?ref=${encodeURIComponent(ref)}` : `/api/v1/repos/${owner}/${repo}/commits`;
    return fetchJSON<Commit[]>(url);
  },

  async getCommitDiff(owner: string, repo: string, sha: string) {
    return fetchJSON<CommitDiff>(`/api/v1/repos/${owner}/${repo}/commits/${sha}`);
  },

  async getBranches(owner: string, repo: string) {
    return fetchJSON<string[]>(`/api/v1/repos/${owner}/${repo}/branches`);
  },

  async getBranchDetails(owner: string, repo: string) {
    return fetchJSON<BranchDetail[]>(`/api/v1/repos/${owner}/${repo}/branches?detail=true`);
  },

  async createBranch(owner: string, repo: string, branchName: string, baseRef?: string) {
    return fetchJSON<{ message: string; branch?: string }>(`/api/v1/repos/${owner}/${repo}/branches`, {
      method: 'POST',
      body: JSON.stringify({ branch_name: branchName, base_ref: baseRef }),
    });
  },

  async deleteBranch(owner: string, repo: string, branchName: string) {
    return fetchJSON<{ message: string }>(`/api/v1/repos/${owner}/${repo}/branches/${encodeURIComponent(branchName)}`, {
      method: 'DELETE',
    });
  },

  // Online File Operations
  async saveFile(
    owner: string,
    repo: string,
    filePath: string,
    data: { branch?: string; new_branch?: string; content: string; message: string }
  ) {
    return fetchJSON<{ message: string; commit_sha: string; branch: string; file_path: string }>(
      `/api/v1/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  },

  async deleteFile(
    owner: string,
    repo: string,
    filePath: string,
    data: { branch?: string; new_branch?: string; message: string }
  ) {
    return fetchJSON<{ message: string; commit_sha: string; branch: string; file_path: string }>(
      `/api/v1/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: 'DELETE',
        body: JSON.stringify(data),
      }
    );
  },

  async uploadFiles(owner: string, repo: string, formData: FormData) {
    const res = await fetch(`/api/v1/repos/${owner}/${repo}/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json() as Promise<{ message: string; commit_sha: string; branch: string; num_files: number }>;
  },

  // Issues
  async listIssues(owner: string, repo: string, state: 'open' | 'closed' = 'open', assignee?: string) {
    let url = `/api/v1/repos/${owner}/${repo}/issues?state=${state}`;
    if (assignee) {
      url += `&assignee=${encodeURIComponent(assignee)}`;
    }
    return fetchJSON<Issue[]>(url);
  },

  async createIssue(owner: string, repo: string, data: { title: string; content: string; assignee?: string }) {
    return fetchJSON<Issue>(`/api/v1/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getIssue(owner: string, repo: string, index: number) {
    return fetchJSON<Issue>(`/api/v1/repos/${owner}/${repo}/issues/${index}`);
  },

  async updateIssue(owner: string, repo: string, index: number, closed?: boolean, assignee?: string | null) {
    const payload: any = {};
    if (closed !== undefined) payload.closed = closed;
    if (assignee !== undefined) payload.assignee = assignee;
    return fetchJSON<Issue>(`/api/v1/repos/${owner}/${repo}/issues/${index}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async assignIssue(owner: string, repo: string, index: number, assignee: string | null) {
    return fetchJSON<Issue>(`/api/v1/repos/${owner}/${repo}/issues/${index}/assignee`, {
      method: 'PUT',
      body: JSON.stringify({ assignee: assignee || '' }),
    });
  },

  async listRepoAssignees(owner: string, repo: string) {
    return fetchJSON<User[]>(`/api/v1/repos/${owner}/${repo}/assignees`);
  },

  async listComments(owner: string, repo: string, index: number) {
    return fetchJSON<Comment[]>(`/api/v1/repos/${owner}/${repo}/issues/${index}/comments`);
  },

  async addComment(owner: string, repo: string, index: number, content: string) {
    return fetchJSON<Comment>(`/api/v1/repos/${owner}/${repo}/issues/${index}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  // Pull Requests
  async listPulls(owner: string, repo: string, state: 'open' | 'closed' = 'open') {
    return fetchJSON<PullRequest[]>(`/api/v1/repos/${owner}/${repo}/pulls?state=${state}`);
  },

  async createPull(owner: string, repo: string, data: { title: string; content: string; head_branch: string; base_branch: string }) {
    return fetchJSON<PullRequest>(`/api/v1/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getPull(owner: string, repo: string, index: number) {
    return fetchJSON<PullRequest>(`/api/v1/repos/${owner}/${repo}/pulls/${index}`);
  },

  async getPullDiff(owner: string, repo: string, index: number) {
    return fetchJSON<{ base_branch: string; head_branch: string; files: FileDiff[]; mergeable: boolean }>(
      `/api/v1/repos/${owner}/${repo}/pulls/${index}/diff`
    );
  },

  async compareBranches(owner: string, repo: string, base: string, head: string) {
    return fetchJSON<{ base_branch: string; head_branch: string; commits: Commit[]; files: FileDiff[]; mergeable: boolean }>(
      `/api/v1/repos/${owner}/${repo}/compare?base=${encodeURIComponent(base)}&head=${encodeURIComponent(head)}`
    );
  },

  async mergePull(owner: string, repo: string, index: number, mergeStyle: 'merge' | 'squash' | 'rebase' = 'merge') {
    return fetchJSON<{ message: string; merge_commit_sha: string }>(`/api/v1/repos/${owner}/${repo}/pulls/${index}/merge`, {
      method: 'POST',
      body: JSON.stringify({ merge_style: mergeStyle }),
    });
  },

  async listPullReviews(owner: string, repo: string, index: number) {
    return fetchJSON<PullReview[]>(`/api/v1/repos/${owner}/${repo}/pulls/${index}/reviews`);
  },

  async createPullReview(owner: string, repo: string, index: number, data: { state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED'; content?: string }) {
    return fetchJSON<PullReview>(`/api/v1/repos/${owner}/${repo}/pulls/${index}/reviews`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async listPullReviewComments(owner: string, repo: string, index: number) {
    return fetchJSON<PullReviewComment[]>(`/api/v1/repos/${owner}/${repo}/pulls/${index}/reviews/comments`);
  },

  async addPullReviewComment(
    owner: string,
    repo: string,
    index: number,
    data: { review_id?: number; file_path: string; line_number: number; diff_hunk?: string; content: string }
  ) {
    return fetchJSON<PullReviewComment>(`/api/v1/repos/${owner}/${repo}/pulls/${index}/reviews/comments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Settings: Tokens & SSH Keys
  async listTokens() {
    return fetchJSON<AccessToken[]>('/api/v1/user/tokens');
  },

  async createToken(name: string, scopes: string = 'repo,user') {
    return fetchJSON<{ token: AccessToken; raw_token: string }>('/api/v1/user/tokens', {
      method: 'POST',
      body: JSON.stringify({ name, scopes }),
    });
  },

  async deleteToken(id: number) {
    return fetchJSON<{ message: string }>(`/api/v1/user/tokens/${id}`, { method: 'DELETE' });
  },

  async listSSHKeys() {
    return fetchJSON<SSHKey[]>('/api/v1/user/keys');
  },

  async createSSHKey(title: string, key: string) {
    return fetchJSON<SSHKey>('/api/v1/user/keys', {
      method: 'POST',
      body: JSON.stringify({ title, key }),
    });
  },

  async deleteSSHKey(id: number) {
    return fetchJSON<{ message: string }>(`/api/v1/user/keys/${id}`, { method: 'DELETE' });
  },

  async getUserProfile(username: string) {
    return fetchJSON<{
      user: User;
      repositories: Repository[];
      activities?: Activity[];
      organizations?: Organization[];
      starred?: Repository[];
      is_org?: boolean;
      organization?: Organization;
    }>(`/api/v1/users/${username}`);
  },

  async updateUserSettings(data: {
    full_name?: string;
    email?: string;
    bio?: string;
    location?: string;
    website?: string;
    avatar_url?: string;
  }) {
    return fetchJSON<User>('/api/v1/user/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async updateUserPassword(data: { old_password: string; new_password: string }) {
    return fetchJSON<{ message: string }>('/api/v1/user/password', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Wiki
  async listWikiPages(owner: string, repo: string) {
    return fetchJSON<WikiPageMeta[]>(`/api/v1/repos/${owner}/${repo}/wiki/pages`);
  },

  async getWikiPage(owner: string, repo: string, slug: string) {
    return fetchJSON<WikiPage>(`/api/v1/repos/${owner}/${repo}/wiki/pages/${encodeURIComponent(slug)}`);
  },

  async saveWikiPage(owner: string, repo: string, data: { slug: string; title: string; content: string; message?: string }) {
    return fetchJSON<WikiPage>(`/api/v1/repos/${owner}/${repo}/wiki/pages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteWikiPage(owner: string, repo: string, slug: string) {
    return fetchJSON<{ message: string }>(`/api/v1/repos/${owner}/${repo}/wiki/pages/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    });
  },

  async getWikiPageHistory(owner: string, repo: string, slug: string) {
    return fetchJSON<Commit[]>(`/api/v1/repos/${owner}/${repo}/wiki/pages/${encodeURIComponent(slug)}/history`);
  },

  // ProGit Pages & Repository Settings
  async getPagesConfig(owner: string, repo: string) {
    return fetchJSON<PagesConfig>(`/api/v1/repos/${owner}/${repo}/pages`);
  },

  async updatePagesConfig(owner: string, repo: string, data: { enable_pages: boolean; pages_branch: string; pages_folder: string }) {
    return fetchJSON<{ message: string; repository: Repository; pages_url: string }>(`/api/v1/repos/${owner}/${repo}/pages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateRepoSettings(owner: string, repo: string, data: {
    description?: string;
    is_private?: boolean;
    enable_wiki?: boolean;
    enable_pages?: boolean;
    pages_branch?: string;
    pages_folder?: string;
  }) {
    const res = await fetchJSON<Repository>(`/api/v1/repos/${owner}/${repo}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    this.clearRepoCache(owner, repo);
    return res;
  },

  // Installation
  async getInstallStatus() {
    return fetchJSON<{
      install_locked: boolean;
      users_count: number;
      app_name: string;
      domain: string;
      http_port: number;
      https_port?: number;
      protocol?: string;
      root_url: string;
      database_path: string;
      repositories_path: string;
      ssh_port: number;
    }>('/api/v1/install/status');
  },

  async install(data: {
    app_name: string;
    domain: string;
    http_port: number;
    https_port?: number;
    protocol?: string;
    root_url: string;
    admin_username: string;
    admin_email: string;
    admin_password: string;
  }) {
    return fetchJSON<{ message: string; token: string; user: User }>('/api/v1/install', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Admin
  async getAdminStats() {
    return fetchJSON<{
      users_count: number;
      repositories_count: number;
      uptime: string;
      database_path: string;
      repositories_path: string;
      ssh_enabled: boolean;
      ssh_port: number;
      domain: string;
      http_port: number;
      root_url: string;
      app_name: string;
      go_version: string;
      num_goroutines: number;
      memory_alloc_mb: number;
      memory_sys_mb: number;
      active_sessions_count: number;
      install_locked: boolean;
    }>('/api/v1/admin/stats');
  },

  async updateAdminConfig(config: {
    app_name?: string;
    domain?: string;
    root_url?: string;
    ssh_port?: number;
    http_port?: number;
  }) {
    return fetchJSON<{
      message: string;
      app_name: string;
      domain: string;
      root_url: string;
      ssh_port: number;
      http_port: number;
    }>('/api/v1/admin/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  async getAdminUsers() {
    return fetchJSON<User[]>('/api/v1/admin/users');
  },

  async adminCreateUser(data: {
    username: string;
    email: string;
    password: string;
    full_name: string;
    is_admin: boolean;
  }) {
    return fetchJSON<User>('/api/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async adminUpdateUser(id: number, data: { is_admin?: boolean; is_active?: boolean }) {
    return fetchJSON<User>(`/api/v1/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async adminDeleteUser(id: number) {
    return fetchJSON<{ message: string }>(`/api/v1/admin/users/${id}`, {
      method: 'DELETE',
    });
  },

  async getAdminRepos() {
    return fetchJSON<Repository[]>('/api/v1/admin/repos');
  },

  async adminDeleteRepo(id: number) {
    return fetchJSON<{ message: string }>(`/api/v1/admin/repos/${id}`, {
      method: 'DELETE',
    });
  },

  async adminRunMaintenance(operation: 'checkpoint_wal' | 'vacuum') {
    return fetchJSON<{ message: string }>('/api/v1/admin/maintenance', {
      method: 'POST',
      body: JSON.stringify({ operation }),
    });
  },

  async getHealth() {
    return fetchJSON<{ status: string; uptime: string; database: string }>('/api/health');
  },

  // Collaborators
  async getCollaborators(owner: string, repo: string) {
    return fetchJSON<CollaboratorUser[]>(`/api/v1/repos/${owner}/${repo}/collaborators`);
  },

  async addCollaborator(owner: string, repo: string, username: string, mode: string = 'write') {
    return fetchJSON<{ message: string; username: string; mode: string }>(
      `/api/v1/repos/${owner}/${repo}/collaborators/${username}`,
      {
        method: 'PUT',
        body: JSON.stringify({ mode }),
      }
    );
  },

  async removeCollaborator(owner: string, repo: string, username: string) {
    return fetchJSON<{ message: string }>(`/api/v1/repos/${owner}/${repo}/collaborators/${username}`, {
      method: 'DELETE',
    });
  },

  // Webhooks
  async listWebhooks(owner: string, repo: string) {
    return fetchJSON<Webhook[]>(`/api/v1/repos/${owner}/${repo}/hooks`);
  },

  async createWebhook(owner: string, repo: string, data: { url: string; secret?: string; content_type?: string; events?: string; is_active?: boolean }) {
    return fetchJSON<Webhook>(`/api/v1/repos/${owner}/${repo}/hooks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getWebhook(owner: string, repo: string, id: number) {
    return fetchJSON<Webhook>(`/api/v1/repos/${owner}/${repo}/hooks/${id}`);
  },

  async updateWebhook(owner: string, repo: string, id: number, data: { url?: string; secret?: string; content_type?: string; events?: string; is_active?: boolean }) {
    return fetchJSON<Webhook>(`/api/v1/repos/${owner}/${repo}/hooks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteWebhook(owner: string, repo: string, id: number) {
    return fetchJSON<{ message: string }>(`/api/v1/repos/${owner}/${repo}/hooks/${id}`, {
      method: 'DELETE',
    });
  },

  async testWebhook(owner: string, repo: string, id: number) {
    return fetchJSON<{ message: string; delivery: WebhookDelivery }>(`/api/v1/repos/${owner}/${repo}/hooks/${id}/test`, {
      method: 'POST',
    });
  },

  async listWebhookDeliveries(owner: string, repo: string, id: number) {
    return fetchJSON<WebhookDelivery[]>(`/api/v1/repos/${owner}/${repo}/hooks/${id}/deliveries`);
  },

  // Danger Zone Actions
  async changeRepoVisibility(owner: string, repo: string, isPrivate: boolean) {
    return fetchJSON<{ message: string; is_private: boolean; repository: Repository }>(
      `/api/v1/repos/${owner}/${repo}/visibility`,
      {
        method: 'POST',
        body: JSON.stringify({ is_private: isPrivate }),
      }
    );
  },

  async toggleRepoArchive(owner: string, repo: string, archive: boolean) {
    return fetchJSON<{ message: string; is_archived: boolean; repository: Repository }>(
      `/api/v1/repos/${owner}/${repo}/archive`,
      {
        method: 'POST',
        body: JSON.stringify({ archive }),
      }
    );
  },

  async transferRepo(owner: string, repo: string, newOwner: string) {
    return fetchJSON<{ message: string; new_owner: string; redirect_url: string; repository: Repository }>(
      `/api/v1/repos/${owner}/${repo}/transfer`,
      {
        method: 'POST',
        body: JSON.stringify({ new_owner: newOwner }),
      }
    );
  },

  // Organizations
  async createOrg(data: { name: string; full_name?: string; description?: string; location?: string; website?: string }) {
    return fetchJSON<Organization>('/api/v1/orgs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async listOrgs() {
    return fetchJSON<Organization[]>('/api/v1/orgs');
  },

  async listUserOrgs() {
    return fetchJSON<Organization[]>('/api/v1/user/orgs');
  },

  async getOrg(name: string) {
    return fetchJSON<{ organization: Organization; is_member: boolean; is_admin: boolean }>(`/api/v1/orgs/${name}`);
  },

  async updateOrg(name: string, data: { full_name?: string; description?: string; location?: string; website?: string; avatar_url?: string }) {
    return fetchJSON<{ organization: Organization; message: string }>(`/api/v1/orgs/${name}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async listOrgMembers(orgName: string) {
    return fetchJSON<OrgMember[]>(`/api/v1/orgs/${orgName}/members`);
  },

  async addOrgMember(orgName: string, username: string, role: string = 'member') {
    return fetchJSON<{ message: string; username: string; role: string }>(`/api/v1/orgs/${orgName}/members`, {
      method: 'POST',
      body: JSON.stringify({ username, role }),
    });
  },

  async removeOrgMember(orgName: string, username: string) {
    return fetchJSON<{ message: string }>(`/api/v1/orgs/${orgName}/members/${username}`, {
      method: 'DELETE',
    });
  },

  async listOrgTeams(orgName: string) {
    return fetchJSON<Team[]>(`/api/v1/orgs/${orgName}/teams`);
  },

  async createOrgTeam(orgName: string, data: { name: string; description?: string; permission: string }) {
    return fetchJSON<Team>(`/api/v1/orgs/${orgName}/teams`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async listOrgRepos(orgName: string) {
    return fetchJSON<Repository[]>(`/api/v1/orgs/${orgName}/repos`);
  },

  // Projects (Kanban Boards)
  async listProjects(owner: string, repo: string) {
    return fetchJSON<Project[]>(`/api/v1/repos/${owner}/${repo}/projects`);
  },

  async createProject(owner: string, repo: string, data: { title: string; description?: string }) {
    return fetchJSON<Project>(`/api/v1/repos/${owner}/${repo}/projects`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getProject(owner: string, repo: string, id: number) {
    return fetchJSON<Project>(`/api/v1/repos/${owner}/${repo}/projects/${id}`);
  },

  async updateProject(owner: string, repo: string, id: number, data: { title: string; description?: string; is_closed?: boolean }) {
    return fetchJSON<Project>(`/api/v1/repos/${owner}/${repo}/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteProject(owner: string, repo: string, id: number) {
    return fetchJSON<{ message: string }>(`/api/v1/repos/${owner}/${repo}/projects/${id}`, {
      method: 'DELETE',
    });
  },

  async createProjectColumn(owner: string, repo: string, projectId: number, data: { title: string; order_num: number }) {
    return fetchJSON<ProjectColumn>(`/api/v1/repos/${owner}/${repo}/projects/${projectId}/columns`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateProjectColumn(owner: string, repo: string, projectId: number, columnId: number, data: { title: string; order_num?: number }) {
    return fetchJSON<{ message: string }>(`/api/v1/repos/${owner}/${repo}/projects/${projectId}/columns/${columnId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteProjectColumn(owner: string, repo: string, projectId: number, columnId: number) {
    return fetchJSON<{ message: string }>(`/api/v1/repos/${owner}/${repo}/projects/${projectId}/columns/${columnId}`, {
      method: 'DELETE',
    });
  },

  async createProjectCard(owner: string, repo: string, projectId: number, data: { column_id: number; issue_id?: number; content: string; order_num: number }) {
    return fetchJSON<ProjectCard>(`/api/v1/repos/${owner}/${repo}/projects/${projectId}/cards`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async moveProjectCard(owner: string, repo: string, projectId: number, cardId: number, data: { column_id?: number; order_num?: number; content?: string }) {
    return fetchJSON<{ message: string }>(`/api/v1/repos/${owner}/${repo}/projects/${projectId}/cards/${cardId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async updateProjectCard(owner: string, repo: string, projectId: number, cardId: number, data: { column_id?: number; order_num?: number; content?: string }) {
    return fetchJSON<{ message: string }>(`/api/v1/repos/${owner}/${repo}/projects/${projectId}/cards/${cardId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteProjectCard(owner: string, repo: string, projectId: number, cardId: number) {
    return fetchJSON<{ message: string }>(`/api/v1/repos/${owner}/${repo}/projects/${projectId}/cards/${cardId}`, {
      method: 'DELETE',
    });
  },

  // Direct Messaging (Developer Communication)
  async sendMessage(data: { recipient_username: string; subject?: string; content: string }) {
    return fetchJSON<Message>('/api/v1/messages', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async listInboxMessages() {
    return fetchJSON<Message[]>('/api/v1/messages/inbox');
  },

  async listSentMessages() {
    return fetchJSON<Message[]>('/api/v1/messages/sent');
  },

  async getFeatures() {
    return fetchJSON<{ messaging_enabled: boolean }>('/api/v1/features');
  },

  async getUnreadMessageCount() {
    return fetchJSON<{ unread_count: number; messaging_enabled?: boolean }>('/api/v1/messages/unread-count');
  },

  async getMessage(id: number) {
    return fetchJSON<Message>(`/api/v1/messages/${id}`);
  },

  async markMessageRead(id: number) {
    return fetchJSON<{ message: string }>(`/api/v1/messages/${id}/read`, {
      method: 'PATCH',
    });
  },

  async deleteMessage(id: number) {
    return fetchJSON<{ message: string }>(`/api/v1/messages/${id}`, {
      method: 'DELETE',
    });
  },

  async acceptMessage(id: number) {
    return fetchJSON<Message>(`/api/v1/messages/${id}/accept`, {
      method: 'POST',
    });
  },

  async rejectMessage(id: number) {
    return fetchJSON<Message>(`/api/v1/messages/${id}/reject`, {
      method: 'POST',
    });
  },

  async searchDevelopers(query: string, limit = 10) {
    const q = query.trim();
    if (!q) return [];
    return fetchJSON<User[]>(`/api/v1/developers?q=${encodeURIComponent(q)}&limit=${limit}`);
  },

  async listDevelopers(query = '', limit = 10) {
    const q = query.trim();
    if (!q) return [];
    return fetchJSON<User[]>(`/api/v1/developers?q=${encodeURIComponent(q)}&limit=${limit}`);
  },

  // P0 & P1 & P2 & P3 Features
  async getRecentPushes(owner: string, repo: string) {
    return fetchJSON<{ recent_pushes: RecentPush[] }>(`/api/v1/repos/${owner}/${repo}/recent-pushes`);
  },

  async getBlame(owner: string, repo: string, branch: string, path: string) {
    return fetchJSON<{ branch: string; path: string; lines: BlameLine[] }>(
      `/api/v1/repos/${owner}/${repo}/blame?branch=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}`
    );
  },

  async searchRepoCode(owner: string, repo: string, query: string, branch?: string) {
    const b = branch ? `&branch=${encodeURIComponent(branch)}` : '';
    return fetchJSON<{ query: string; branch: string; matches: CodeMatch[] }>(
      `/api/v1/repos/${owner}/${repo}/code-search?q=${encodeURIComponent(query)}${b}`
    );
  },

  async listBranchProtections(owner: string, repo: string) {
    return fetchJSON<BranchProtection[]>(`/api/v1/repos/${owner}/${repo}/branch-protections`);
  },

  async setBranchProtection(owner: string, repo: string, data: { branch_name: string; require_pr: boolean; required_approvals?: number; prevent_force_push: boolean }) {
    return fetchJSON<BranchProtection>(`/api/v1/repos/${owner}/${repo}/branch-protections`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteBranchProtection(owner: string, repo: string, branch: string) {
    return fetchJSON<{ message: string }>(`/api/v1/repos/${owner}/${repo}/branch-protections/${encodeURIComponent(branch)}`, {
      method: 'DELETE',
    });
  },

  async listReleases(owner: string, repo: string) {
    return fetchJSON<Release[]>(`/api/v1/repos/${owner}/${repo}/releases`);
  },

  async createRelease(owner: string, repo: string, data: { tag_name: string; title: string; note: string; is_draft?: boolean; is_prerelease?: boolean }) {
    return fetchJSON<Release>(`/api/v1/repos/${owner}/${repo}/releases`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteRelease(owner: string, repo: string, id: number) {
    return fetchJSON<{ message: string }>(`/api/v1/repos/${owner}/${repo}/releases/${id}`, {
      method: 'DELETE',
    });
  },
};

export interface RecentPush {
  branch: string;
  time_ago: string;
  commit_sha: string;
  commit_msg: string;
}

export interface BlameLine {
  line_number: number;
  commit_sha: string;
  short_sha: string;
  author: string;
  author_mail: string;
  timestamp: string;
  summary: string;
  content: string;
}

export interface CodeMatch {
  path: string;
  line_number: number;
  content: string;
}

export interface BranchProtection {
  id: number;
  repo_id: number;
  branch_name: string;
  require_pr: boolean;
  required_approvals: number;
  prevent_force_push: boolean;
  created_at: string;
}

export interface ReleaseAsset {
  id: number;
  release_id: number;
  name: string;
  size_bytes: number;
  download_count: number;
  content_type: string;
  created_at: string;
}

export interface Release {
  id: number;
  repo_id: number;
  publisher_id: number;
  publisher_name: string;
  tag_name: string;
  title: string;
  note: string;
  is_draft: boolean;
  is_prerelease: boolean;
  created_at: string;
  published_at?: string;
  assets: ReleaseAsset[];
}

