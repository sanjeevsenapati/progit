// Standalone Mermaid diagram parser and SVG renderer
// Supports: Flowcharts (TD/LR), Sequence Diagrams, State Diagrams, Pie Charts, and Class Diagrams

export interface MermaidRenderResult {
  svg: string;
  type: string;
  error?: string;
}

export function renderMermaidSvg(code: string, isDarkMode = false): MermaidRenderResult {
  const trimmed = code.trim();
  if (!trimmed) {
    return { svg: '', type: 'empty' };
  }

  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const firstLine = lines[0].toLowerCase();

  try {
    if (firstLine.startsWith('flowchart') || firstLine.startsWith('graph')) {
      return { svg: renderFlowchart(lines, isDarkMode), type: 'flowchart' };
    }
    if (firstLine.startsWith('sequencediagram')) {
      return { svg: renderSequenceDiagram(lines, isDarkMode), type: 'sequence' };
    }
    if (firstLine.startsWith('statediagram')) {
      return { svg: renderStateDiagram(lines, isDarkMode), type: 'state' };
    }
    if (firstLine.startsWith('pie')) {
      return { svg: renderPieChart(lines, isDarkMode), type: 'pie' };
    }
    if (firstLine.startsWith('classdiagram')) {
      return { svg: renderClassDiagram(lines, isDarkMode), type: 'class' };
    }

    // Default fallback: parse as flowchart
    return { svg: renderFlowchart(lines, isDarkMode), type: 'flowchart' };
  } catch (err: any) {
    return {
      svg: '',
      type: 'error',
      error: err.message || 'Syntax error parsing Mermaid diagram',
    };
  }
}

