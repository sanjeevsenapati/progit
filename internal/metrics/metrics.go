package metrics

import (
	"database/sql"
	"fmt"
	"net/http"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

var (
	startTime = time.Now()
	version   = "1.7.0"

	// HTTP metrics
	httpRequestsTotal atomic.Uint64
	httpDurationsNs   atomic.Uint64

	// Status code buckets
	status2xx atomic.Uint64
	status3xx atomic.Uint64
	status4xx atomic.Uint64
	status5xx atomic.Uint64

	// Git operations counters
	gitClonesTotal atomic.Uint64
	gitPushesTotal atomic.Uint64
	gitGCTotal     atomic.Uint64

	// Path counters (thread-safe route group tracking)
	pathMu     sync.RWMutex
	pathCounts = make(map[string]*atomic.Uint64)

	// Injected providers
	dbProvider   func() *sql.DB
	diskProvider func() (usedBytes int64, freeBytes int64)
	statProvider func() (users int64, repos int64)
)

// SetVersion sets the application version reported by metrics.
func SetVersion(v string) {
	if v != "" {
		version = v
	}
}

// SetDBProvider configures the database instance for pool telemetry.
func SetDBProvider(provider func() *sql.DB) {
	dbProvider = provider
}

// SetDiskProvider configures the disk telemetry callback.
func SetDiskProvider(provider func() (int64, int64)) {
	diskProvider = provider
}

// SetStatProvider configures the user/repo count callback.
func SetStatProvider(provider func() (int64, int64)) {
	statProvider = provider
}

// RecordHTTPRequest records an incoming HTTP request completion.
func RecordHTTPRequest(method, routeGroup string, statusCode int, duration time.Duration) {
	httpRequestsTotal.Add(1)
	httpDurationsNs.Add(uint64(duration.Nanoseconds()))

	switch {
	case statusCode >= 200 && statusCode < 300:
		status2xx.Add(1)
	case statusCode >= 300 && statusCode < 400:
		status3xx.Add(1)
	case statusCode >= 400 && statusCode < 500:
		status4xx.Add(1)
	case statusCode >= 500:
		status5xx.Add(1)
	}

	if routeGroup != "" {
		key := fmt.Sprintf("%s %s", method, routeGroup)
		pathMu.RLock()
		counter, exists := pathCounts[key]
		pathMu.RUnlock()

		if !exists {
			pathMu.Lock()
			counter, exists = pathCounts[key]
			if !exists {
				counter = &atomic.Uint64{}
				pathCounts[key] = counter
			}
			pathMu.Unlock()
		}
		counter.Add(1)
	}
}

// RecordGitOperation increments counters for Git clone, push, or maintenance operations.
func RecordGitOperation(op string) {
	switch strings.ToLower(op) {
	case "clone", "upload-pack":
		gitClonesTotal.Add(1)
	case "push", "receive-pack":
		gitPushesTotal.Add(1)
	case "gc", "maintenance":
		gitGCTotal.Add(1)
	}
}

// FormatPrometheus serializes current metrics into the Prometheus text exposition format.
func FormatPrometheus() string {
	var sb strings.Builder

	// 1. Process & Build Info
	sb.WriteString("# HELP progit_info Application build information\n")
	sb.WriteString("# TYPE progit_info gauge\n")
	sb.WriteString(fmt.Sprintf("progit_info{version=%q,goversion=%q,arch=%q,os=%q} 1\n",
		version, runtime.Version(), runtime.GOARCH, runtime.GOOS))

	// 2. Uptime
	uptimeSeconds := time.Since(startTime).Seconds()
	sb.WriteString("# HELP progit_uptime_seconds Total runtime uptime in seconds\n")
	sb.WriteString("# TYPE progit_uptime_seconds gauge\n")
	sb.WriteString(fmt.Sprintf("progit_uptime_seconds %.2f\n", uptimeSeconds))

	// 3. Runtime & Memory Telemetry
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	sb.WriteString("# HELP progit_goroutines Current number of active goroutines\n")
	sb.WriteString("# TYPE progit_goroutines gauge\n")
	sb.WriteString(fmt.Sprintf("progit_goroutines %d\n", runtime.NumGoroutine()))

	sb.WriteString("# HELP progit_memory_alloc_bytes Bytes allocated and currently in use\n")
	sb.WriteString("# TYPE progit_memory_alloc_bytes gauge\n")
	sb.WriteString(fmt.Sprintf("progit_memory_alloc_bytes %d\n", mem.Alloc))

	sb.WriteString("# HELP progit_memory_sys_bytes Total bytes obtained from system\n")
	sb.WriteString("# TYPE progit_memory_sys_bytes gauge\n")
	sb.WriteString(fmt.Sprintf("progit_memory_sys_bytes %d\n", mem.Sys))

	sb.WriteString("# HELP progit_memory_heap_inuse_bytes Bytes in in-use heap spans\n")
	sb.WriteString("# TYPE progit_memory_heap_inuse_bytes gauge\n")
	sb.WriteString(fmt.Sprintf("progit_memory_heap_inuse_bytes %d\n", mem.HeapInuse))

	sb.WriteString("# HELP progit_gc_cycles_total Total number of completed GC cycles\n")
	sb.WriteString("# TYPE progit_gc_cycles_total counter\n")
	sb.WriteString(fmt.Sprintf("progit_gc_cycles_total %d\n", mem.NumGC))

	// 4. HTTP Telemetry
	totalReqs := httpRequestsTotal.Load()
	sb.WriteString("# HELP progit_http_requests_total Total HTTP requests handled\n")
	sb.WriteString("# TYPE progit_http_requests_total counter\n")
	sb.WriteString(fmt.Sprintf("progit_http_requests_total %d\n", totalReqs))

	sb.WriteString("# HELP progit_http_requests_by_status Total HTTP requests partitioned by status class\n")
	sb.WriteString("# TYPE progit_http_requests_by_status counter\n")
	sb.WriteString(fmt.Sprintf("progit_http_requests_by_status{status_class=\"2xx\"} %d\n", status2xx.Load()))
	sb.WriteString(fmt.Sprintf("progit_http_requests_by_status{status_class=\"3xx\"} %d\n", status3xx.Load()))
	sb.WriteString(fmt.Sprintf("progit_http_requests_by_status{status_class=\"4xx\"} %d\n", status4xx.Load()))
	sb.WriteString(fmt.Sprintf("progit_http_requests_by_status{status_class=\"5xx\"} %d\n", status5xx.Load()))

	durationsSec := float64(httpDurationsNs.Load()) / 1e9
	sb.WriteString("# HELP progit_http_request_duration_seconds_sum Cumulative duration of all HTTP requests in seconds\n")
	sb.WriteString("# TYPE progit_http_request_duration_seconds_sum counter\n")
	sb.WriteString(fmt.Sprintf("progit_http_request_duration_seconds_sum %.6f\n", durationsSec))

	// Per-route group counts
	pathMu.RLock()
	if len(pathCounts) > 0 {
		sb.WriteString("# HELP progit_http_route_requests_total Requests per HTTP route group\n")
		sb.WriteString("# TYPE progit_http_route_requests_total counter\n")
		for key, cnt := range pathCounts {
			parts := strings.SplitN(key, " ", 2)
			if len(parts) == 2 {
				sb.WriteString(fmt.Sprintf("progit_http_route_requests_total{method=%q,route=%q} %d\n", parts[0], parts[1], cnt.Load()))
			}
		}
	}
	pathMu.RUnlock()

	// 5. Git Engine Telemetry
	sb.WriteString("# HELP progit_git_operations_total Cumulative Git operations processed\n")
	sb.WriteString("# TYPE progit_git_operations_total counter\n")
	sb.WriteString(fmt.Sprintf("progit_git_operations_total{operation=\"clone\"} %d\n", gitClonesTotal.Load()))
	sb.WriteString(fmt.Sprintf("progit_git_operations_total{operation=\"push\"} %d\n", gitPushesTotal.Load()))
	sb.WriteString(fmt.Sprintf("progit_git_operations_total{operation=\"gc\"} %d\n", gitGCTotal.Load()))

	// 6. Database Connection Pool Telemetry
	if dbProvider != nil {
		if db := dbProvider(); db != nil {
			stats := db.Stats()
			sb.WriteString("# HELP progit_db_open_connections Current open connections to the database\n")
			sb.WriteString("# TYPE progit_db_open_connections gauge\n")
			sb.WriteString(fmt.Sprintf("progit_db_open_connections %d\n", stats.OpenConnections))

			sb.WriteString("# HELP progit_db_in_use_connections Current connections in active use\n")
			sb.WriteString("# TYPE progit_db_in_use_connections gauge\n")
			sb.WriteString(fmt.Sprintf("progit_db_in_use_connections %d\n", stats.InUse))

			sb.WriteString("# HELP progit_db_idle_connections Current idle pool connections\n")
			sb.WriteString("# TYPE progit_db_idle_connections gauge\n")
			sb.WriteString(fmt.Sprintf("progit_db_idle_connections %d\n", stats.Idle))

			sb.WriteString("# HELP progit_db_wait_count_total Total times a connection was waited for\n")
			sb.WriteString("# TYPE progit_db_wait_count_total counter\n")
			sb.WriteString(fmt.Sprintf("progit_db_wait_count_total %d\n", stats.WaitCount))
		}
	}

	// 7. System Entity Telemetry
	if statProvider != nil {
		users, repos := statProvider()
		sb.WriteString("# HELP progit_users_total Total registered users\n")
		sb.WriteString("# TYPE progit_users_total gauge\n")
		sb.WriteString(fmt.Sprintf("progit_users_total %d\n", users))

		sb.WriteString("# HELP progit_repositories_total Total hosted repositories\n")
		sb.WriteString("# TYPE progit_repositories_total gauge\n")
		sb.WriteString(fmt.Sprintf("progit_repositories_total %d\n", repos))
	}

	// 8. Disk Telemetry
	if diskProvider != nil {
		used, free := diskProvider()
		if used > 0 || free > 0 {
			sb.WriteString("# HELP progit_disk_used_bytes Storage disk used in bytes\n")
			sb.WriteString("# TYPE progit_disk_used_bytes gauge\n")
			sb.WriteString(fmt.Sprintf("progit_disk_used_bytes %d\n", used))

			sb.WriteString("# HELP progit_disk_free_bytes Storage disk available in bytes\n")
			sb.WriteString("# TYPE progit_disk_free_bytes gauge\n")
			sb.WriteString(fmt.Sprintf("progit_disk_free_bytes %d\n", free))
		}
	}

	return sb.String()
}

// Handler returns an http.HandlerFunc that exports the Prometheus text format.
func Handler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(FormatPrometheus()))
	}
}
