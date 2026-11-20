import{c as G,r as M,j as t,n as _,R as U,k as E,f as Z}from"./index-DwrvKE82.js";import{C as T,T as q}from"./ToolUI-Dyh73zeX.js";/**
 * @license lucide-react v1.65.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const I={name:"zoom-in",size:24,node:[["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}],["line",{x1:"21",x2:"16.65",y1:"21",y2:"16.65",key:"13gj7c"}],["line",{x1:"11",x2:"11",y1:"8",y2:"14",key:"1vmskp"}],["line",{x1:"8",x2:"14",y1:"11",y2:"11",key:"durymu"}]]};I.node;const H=G(I);/**
 * @license lucide-react v1.65.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const O={name:"zoom-out",size:24,node:[["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}],["line",{x1:"21",x2:"16.65",y1:"21",y2:"16.65",key:"13gj7c"}],["line",{x1:"8",x2:"14",y1:"11",y2:"11",key:"durymu"}]]};O.node;const K=G(O);function X(m,s=!1){const d=m.trim();if(!d)return{svg:"",type:"empty"};const n=d.split(/\r?\n/).map(h=>h.trim()).filter(Boolean),o=n[0].toLowerCase();try{return o.startsWith("flowchart")||o.startsWith("graph")?{svg:L(n,s),type:"flowchart"}:o.startsWith("sequencediagram")?{svg:F(n,s),type:"sequence"}:o.startsWith("statediagram")?{svg:Y(n,s),type:"state"}:o.startsWith("pie")?{svg:Q(n,s),type:"pie"}:o.startsWith("classdiagram")?{svg:V(n,s),type:"class"}:{svg:L(n,s),type:"flowchart"}}catch(h){return{svg:"",type:"error",error:h.message||"Syntax error parsing Mermaid diagram"}}}function L(m,s){const n=m[0].toLowerCase().includes("lr"),o=new Map,h=[],j=e=>{const r=e.match(/^([a-zA-Z0-9_-]+)\s*\(\[(.*?)\]\)$/);if(r)return o.set(r[1],{id:r[1],label:r[2],shape:"stadium"}),r[1];const x=e.match(/^([a-zA-Z0-9_-]+)\s*\(\((.*?)\)\)$/);if(x)return o.set(x[1],{id:x[1],label:x[2],shape:"circle"}),x[1];const y=e.match(/^([a-zA-Z0-9_-]+)\s*\{(.*?)\}$/);if(y)return o.set(y[1],{id:y[1],label:y[2],shape:"diamond"}),y[1];const k=e.match(/^([a-zA-Z0-9_-]+)\s*\((.*?)\)$/);if(k)return o.set(k[1],{id:k[1],label:k[2],shape:"round"}),k[1];const C=e.match(/^([a-zA-Z0-9_-]+)\s*\[(.*?)\]$/);if(C)return o.set(C[1],{id:C[1],label:C[2],shape:"rect"}),C[1];const R=e.trim();return R&&!o.has(R)&&o.set(R,{id:R,label:R,shape:"rect"}),R};for(let e=1;e<m.length;e++){const r=m[e];if(r.startsWith("subgraph")||r==="end"||r.startsWith("style")||r.startsWith("%%"))continue;const x=r.match(/(.+?)\s*(-->|---|-\.->|==>)(?:\|(.*?)\|)?\s*(.+)/);if(x){const[,y,k,C,R]=x,D=j(y.trim()),P=j(R.trim());h.push({from:D,to:P,label:C==null?void 0:C.trim(),dashed:k.includes("."),thick:k.includes("=")})}else j(r)}const i=Array.from(o.values());if(i.length===0)return`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><text x="50" y="50" fill="${s?"#94a3b8":"#64748b"}">Empty Diagram</text></svg>`;const p=140,$=50,v=n?180:80,a=n?70:100,f=new Map;i.forEach((e,r)=>f.set(e.id,r));const c=n?i.length*v+80:400,g=n?280:i.length*a+80;i.forEach((e,r)=>{n?(e.x=40+r*v,e.y=80+(r%2===0?0:60)):(e.x=c/2-p/2,e.y=40+r*a)});const w=s?"#0f172a":"#ffffff",S=s?"#1e293b":"#f8fafc",b=s?"#38bdf8":"#0284c7",N=s?"#f1f5f9":"#0f172a",l=s?"#94a3b8":"#64748b";let u="";return h.forEach(e=>{const r=o.get(e.from),x=o.get(e.to);if(!r||!x||r.x===void 0||x.x===void 0)return;const y=r.x+p/2,k=r.y+$,C=x.x+p/2,R=x.y,D=e.dashed?'stroke-dasharray="4,4"':"",P=e.thick?3:1.75;if(u+=`<line x1="${y}" y1="${k}" x2="${C}" y2="${R}" stroke="${l}" stroke-width="${P}" ${D} marker-end="url(#arrow)" />`,e.label){const z=(y+C)/2,W=(k+R)/2;u+=`<rect x="${z-30}" y="${W-10}" width="60" height="20" rx="4" fill="${w}" opacity="0.9"/>`,u+=`<text x="${z}" y="${W+4}" fill="${l}" font-size="11" font-family="sans-serif" text-anchor="middle">${A(e.label)}</text>`}}),i.forEach(e=>{const r=e.shape==="round"?12:e.shape==="stadium"?24:e.shape==="circle"?25:6;u+=`
      <rect x="${e.x}" y="${e.y}" width="${p}" height="${$}" rx="${r}" fill="${S}" stroke="${b}" stroke-width="2"/>
      <text x="${e.x+p/2}" y="${e.y+$/2+5}" fill="${N}" font-size="13" font-weight="600" font-family="sans-serif" text-anchor="middle">${A(e.label)}</text>
    `}),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${c} ${g}" width="${c}" height="${g}">
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="${l}" />
      </marker>
    </defs>
    <rect width="100%" height="100%" fill="${w}" />
    ${u}
  </svg>`}function F(m,s){const d=[],n=[],o=(l,u)=>{d.some(e=>e.id===l)||d.push({id:l,name:u||l})};for(let l=1;l<m.length;l++){const u=m[l];if(u.startsWith("participant")||u.startsWith("actor")){const r=u.match(/(?:participant|actor)\s+([a-zA-Z0-9_-]+)(?:\s+as\s+(.*))?/);r&&o(r[1],r[2]);continue}const e=u.match(/([a-zA-Z0-9_-]+)\s*(->>|-->>|->|-->)\s*([a-zA-Z0-9_-]+)\s*:\s*(.*)/);if(e){const[,r,x,y,k]=e;o(r),o(y),n.push({from:r,to:y,text:k,dashed:x.includes("--"),isAsync:x.includes(">>")})}}const h=120,j=40,i=170,p=45,$=Math.max(500,d.length*i+60),v=100+n.length*p+60,a=s?"#0f172a":"#ffffff",f=s?"#1e293b":"#f0fdf4",c=s?"#10b981":"#059669",g=s?"#f1f5f9":"#0f172a",w=s?"#475569":"#cbd5e1",S=s?"#38bdf8":"#0284c7";let b="";const N=new Map;return d.forEach((l,u)=>{const e=50+u*i;N.set(l.id,e+h/2),b+=`<line x1="${e+h/2}" y1="50" x2="${e+h/2}" y2="${v-40}" stroke="${w}" stroke-width="1.5" stroke-dasharray="4,4"/>`,b+=`
      <rect x="${e}" y="20" width="${h}" height="${j}" rx="6" fill="${f}" stroke="${c}" stroke-width="2"/>
      <text x="${e+h/2}" y="45" fill="${g}" font-size="12" font-weight="600" font-family="sans-serif" text-anchor="middle">${A(l.name)}</text>
    `,b+=`
      <rect x="${e}" y="${v-40}" width="${h}" height="${j}" rx="6" fill="${f}" stroke="${c}" stroke-width="2"/>
      <text x="${e+h/2}" y="${v-15}" fill="${g}" font-size="12" font-weight="600" font-family="sans-serif" text-anchor="middle">${A(l.name)}</text>
    `}),n.forEach((l,u)=>{const e=N.get(l.from)||100,r=N.get(l.to)||250,x=90+u*p,y=l.dashed?'stroke-dasharray="4,4"':"";b+=`<line x1="${e}" y1="${x}" x2="${r}" y2="${x}" stroke="${S}" stroke-width="2" ${y} marker-end="url(#seq-arrow)"/>`,b+=`<text x="${(e+r)/2}" y="${x-8}" fill="${g}" font-size="11" font-family="sans-serif" text-anchor="middle">${A(l.text)}</text>`}),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${$} ${v}" width="${$}" height="${v}">
    <defs>
      <marker id="seq-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="${S}" />
      </marker>
    </defs>
    <rect width="100%" height="100%" fill="${a}" />
    ${b}
  </svg>`}function Y(m,s){return L(m.map(d=>d.replace(/stateDiagram(?:-v2)?/i,"flowchart TD")),s)}function Q(m,s){let d="Pie Chart";const n=[];for(const f of m){if(f.toLowerCase().startsWith("pie")){const g=f.match(/title\s+(.*)/i);g&&(d=g[1].trim());continue}const c=f.match(/"(.*?)"\s*:\s*(\d+(?:\.\d+)?)/);c&&n.push({label:c[1],value:parseFloat(c[2])})}const o=n.reduce((f,c)=>f+c.value,0)||1,h=["#10b981","#3b82f6","#f59e0b","#ec4899","#8b5cf6","#06b6d4","#64748b"],j=200,i=200,p=130;let $=0,v="",a="";return n.forEach((f,c)=>{const g=f.value/o*360,w=$+g,S=h[c%h.length],b=j+p*Math.cos(Math.PI*$/180),N=i+p*Math.sin(Math.PI*$/180),l=j+p*Math.cos(Math.PI*w/180),u=i+p*Math.sin(Math.PI*w/180),e=g>180?1:0;v+=`<path d="M ${j} ${i} L ${b} ${N} A ${p} ${p} 0 ${e} 1 ${l} ${u} Z" fill="${S}" stroke="${s?"#0f172a":"#ffffff"}" stroke-width="2"/>`;const r=Math.round(f.value/o*100);a+=`
      <rect x="360" y="${60+c*28}" width="14" height="14" rx="3" fill="${S}"/>
      <text x="382" y="${72+c*28}" fill="${s?"#f1f5f9":"#0f172a"}" font-size="12" font-family="sans-serif">${A(f.label)} (${r}%)</text>
    `,$=w}),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 380" width="540" height="380">
    <rect width="100%" height="100%" fill="${s?"#0f172a":"#ffffff"}"/>
    <text x="270" y="30" fill="${s?"#f1f5f9":"#0f172a"}" font-size="16" font-weight="bold" font-family="sans-serif" text-anchor="middle">${A(d)}</text>
    ${v}
    ${a}
  </svg>`}function V(m,s){return L(m.map(d=>d.replace(/classDiagram/i,"flowchart TD")),s)}function A(m){return m.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}const B={flowchart:{label:"Flowchart (Architecture)",code:`flowchart TD
Client([Web Browser / Mobile]) -->|HTTPS / WSS| CDN[Cloudflare CDN]
CDN -->|Route Traffic| LB[HAProxy Load Balancer]
LB -->|Round Robin| App1[ProGit App Server A]
LB -->|Round Robin| App2[ProGit App Server B]
App1 -->|Read / Write| DB[(PostgreSQL 16 HA)]
App2 -->|Read / Write| DB
App1 -->|Cache & PubSub| Redis[(Redis Cluster)]
App2 -->|Cache & PubSub| Redis`},sequence:{label:"Sequence (OIDC SSO Flow)",code:`sequenceDiagram
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
ProGit -->> Browser: Sets session cookie & redirect dashboard`},state:{label:"State Machine (Pull Request)",code:`stateDiagram-v2
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
Closed --> [*]`},pie:{label:"Pie Chart (Git Commits by Language)",code:`pie title Repository Code Distribution
"Go (Backend)" : 520
"TypeScript (React UI)" : 380
"SQL (Migrations)" : 85
"Shell & Docker" : 45
"Markdown Docs" : 30`}},te=()=>{const[m,s]=M.useState("flowchart"),[d,n]=M.useState(B.flowchart.code),[o,h]=M.useState(1),j=M.useRef(null),{svg:i,error:p}=M.useMemo(()=>{const a=document.documentElement.classList.contains("dark");return X(d,a)},[d]),$=()=>{if(!i)return;const a=new Blob([i],{type:"image/svg+xml;charset=utf-8"}),f=URL.createObjectURL(a),c=document.createElement("a");c.href=f,c.download=`progit-diagram-${Date.now()}.svg`,c.click(),URL.revokeObjectURL(f)},v=()=>{if(!i)return;const a=new Image,f=new Blob([i],{type:"image/svg+xml;charset=utf-8"}),c=URL.createObjectURL(f);a.onload=()=>{const g=document.createElement("canvas");g.width=a.width*2||1200,g.height=a.height*2||800;const w=g.getContext("2d");if(w){w.scale(2,2),w.fillStyle="#ffffff",w.fillRect(0,0,g.width,g.height),w.drawImage(a,0,0);const S=g.toDataURL("image/png"),b=document.createElement("a");b.href=S,b.download=`progit-diagram-${Date.now()}.png`,b.click()}URL.revokeObjectURL(c)},a.src=c};return t.jsxs("div",{className:"space-y-4",children:[t.jsxs("div",{className:"flex flex-wrap items-center justify-between gap-3",children:[t.jsxs("div",{className:"flex items-center space-x-2 text-xs",children:[t.jsx("span",{className:"font-semibold text-gray-500 dark:text-dark-muted",children:"Template:"}),t.jsx("div",{className:"w-56",children:t.jsx(_,{value:m,onChange:a=>{s(a),B[a]&&n(B[a].code)},options:Object.entries(B).map(([a,f])=>({value:a,label:f.label}))})})]}),t.jsxs("div",{className:"flex flex-wrap items-center gap-2",children:[t.jsxs("div",{className:"inline-flex items-center rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg p-0.5 text-xs",children:[t.jsx("button",{type:"button",onClick:()=>h(a=>Math.max(.5,a-.15)),className:"p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded text-gray-600 dark:text-dark-text",title:"Zoom Out",children:t.jsx(K,{className:"w-3.5 h-3.5"})}),t.jsxs("span",{className:"px-2 font-mono text-gray-500",children:[Math.round(o*100),"%"]}),t.jsx("button",{type:"button",onClick:()=>h(a=>Math.min(2.5,a+.15)),className:"p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded text-gray-600 dark:text-dark-text",title:"Zoom In",children:t.jsx(H,{className:"w-3.5 h-3.5"})}),t.jsx("button",{type:"button",onClick:()=>h(1),className:"p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded text-gray-600 dark:text-dark-text",title:"Reset Zoom",children:t.jsx(U,{className:"w-3.5 h-3.5"})})]}),t.jsx(T,{value:d,label:"Copy Code"}),t.jsx(T,{value:i,label:"Copy SVG"}),t.jsxs("button",{type:"button",onClick:$,disabled:!i,className:"inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-40",children:[t.jsx(E,{className:"w-3.5 h-3.5 text-sky-500"}),t.jsx("span",{children:"SVG"})]}),t.jsxs("button",{type:"button",onClick:v,disabled:!i,className:"inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40",children:[t.jsx(E,{className:"w-3.5 h-3.5"}),t.jsx("span",{children:"PNG"})]})]})]}),t.jsxs("div",{className:"grid grid-cols-1 lg:grid-cols-2 gap-4",children:[t.jsxs("div",{className:"space-y-1.5",children:[t.jsxs("div",{className:"flex items-center justify-between text-xs text-gray-500 dark:text-dark-muted px-1",children:[t.jsx("span",{className:"font-semibold uppercase tracking-wider",children:"Mermaid Syntax"}),t.jsxs("span",{children:[d.split(`
`).length," lines"]})]}),t.jsx("textarea",{value:d,onChange:a=>n(a.target.value),rows:18,className:"w-full font-mono text-xs p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y leading-relaxed",placeholder:`flowchart TD
A --> B`})]}),t.jsxs("div",{className:"space-y-1.5",children:[t.jsxs("div",{className:"flex items-center justify-between text-xs text-gray-500 dark:text-dark-muted px-1",children:[t.jsxs("span",{className:"font-semibold uppercase tracking-wider flex items-center space-x-1.5",children:[t.jsx(Z,{className:"w-3.5 h-3.5 text-amber-500"}),t.jsx("span",{children:"Live Diagram Preview"})]}),t.jsx("span",{className:"text-emerald-600 dark:text-emerald-400 font-medium",children:"Auto-rendered"})]}),t.jsx("div",{ref:j,className:"min-h-[380px] p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg overflow-auto flex items-center justify-center relative",children:p?t.jsx(q,{error:p}):i?t.jsx("div",{style:{transform:`scale(${o})`,transformOrigin:"center center",transition:"transform 0.15s ease"},dangerouslySetInnerHTML:{__html:i}}):t.jsx("p",{className:"text-xs text-gray-400",children:"Type valid Mermaid syntax to view diagram"})})]})]})]})};export{te as MermaidEditorTool,te as default};