// 1. Flowchart Renderer
function renderFlowchart(lines: string[], dark: boolean): string {
  const header = lines[0].toLowerCase();
  const isLR = header.includes('lr');

  interface Node {
    id: string;
    label: string;
    shape: 'rect' | 'round' | 'stadium' | 'diamond' | 'circle';
    x?: number;
    y?: number;
  }
  interface Edge {
    from: string;
    to: string;
    label?: string;
    dashed?: boolean;
    thick?: boolean;
  }

  const nodes = new Map<string, Node>();
  const edges: Edge[] = [];

  const parseNode = (str: string): string => {
    // Check shapes: [rect], (round), ([stadium]), {diamond}, ((circle))
    const stadium = str.match(/^([a-zA-Z0-9_-]+)\s*\(\[(.*?)\]\)$/);
    if (stadium) {
      nodes.set(stadium[1], { id: stadium[1], label: stadium[2], shape: 'stadium' });
      return stadium[1];
    }
    const circle = str.match(/^([a-zA-Z0-9_-]+)\s*\(\((.*?)\)\)$/);
    if (circle) {
      nodes.set(circle[1], { id: circle[1], label: circle[2], shape: 'circle' });
      return circle[1];
    }
    const diamond = str.match(/^([a-zA-Z0-9_-]+)\s*\{(.*?)\}$/);
    if (diamond) {
      nodes.set(diamond[1], { id: diamond[1], label: diamond[2], shape: 'diamond' });
      return diamond[1];
    }
    const round = str.match(/^([a-zA-Z0-9_-]+)\s*\((.*?)\)$/);
    if (round) {
      nodes.set(round[1], { id: round[1], label: round[2], shape: 'round' });
      return round[1];
    }
    const rect = str.match(/^([a-zA-Z0-9_-]+)\s*\[(.*?)\]$/);
    if (rect) {
      nodes.set(rect[1], { id: rect[1], label: rect[2], shape: 'rect' });
      return rect[1];
    }

    const cleanId = str.trim();
    if (cleanId && !nodes.has(cleanId)) {
      nodes.set(cleanId, { id: cleanId, label: cleanId, shape: 'rect' });
    }
    return cleanId;
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('subgraph') || line === 'end' || line.startsWith('style') || line.startsWith('%%')) {
      continue;
    }

    // Match links: A -->|label| B, A --- B, A -.-> B, A ==> B
    const linkMatch = line.match(/(.+?)\s*(-->|---|-\.->|==>)(?:\|(.*?)\|)?\s*(.+)/);
    if (linkMatch) {
      const [, rawFrom, arrow, label, rawTo] = linkMatch;
      const fromId = parseNode(rawFrom.trim());
      const toId = parseNode(rawTo.trim());
      edges.push({
        from: fromId,
        to: toId,
        label: label?.trim(),
        dashed: arrow.includes('.'),
        thick: arrow.includes('='),
      });
    } else {
      parseNode(line);
    }
  }

  const nodeList = Array.from(nodes.values());
  if (nodeList.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><text x="50" y="50" fill="${dark ? '#94a3b8' : '#64748b'}">Empty Diagram</text></svg>`;
  }

  // Layout nodes
  const nodeW = 140;
  const nodeH = 50;
  const gapX = isLR ? 180 : 80;
  const gapY = isLR ? 70 : 100;

  // Assign levels using topological or simple rank
  const levels = new Map<string, number>();
  nodeList.forEach((n, idx) => levels.set(n.id, idx));

  const totalWidth = isLR ? nodeList.length * gapX + 80 : 400;
  const totalHeight = isLR ? 280 : nodeList.length * gapY + 80;

  nodeList.forEach((n, idx) => {
    if (isLR) {
      n.x = 40 + idx * gapX;
      n.y = 80 + (idx % 2 === 0 ? 0 : 60);
    } else {
      n.x = totalWidth / 2 - nodeW / 2;
      n.y = 40 + idx * gapY;
    }
  });

  const bg = dark ? '#0f172a' : '#ffffff';
  const nodeBg = dark ? '#1e293b' : '#f8fafc';
  const nodeBorder = dark ? '#38bdf8' : '#0284c7';
  const textCol = dark ? '#f1f5f9' : '#0f172a';
  const edgeCol = dark ? '#94a3b8' : '#64748b';

  let svgElements = '';

  // Draw Edges
  edges.forEach(e => {
    const fromNode = nodes.get(e.from);
    const toNode = nodes.get(e.to);
    if (!fromNode || !toNode || fromNode.x === undefined || toNode.x === undefined) return;

    const x1 = fromNode.x + nodeW / 2;
    const y1 = fromNode.y! + nodeH;
    const x2 = toNode.x + nodeW / 2;
    const y2 = toNode.y!;

    const strokeDash = e.dashed ? 'stroke-dasharray="4,4"' : '';
    const strokeWidth = e.thick ? 3 : 1.75;

    svgElements += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${edgeCol}" stroke-width="${strokeWidth}" ${strokeDash} marker-end="url(#arrow)" />`;

    if (e.label) {
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      svgElements += `<rect x="${midX - 30}" y="${midY - 10}" width="60" height="20" rx="4" fill="${bg}" opacity="0.9"/>`;
      svgElements += `<text x="${midX}" y="${midY + 4}" fill="${edgeCol}" font-size="11" font-family="sans-serif" text-anchor="middle">${escapeXml(e.label)}</text>`;
    }
  });

  // Draw Nodes
  nodeList.forEach(n => {
    const rx = n.shape === 'round' ? 12 : n.shape === 'stadium' ? 24 : n.shape === 'circle' ? 25 : 6;
    svgElements += `
      <rect x="${n.x}" y="${n.y}" width="${nodeW}" height="${nodeH}" rx="${rx}" fill="${nodeBg}" stroke="${nodeBorder}" stroke-width="2"/>
      <text x="${n.x! + nodeW / 2}" y="${n.y! + nodeH / 2 + 5}" fill="${textCol}" font-size="13" font-weight="600" font-family="sans-serif" text-anchor="middle">${escapeXml(n.label)}</text>
    `;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}">
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="${edgeCol}" />
      </marker>
    </defs>
    <rect width="100%" height="100%" fill="${bg}" />
    ${svgElements}
  </svg>`;
}

// 2. Sequence Diagram Renderer
function renderSequenceDiagram(lines: string[], dark: boolean): string {
  const participants: { id: string; name: string }[] = [];
  const messages: { from: string; to: string; text: string; dashed: boolean; isAsync: boolean }[] = [];

  const addParticipant = (id: string, name?: string) => {
    if (!participants.some(p => p.id === id)) {
      participants.push({ id, name: name || id });
    }
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('participant') || line.startsWith('actor')) {
      const match = line.match(/(?:participant|actor)\s+([a-zA-Z0-9_-]+)(?:\s+as\s+(.*))?/);
      if (match) addParticipant(match[1], match[2]);
      continue;
    }

    const msgMatch = line.match(/([a-zA-Z0-9_-]+)\s*(->>|-->>|->|-->)\s*([a-zA-Z0-9_-]+)\s*:\s*(.*)/);
    if (msgMatch) {
      const [, from, arrow, to, text] = msgMatch;
      addParticipant(from);
      addParticipant(to);
      messages.push({
        from,
        to,
        text,
        dashed: arrow.includes('--'),
        isAsync: arrow.includes('>>'),
      });
    }
  }

  const partW = 120;
  const partH = 40;
  const gapX = 170;
  const msgH = 45;
  const totalW = Math.max(500, participants.length * gapX + 60);
  const totalH = 100 + messages.length * msgH + 60;

  const bg = dark ? '#0f172a' : '#ffffff';
  const boxBg = dark ? '#1e293b' : '#f0fdf4';
  const boxBorder = dark ? '#10b981' : '#059669';
  const textCol = dark ? '#f1f5f9' : '#0f172a';
  const lineCol = dark ? '#475569' : '#cbd5e1';
  const arrowCol = dark ? '#38bdf8' : '#0284c7';

  let svgElements = '';

  // Participant positions
  const xCoords = new Map<string, number>();
  participants.forEach((p, idx) => {
    const x = 50 + idx * gapX;
    xCoords.set(p.id, x + partW / 2);

    // Lifeline
    svgElements += `<line x1="${x + partW / 2}" y1="50" x2="${x + partW / 2}" y2="${totalH - 40}" stroke="${lineCol}" stroke-width="1.5" stroke-dasharray="4,4"/>`;

    // Top box
    svgElements += `
      <rect x="${x}" y="20" width="${partW}" height="${partH}" rx="6" fill="${boxBg}" stroke="${boxBorder}" stroke-width="2"/>
      <text x="${x + partW / 2}" y="45" fill="${textCol}" font-size="12" font-weight="600" font-family="sans-serif" text-anchor="middle">${escapeXml(p.name)}</text>
    `;

    // Bottom box
    svgElements += `
      <rect x="${x}" y="${totalH - 40}" width="${partW}" height="${partH}" rx="6" fill="${boxBg}" stroke="${boxBorder}" stroke-width="2"/>
      <text x="${x + partW / 2}" y="${totalH - 15}" fill="${textCol}" font-size="12" font-weight="600" font-family="sans-serif" text-anchor="middle">${escapeXml(p.name)}</text>
    `;
  });

  // Messages
  messages.forEach((m, idx) => {
    const x1 = xCoords.get(m.from) || 100;
    const x2 = xCoords.get(m.to) || 250;
    const y = 90 + idx * msgH;

    const dash = m.dashed ? 'stroke-dasharray="4,4"' : '';
    svgElements += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${arrowCol}" stroke-width="2" ${dash} marker-end="url(#seq-arrow)"/>`;
    svgElements += `<text x="${(x1 + x2) / 2}" y="${y - 8}" fill="${textCol}" font-size="11" font-family="sans-serif" text-anchor="middle">${escapeXml(m.text)}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">
    <defs>
      <marker id="seq-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="${arrowCol}" />
      </marker>
    </defs>
    <rect width="100%" height="100%" fill="${bg}" />
    ${svgElements}
  </svg>`;
}

