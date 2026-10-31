package database

import "time"

type User struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	FullName     string    `json:"full_name"`
	AvatarURL    string    `json:"avatar_url"`
	IsAdmin      bool      `json:"is_admin"`
	IsActive     bool      `json:"is_active"`
	Location     string    `json:"location"`
	Website      string    `json:"website"`
	Bio          string    `json:"bio"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type AccessToken struct {
	ID          int64      `json:"id"`
	UserID      int64      `json:"user_id"`
	Name        string     `json:"name"`
	TokenHash   string     `json:"-"`
	TokenPrefix string     `json:"token_prefix"`
	Scopes      string     `json:"scopes"`
	CreatedAt   time.Time  `json:"created_at"`
	LastUsedAt  *time.Time `json:"last_used_at"`
}

type SSHKey struct {
	ID          int64     `json:"id"`
	UserID      int64     `json:"user_id"`
	Title       string    `json:"title"`
	Fingerprint string    `json:"fingerprint"`
	PublicKey   string    `json:"public_key"`
	CreatedAt   time.Time `json:"created_at"`
}

type Repository struct {
	ID            int64     `json:"id"`
	OwnerID       int64     `json:"owner_id"`
	OwnerName     string    `json:"owner_name"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	IsPrivate     bool      `json:"is_private"`
	IsFork        bool      `json:"is_fork"`
	ForkParentID  *int64    `json:"fork_parent_id,omitempty"`
	DefaultBranch string    `json:"default_branch"`
	NumStars      int       `json:"num_stars"`
	NumForks      int       `json:"num_forks"`
	NumWatches    int       `json:"num_watches"`
	NumIssues     int       `json:"num_issues"`
	NumPulls      int       `json:"num_pulls"`
	SizeBytes     int64     `json:"size_bytes"`
	IsArchived    bool      `json:"is_archived"`
	EnableWiki    bool      `json:"enable_wiki"`
	EnablePages   bool      `json:"enable_pages"`
	PagesBranch   string    `json:"pages_branch"`
	PagesFolder   string    `json:"pages_folder"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type WikiPageMeta struct {
	Slug       string    `json:"slug"`
	Title      string    `json:"title"`
	LastCommit string    `json:"last_commit,omitempty"`
	Author     string    `json:"author,omitempty"`
	UpdatedAt  time.Time `json:"updated_at,omitempty"`
}

type WikiPage struct {
	Slug      string    `json:"slug"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Author    string    `json:"author"`
	Email     string    `json:"email"`
	CommitSHA string    `json:"commit_sha"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Issue struct {
	ID           int64      `json:"id"`
	RepoID       int64      `json:"repo_id"`
	RepoOwner    string     `json:"repo_owner,omitempty"`
	RepoName     string     `json:"repo_name,omitempty"`
	IndexNumber  int64      `json:"index_number"`
	PosterID     int64      `json:"poster_id"`
	PosterName   string     `json:"poster_name"`
	PosterAvatar string     `json:"poster_avatar"`
	Title        string     `json:"title"`
	Content      string     `json:"content"`
	IsPull       bool       `json:"is_pull"`
	IsClosed     bool       `json:"is_closed"`
	ClosedAt     *time.Time `json:"closed_at,omitempty"`
	NumComments  int        `json:"num_comments"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type PullRequest struct {
	ID             int64      `json:"id"`
	IssueID        int64      `json:"issue_id"`
	Issue          *Issue     `json:"issue,omitempty"`
	HeadRepoID     int64      `json:"head_repo_id"`
	BaseRepoID     int64      `json:"base_repo_id"`
	HeadBranch     string     `json:"head_branch"`
	BaseBranch     string     `json:"base_branch"`
	MergeBase      string     `json:"merge_base"`
	IsMerged       bool       `json:"is_merged"`
	MergedAt       *time.Time `json:"merged_at,omitempty"`
	MergedByID     *int64     `json:"merged_by_id,omitempty"`
	MergeCommitSHA string     `json:"merge_commit_sha,omitempty"`
}

