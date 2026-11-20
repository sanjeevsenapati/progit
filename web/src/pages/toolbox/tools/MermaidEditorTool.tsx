import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Code,
  Columns,
  Download,
  Eye,
  Maximize2,
  Minimize2,
  RefreshCw,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { CopyButton, ThemedSelect, ToolError } from '../components/ToolUI';
import { renderMermaidSvg } from '../lib/mermaid';

const SAMPLES: Record<string, { label: string; code: string }> = {
  flowchart: {
    label: 'Flowchart (Architecture)',
    code: `flowchart TD
Client([Web Browser / Mobile]) -->|HTTPS / WSS| CDN[Cloudflare CDN]
CDN -->|Route Traffic| LB[HAProxy Load Balancer]
LB -->|Round Robin| App1[ProGit App Server A]
LB -->|Round Robin| App2[ProGit App Server B]
App1 -->|Read / Write| DB[(PostgreSQL 16 HA)]
App2 -->|Read / Write| DB
App1 -->|Cache & PubSub| Redis[(Redis Cluster)]
App2 -->|Cache & PubSub| Redis`,
  },
  sequence: {
    label: 'Sequence (OIDC SSO Flow)',
    code: `sequenceDiagram
participant User as End User
participant Browser as Web Browser
participant ProGit as ProGit Server
participant Keycloak as Keycloak OIDC

User ->> Browser: Clicks "Sign in with SSO"
Browser ->> ProGit: GET /api/v1/auth/oidc/login
ProGit -->> Browser: Redirect to Keycloak /auth
Browser ->> Keycloak: Authenticate credentials
Keycloak -->> Browser: Redirect callback with ?code=xyz
Browser ->> ProGit: GET /api/v1/auth/oidc/callback?code=xyz
ProGit ->> Keycloak: POST /protocol/openid-connect/token
Keycloak -->> ProGit: Returns access_token & id_token
ProGit -->> Browser: Sets session cookie & redirect dashboard`,
  },
  state: {
    label: 'State Machine (Pull Request)',
    code: `stateDiagram-v2
[*] --> Draft: User creates draft PR
Draft --> Open: Mark ready for review
Open --> Reviewing: Assign reviewers
Reviewing --> ChangesRequested: Reviewer requests changes
ChangesRequested --> Reviewing: Commits pushed
Reviewing --> Approved: All checks & approvals pass
Approved --> Merging: Auto-merge triggered
Merging --> Merged: Rebase and fast-forward
Merged --> [*]
Open --> Closed: Abandon pull request
Closed --> [*]`,
  },
  pie: {
    label: 'Pie Chart (Git Commits by Language)',
    code: `pie title Repository Code Distribution
"Go (Backend)" : 520
"TypeScript (React UI)" : 380
"SQL (Migrations)" : 85
"Shell & Docker" : 45
"Markdown Docs" : 30`,
  },
};