// 3. State Diagram
function renderStateDiagram(lines: string[], dark: boolean): string {
  return renderFlowchart(lines.map(l => l.replace(/stateDiagram(?:-v2)?/i, 'flowchart TD')), dark);
}

// 4. Pie Chart
function renderPieChart(lines: string[], dark: boolean): string {
  let title = 'Pie Chart';
  const slices: { label: string; value: number }[] = [];

  for (const line of lines) {
    if (line.toLowerCase().startsWith('pie')) {
      const titleMatch = line.match(/title\s+(.*)/i);
      if (titleMatch) title = titleMatch[1].trim();
      continue;
    }
    const sliceMatch = line.match(/"(.*?)"\s*:\s*(\d+(?:\.\d+)?)/);
    if (sliceMatch) {
      slices.push({ label: sliceMatch[1], value: parseFloat(sliceMatch[2]) });
    }
  }

  const total = slices.reduce((acc, s) => acc + s.value, 0) || 1;
  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#64748b'];

  const cx = 200;
  const cy = 200;
  const r = 130;
  let startAngle = 0;

  let paths = '';
  let legend = '';

  slices.forEach((s, idx) => {
    const angle = (s.value / total) * 360;
    const endAngle = startAngle + angle;
    const color = colors[idx % colors.length];

    const x1 = cx + r * Math.cos((Math.PI * startAngle) / 180);
    const y1 = cy + r * Math.sin((Math.PI * startAngle) / 180);
    const x2 = cx + r * Math.cos((Math.PI * endAngle) / 180);
    const y2 = cy + r * Math.sin((Math.PI * endAngle) / 180);
    const largeArc = angle > 180 ? 1 : 0;

    paths += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${color}" stroke="${dark ? '#0f172a' : '#ffffff'}" stroke-width="2"/>`;

    const pct = Math.round((s.value / total) * 100);
    legend += `
      <rect x="360" y="${60 + idx * 28}" width="14" height="14" rx="3" fill="${color}"/>
      <text x="382" y="${72 + idx * 28}" fill="${dark ? '#f1f5f9' : '#0f172a'}" font-size="12" font-family="sans-serif">${escapeXml(s.label)} (${pct}%)</text>
    `;

    startAngle = endAngle;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 380" width="540" height="380">
    <rect width="100%" height="100%" fill="${dark ? '#0f172a' : '#ffffff'}"/>
    <text x="270" y="30" fill="${dark ? '#f1f5f9' : '#0f172a'}" font-size="16" font-weight="bold" font-family="sans-serif" text-anchor="middle">${escapeXml(title)}</text>
    ${paths}
    ${legend}
  </svg>`;
}

// 5. Class Diagram
function renderClassDiagram(lines: string[], dark: boolean): string {
  return renderFlowchart(lines.map(l => l.replace(/classDiagram/i, 'flowchart TD')), dark);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
