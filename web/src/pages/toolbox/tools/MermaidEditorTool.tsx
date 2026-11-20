import React, { useMemo, useRef, useState } from 'react';
import { Download, RefreshCw, Sparkles, ZoomIn, ZoomOut } from 'lucide-react';
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
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-xs">
          <span className="font-semibold text-gray-500 dark:text-dark-muted">Template:</span>
          <div className="w-56">
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

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setZoom(z => Math.max(0.5, z - 0.15))}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded text-gray-600 dark:text-dark-text"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-mono text-gray-500">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom(z => Math.min(2.5, z + 0.15))}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded text-gray-600 dark:text-dark-text"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded text-gray-600 dark:text-dark-text"
              title="Reset Zoom"
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
            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>PNG</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Editor */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-dark-muted px-1">
            <span className="font-semibold uppercase tracking-wider">Mermaid Syntax</span>
            <span>{code.split('\n').length} lines</span>
          </div>
          <textarea
            value={code}
            onChange={e => setCode(e.target.value)}
            rows={18}
            className="w-full font-mono text-xs p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y leading-relaxed"
            placeholder="flowchart TD&#10;A --> B"
          />
        </div>

        {/* Live SVG Preview */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-dark-muted px-1">
            <span className="font-semibold uppercase tracking-wider flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Live Diagram Preview</span>
            </span>
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">Auto-rendered</span>
          </div>

          <div
            ref={containerRef}
            className="min-h-[380px] p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg overflow-auto flex items-center justify-center relative"
          >
            {error ? (
              <ToolError error={error} />
            ) : svg ? (
              <div
                style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 0.15s ease' }}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <p className="text-xs text-gray-400">Type valid Mermaid syntax to view diagram</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MermaidEditorTool;