export const MermaidEditorTool: React.FC = () => {
  const [sampleKey, setSampleKey] = useState<string>('flowchart');
  const [code, setCode] = useState<string>(SAMPLES.flowchart.code);
  const [zoom, setZoom] = useState<number>(1);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'split' | 'preview' | 'code'>('split');
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle Escape key to exit full page view and lock body scroll
  useEffect(() => {
    if (!isFullScreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = origOverflow;
    };
  }, [isFullScreen]);

  const { svg, error } = useMemo(() => {
    const isDark = document.documentElement.classList.contains('dark');
    return renderMermaidSvg(code, isDark);
  }, [code]);

  const handleDownloadSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `progit-diagram-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPng = () => {
    if (!svg) return;
    const img = new Image();
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width * 2 || 1200;
      canvas.height = img.height * 2 || 800;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(2, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `progit-diagram-${Date.now()}.png`;
        a.click();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const toolbarControls = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Left: Template & View Mode */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-gray-500 dark:text-dark-muted">Template:</span>
          <div className="w-52">
            <ThemedSelect
              value={sampleKey}
              onChange={val => {
                setSampleKey(val);
                if (SAMPLES[val]) setCode(SAMPLES[val].code);
              }}
              options={Object.entries(SAMPLES).map(([k, v]) => ({ value: k, label: v.label }))}
            />
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              viewMode === 'split'
                ? 'bg-emerald-600 text-white'
                : 'text-gray-600 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white'
            }`}
            title="Split Editor & Diagram"
          >
            <Columns className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Split</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('preview')}
            className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              viewMode === 'preview'
                ? 'bg-emerald-600 text-white'
                : 'text-gray-600 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white'
            }`}
            title="Diagram Only"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Diagram</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('code')}
            className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              viewMode === 'code'
                ? 'bg-emerald-600 text-white'
                : 'text-gray-600 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white'
            }`}
            title="Code Editor Only"
          >
            <Code className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Code</span>
          </button>
        </div>
      </div>

      {/* Right: Zoom, Export & Fullscreen */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setZoom(z => Math.max(0.4, Number((z - 0.15).toFixed(2))))}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded text-gray-600 dark:text-dark-text"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="px-2 font-mono text-gray-500 dark:text-dark-muted">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom(z => Math.min(3, Number((z + 0.15).toFixed(2))))}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded text-gray-600 dark:text-dark-text"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded text-gray-600 dark:text-dark-text"
            title="Reset Zoom (100%)"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <CopyButton value={code} label="Copy Code" />
        <CopyButton value={svg} label="Copy SVG" />

        <button
          type="button"
          onClick={handleDownloadSvg}
          disabled={!svg}
          className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-40"
        >
          <Download className="w-3.5 h-3.5 text-sky-500" />
          <span>SVG</span>
        </button>
        <button
          type="button"
          onClick={handleDownloadPng}
          disabled={!svg}
          className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          <span>PNG</span>
        </button>

        {/* Full Page View Button */}
        {isFullScreen ? (
          <button
            type="button"
            onClick={() => setIsFullScreen(false)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-900 text-white dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors shadow-sm cursor-pointer ml-1"
            title="Exit Full Page View (Escape)"
          >
            <Minimize2 className="w-3.5 h-3.5 text-rose-400 dark:text-rose-600" />
            <span>Exit Full Page</span>
            <kbd className="hidden md:inline-block ml-1 px-1 py-0.2 text-[10px] rounded bg-white/20 dark:bg-black/10 font-mono">
              Esc
            </kbd>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIsFullScreen(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm transition-colors cursor-pointer ml-1"
            title="Open Full Page View (Expanded Focus Canvas)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Full Page</span>
          </button>
        )}
      </div>
    </div>
  );

  const editorPane = (
    <div className={`space-y-1.5 ${isFullScreen ? 'flex flex-col h-full min-h-0' : ''}`}>
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-dark-muted px-1 flex-shrink-0">
        <span className="font-semibold uppercase tracking-wider">Mermaid Syntax</span>
        <span>
          {code.split('\n').length} lines • {code.length} chars
        </span>
      </div>
      <textarea
        value={code}
        onChange={e => setCode(e.target.value)}
        rows={isFullScreen ? undefined : 18}
        className={`w-full font-mono text-xs p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed ${
          isFullScreen ? 'flex-1 min-h-0 resize-none' : 'resize-y'
        }`}
        placeholder="flowchart TD&#10;A --> B"
      />
    </div>
  );

  const previewPane = (
    <div className={`space-y-1.5 ${isFullScreen ? 'flex flex-col h-full min-h-0' : ''}`}>
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-dark-muted px-1 flex-shrink-0">
        <span className="font-semibold uppercase tracking-wider flex items-center space-x-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>Live Diagram Canvas</span>
        </span>
        <span className="text-emerald-600 dark:text-emerald-400 font-medium">Auto-rendered</span>
      </div>

      <div
        ref={containerRef}
        className={`p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface overflow-auto flex items-center justify-center relative shadow-inner ${
          isFullScreen ? 'flex-1 min-h-0' : 'min-h-[420px]'
        }`}
      >
        {error ? (
          <ToolError error={error} />
        ) : svg ? (
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
              transition: 'transform 0.15s ease',
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <p className="text-xs text-gray-400">Type valid Mermaid syntax to view diagram</p>
        )}
      </div>
    </div>
  );

  // Full Page Mode Overlay
  if (isFullScreen) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-dark-bg p-4 sm:p-6 flex flex-col h-screen w-screen overflow-hidden animate-in fade-in duration-150">
        {/* Full Page Header */}
        <div className="flex-shrink-0 pb-3 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                Mermaid Live Editor
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                Full Page Focus
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsFullScreen(false)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-dark-hover transition-colors"
              title="Close Full Page (Esc)"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>

          {toolbarControls}
        </div>

        {/* Full Page Main Content Body */}
        <div className="flex-1 min-h-0 pt-3">
          {viewMode === 'split' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full min-h-0">
              {editorPane}
              {previewPane}
            </div>
          )}

          {viewMode === 'preview' && (
            <div className="h-full min-h-0 flex flex-col">{previewPane}</div>
          )}

          {viewMode === 'code' && (
            <div className="h-full min-h-0 flex flex-col">{editorPane}</div>
          )}
        </div>
      </div>
    );
  }

  // Normal In-Card View
  return (
    <div className="space-y-4">
      {toolbarControls}

      {viewMode === 'split' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {editorPane}
          {previewPane}
        </div>
      )}

      {viewMode === 'preview' && (
        <div className="w-full">{previewPane}</div>
      )}

      {viewMode === 'code' && (
        <div className="w-full">{editorPane}</div>
      )}
    </div>
  );
};

export default MermaidEditorTool;
