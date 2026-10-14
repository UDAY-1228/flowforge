// Graph algorithms: adjacency, cycle detection (Tarjan SCC + concrete cycle
// path), deterministic topological sort (Kahn), levels, reachability, and
// workflow validation. Pure functions over a plain workflow object:
//   { id, name, nodes: [{id, type, label?, config, x, y}], edges: [{id, source, sourcePort, target, targetPort?}] }

import { getType } from './nodeTypes.js';

export function buildGraph(workflow) {
  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const out = new Map(nodes.map((n) => [n.id, []]));
  const inn = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (out.has(e.source) && inn.has(e.target)) {
      out.get(e.source).push(e);
      inn.get(e.target).push(e);
    }
  }
  return { nodes, edges, index, out, inn, nodeById: new Map(nodes.map((n) => [n.id, n])) };
}

// Tarjan strongly connected components. Any SCC with >1 node, or a node with
// a self-loop, contains a cycle.
export function stronglyConnectedComponents(g) {
  let counter = 0;
  const idx = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const sccs = [];

  function visit(v) {
    idx.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const e of g.out.get(v)) {
      const w = e.target;
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), idx.get(w)));
      }
    }
    if (low.get(v) === idx.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      sccs.push(comp);
    }
  }

  for (const n of g.nodes) if (!idx.has(n.id)) visit(n.id);
  return sccs;
}

// Returns one concrete cycle path per cyclic SCC, e.g. ['a','b','c','a'].
export function findCycles(g) {
  const cycles = [];
  for (const comp of stronglyConnectedComponents(g)) {
    const members = new Set(comp);
    const selfLoop = comp.length === 1 && g.out.get(comp[0]).some((e) => e.target === comp[0]);
    if (comp.length === 1 && !selfLoop) continue;
    // DFS inside the component from its first node (by insertion order) to
    // recover an actual path that returns to the start.
    const start = [...comp].sort((a, b) => g.index.get(a) - g.index.get(b))[0];
    const path = [start];
    const seen = new Set([start]);
    const dfs = (v) => {
      for (const e of g.out.get(v)) {
        if (!members.has(e.target)) continue;
        if (e.target === start) {
          path.push(start);
          return true;
        }
        if (seen.has(e.target)) continue;
        seen.add(e.target);
        path.push(e.target);
        if (dfs(e.target)) return true;
        path.pop();
      }
      return false;
    };
    dfs(start);
    cycles.push(path);
  }
  return cycles;
}

// Kahn's algorithm. Ties are broken by node insertion order so the same graph
// always yields the same order. If a cycle exists, `order` is partial and
// `blocked` lists the nodes that could never be scheduled.
export function topologicalSort(g) {
  const indeg = new Map(g.nodes.map((n) => [n.id, g.inn.get(n.id).length]));
  let ready = g.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const order = [];
  const levels = [];
  while (ready.length) {
    ready.sort((a, b) => g.index.get(a) - g.index.get(b));
    levels.push(ready);
    const next = [];
    for (const v of ready) {
      order.push(v);
      for (const e of g.out.get(v)) {
        const d = indeg.get(e.target) - 1;
        indeg.set(e.target, d);
        if (d === 0) next.push(e.target);
      }
    }
    ready = next;
  }
  const done = new Set(order);
  const blocked = g.nodes.map((n) => n.id).filter((id) => !done.has(id));
  return { order, levels, blocked, acyclic: blocked.length === 0 };
}

export function reachableFrom(g, startIds) {
  const seen = new Set(startIds);
  const queue = [...startIds];
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head];
    for (const e of g.out.get(v) || []) {
      if (!seen.has(e.target)) {
        seen.add(e.target);
        queue.push(e.target);
      }
    }
  }
  return seen;
}

// Would adding source->target create a cycle? (target can already reach source)
export function wouldCreateCycle(workflow, source, target) {
  if (source === target) return true;
  const g = buildGraph(workflow);
  return reachableFrom(g, [target]).has(source);
}

