import { NODE_TYPES } from '../engine/nodeTypes.js';

export const NODE_W = 236;
export const GRID = 10;

export function nodeHeight(node) {
  return node.type === 'conditional' ? 92 : 68;
}

export const snap = (v) => Math.round(v / GRID) * GRID;

// Output ports are spread evenly down the right edge; the input sits mid-left.
export function outputPort(node, portName = 'out') {
  const outs = NODE_TYPES[node.type]?.outputs || ['out'];
  const i = Math.max(0, outs.indexOf(portName));
  const h = nodeHeight(node);
  return { x: node.x + NODE_W, y: node.y + (h * (i + 1)) / (outs.length + 1) };
}

export function inputPort(node) {
  return { x: node.x, y: node.y + nodeHeight(node) / 2 };
}

export function bezier(a, b) {
  const dx = Math.max(60, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

export function screenToWorld(clientX, clientY, rect, viewport) {
  return {
    x: (clientX - rect.left - viewport.x) / viewport.k,
    y: (clientY - rect.top - viewport.y) / viewport.k,
  };
}

// fitAll=true shows the whole graph (the Fit button). Otherwise the zoom never drops
// below a readable level; a wide graph is anchored to the left so the Trigger is in view.
const READABLE_MIN = 0.6;

export function fitViewport(nodes, size, { padding = 60, fitAll = false } = {}) {
  if (!nodes.length || !size.w || !size.h) return { x: 40, y: 20, k: 1 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + NODE_W);
    maxY = Math.max(maxY, n.y + nodeHeight(n));
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const natural = Math.min((size.w - padding * 2) / w, (size.h - padding * 2) / h);
  const floor = fitAll ? 0.2 : READABLE_MIN;
  const k = Math.min(1.1, Math.max(floor, natural));
  const x = w * k + padding * 2 > size.w ? padding - minX * k : (size.w - w * k) / 2 - minX * k;
  const y = (size.h - h * k) / 2 - minY * k;
  return { k, x, y };
}

export function nodeAt(nodes, p, excludeId) {
  // Topmost (last drawn) node containing the point, with a little slop.
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.id === excludeId) continue;
    if (p.x >= n.x - 14 && p.x <= n.x + NODE_W + 14 && p.y >= n.y - 8 && p.y <= n.y + nodeHeight(n) + 8) return n;
  }
  return null;
}

export function truncate(s, max) {
  s = String(s ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function nodeTitle(node) {
  return node.label || (node.type === 'action' && node.config?.name) || NODE_TYPES[node.type]?.label || node.id;
}

export function nodeSubtitle(node) {
  const c = node.config || {};
  switch (node.type) {
    case 'trigger': return 'Manual trigger';
    case 'action': return c.url ? c.url.replace(/^https?:\/\//, '') : 'HTTP request';
    case 'notification': return `${c.channel || 'email'} → ${c.to || 'recipient'}`;
    case 'conditional': return c.expression || 'Set a condition';
    case 'delay': return `Wait ${c.ms ?? 0} ms`;
    case 'logic': return c.expression || 'Set an expression';
    case 'merge': return 'Combine branches';
    default: return '';
  }
}