type Comment struct {
	ID           int64     `json:"id"`
	IssueID      int64     `json:"issue_id"`
	PosterID     int64     `json:"poster_id"`
	PosterName   string    `json:"poster_name"`
	PosterAvatar string    `json:"poster_avatar"`
	Type         string    `json:"type"` // "comment", "close", "reopen", "merge"
	Content      string    `json:"content"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Label struct {
	ID          int64  `json:"id"`
	RepoID      int64  `json:"repo_id"`
	Name        string `json:"name"`
	Color       string `json:"color"`
	Description string `json:"description"`
}

type Milestone struct {
	ID          int64      `json:"id"`
	RepoID      int64      `json:"repo_id"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	IsClosed    bool       `json:"is_closed"`
	DueDate     *time.Time `json:"due_date,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

type Activity struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Username  string    `json:"username"`
	RepoID    *int64    `json:"repo_id,omitempty"`
	RepoName  string    `json:"repo_name,omitempty"`
	OpType    string    `json:"op_type"` // "create_repo", "push", "issue", "pull", "star"
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

type Webhook struct {
	ID          int64     `json:"id"`
	RepoID      int64     `json:"repo_id"`
	URL         string    `json:"url"`
	Secret      string    `json:"-"`
	ContentType string    `json:"content_type"`
	Events      string    `json:"events"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
}

type WebhookDelivery struct {
	ID           int64     `json:"id"`
	WebhookID    int64     `json:"webhook_id"`
	Event        string    `json:"event"`
	Payload      string    `json:"payload"`
	StatusCode   int       `json:"status_code"`
	ResponseBody string    `json:"response_body"`
	DurationMs   int       `json:"duration_ms"`
	DeliveredAt  time.Time `json:"delivered_at"`
}

type Organization struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	FullName    string    `json:"full_name"`
	Description string    `json:"description"`
	AvatarURL   string    `json:"avatar_url"`
	Location    string    `json:"location"`
	Website     string    `json:"website"`
	NumMembers  int       `json:"num_members,omitempty"`
	NumRepos    int       `json:"num_repos,omitempty"`
	NumTeams    int       `json:"num_teams,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type OrgMember struct {
	OrgID     int64     `json:"org_id"`
	UserID    int64     `json:"user_id"`
	Username  string    `json:"username"`
	FullName  string    `json:"full_name"`
	Email     string    `json:"email"`
	AvatarURL string    `json:"avatar_url"`
	Role      string    `json:"role"` // "owner", "admin", "member"
	CreatedAt time.Time `json:"created_at"`
}

type Team struct {
	ID          int64     `json:"id"`
	OrgID       int64     `json:"org_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Permission  string    `json:"permission"` // "read", "write", "admin"
	NumMembers  int       `json:"num_members,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

type TeamMember struct {
	TeamID    int64     `json:"team_id"`
	UserID    int64     `json:"user_id"`
	Username  string    `json:"username"`
	FullName  string    `json:"full_name"`
	CreatedAt time.Time `json:"created_at"`
}

type CollaboratorUser struct {
	UserID    int64     `json:"user_id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	FullName  string    `json:"full_name"`
	AvatarURL string    `json:"avatar_url"`
	Mode      string    `json:"mode"` // "read", "write", "admin"
	CreatedAt time.Time `json:"created_at"`
}

type Project struct {
	ID          int64           `json:"id"`
	RepoID      int64           `json:"repo_id"`
	Title       string          `json:"title"`
	Description string          `json:"description"`
	IsClosed    bool            `json:"is_closed"`
	CreatorID   int64           `json:"creator_id"`
	CreatorName string          `json:"creator_name,omitempty"`
	Columns     []ProjectColumn `json:"columns,omitempty"`
	TotalCards  int             `json:"total_cards,omitempty"`
	DoneCards   int             `json:"done_cards,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

type ProjectColumn struct {
	ID        int64         `json:"id"`
	ProjectID int64         `json:"project_id"`
	Title     string        `json:"title"`
	OrderNum  int           `json:"order_num"`
	Cards     []ProjectCard `json:"cards,omitempty"`
	CreatedAt time.Time     `json:"created_at"`
}

type ProjectCard struct {
	ID          int64     `json:"id"`
	ColumnID    int64     `json:"column_id"`
	ProjectID   int64     `json:"project_id"`
	IssueID     *int64    `json:"issue_id,omitempty"`
	Issue       *Issue    `json:"issue,omitempty"`
	Content     string    `json:"content"`
	OrderNum    int       `json:"order_num"`
	CreatorID   int64     `json:"creator_id"`
	CreatorName string    `json:"creator_name,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