export function validateWorkflow(workflow) {
  const errors = [];
  const warnings = [];
  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];
  const err = (code, message, extra = {}) => errors.push({ code, message, ...extra });
  const warn = (code, message, extra = {}) => warnings.push({ code, message, ...extra });

  if (nodes.length === 0) {
    err('EMPTY', 'The workflow has no nodes.');
    return { valid: false, errors, warnings };
  }

  const ids = new Set();
  for (const n of nodes) {
    if (ids.has(n.id)) err('DUPLICATE_NODE', `Duplicate node id "${n.id}".`, { nodeId: n.id });
    ids.add(n.id);
    if (!getType(n.type)) err('UNKNOWN_TYPE', `Node "${n.id}" has unknown type "${n.type}".`, { nodeId: n.id });
  }

  const edgeIds = new Set();
  const seenPairs = new Set();
  for (const e of edges) {
    if (edgeIds.has(e.id)) err('DUPLICATE_EDGE', `Duplicate edge id "${e.id}".`, { edgeId: e.id });
    edgeIds.add(e.id);
    const s = nodes.find((n) => n.id === e.source);
    const t = nodes.find((n) => n.id === e.target);
    if (!s || !t) {
      err('DANGLING_EDGE', `Edge "${e.id}" points to a missing node.`, { edgeId: e.id });
      continue;
    }
    if (e.source === e.target) err('SELF_LOOP', `Node "${labelOf(s)}" is connected to itself.`, { nodeId: s.id, edgeId: e.id });
    const st = getType(s.type);
    const tt = getType(t.type);
    if (st && !st.outputs.includes(e.sourcePort || 'out')) {
      err('BAD_PORT', `"${labelOf(s)}" has no output port "${e.sourcePort}".`, { edgeId: e.id, nodeId: s.id });
    }
    if (tt && tt.inputs.length === 0) {
      err('TRIGGER_INPUT', `"${labelOf(t)}" cannot receive connections.`, { edgeId: e.id, nodeId: t.id });
    }
    const key = `${e.source}:${e.sourcePort || 'out'}->${e.target}`;
    if (seenPairs.has(key)) warn('DUPLICATE_CONNECTION', `Duplicate connection ${labelOf(s)} → ${labelOf(t)}.`, { edgeId: e.id });
    seenPairs.add(key);
  }

  const triggers = nodes.filter((n) => n.type === 'trigger');
  if (triggers.length === 0) err('NO_TRIGGER', 'Add a Trigger node to start the workflow.');
  if (triggers.length > 1) warn('MULTI_TRIGGER', 'More than one Trigger: all of them start together.');

  const g = buildGraph(workflow);

  for (const cycle of findCycles(g)) {
    const names = cycle.map((id) => labelOf(g.nodeById.get(id)));
    err('CYCLE', `Cycle detected: ${names.join(' → ')}.`, { path: cycle, nodeId: cycle[0] });
  }

  const reach = reachableFrom(g, triggers.map((t) => t.id));
  for (const n of nodes) {
    const t = getType(n.type);
    if (!t) continue;
    if (n.type !== 'trigger' && !reach.has(n.id)) {
      warn('UNREACHABLE', `"${labelOf(n)}" is not reachable from any Trigger and will not run.`, { nodeId: n.id });
    }
    if (n.type !== 'trigger' && g.inn.get(n.id).length === 0) {
      warn('NO_INPUT', `"${labelOf(n)}" has no incoming connection.`, { nodeId: n.id });
    }
    if (n.type === 'conditional') {
      const ports = new Set(g.out.get(n.id).map((e) => e.sourcePort));
      for (const p of ['true', 'false']) {
        if (!ports.has(p)) warn('OPEN_BRANCH', `"${labelOf(n)}" has nothing connected to its "${p}" branch.`, { nodeId: n.id });
      }
      if (!n.config?.expression?.trim()) err('NO_CONDITION', `"${labelOf(n)}" needs a condition expression.`, { nodeId: n.id });
    }
    if (n.type === 'logic' && !n.config?.expression?.trim()) {
      err('NO_EXPRESSION', `"${labelOf(n)}" needs an expression.`, { nodeId: n.id });
    }
    if (n.type === 'delay' && !(Number(n.config?.ms) >= 0)) {
      err('BAD_DELAY', `"${labelOf(n)}" needs a non-negative delay.`, { nodeId: n.id });
    }
    const r = n.config?.retries;
    if (r !== undefined && !(Number.isInteger(Number(r)) && Number(r) >= 0 && Number(r) <= 10)) {
      err('BAD_RETRIES', `"${labelOf(n)}" retries must be a whole number from 0 to 10.`, { nodeId: n.id });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function labelOf(node) {
  if (!node) return '?';
  return node.label || node.config?.name || getType(node.type)?.label || node.id;
}
