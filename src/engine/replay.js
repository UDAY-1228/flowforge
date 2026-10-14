// Folds the executor's event stream into a view of node/edge state at any
// point in time. The UI uses this for both the live run overlay and the step
// debugger's replay scrubber, so there is a single source of truth: events.

export function foldEvents(events = [], upto = events.length) {
  const nodes = {};
  let status = 'idle';
  let paused = null;
  let order = [];
  let startedAt = null;
  let endedAt = null;
  let errors = [];
  const end = Math.min(upto, events.length);
  const get = (id) => (nodes[id] ||= { status: 'pending', attempts: [] });
  const lastAttempt = (n) => n.attempts[n.attempts.length - 1];

  for (let i = 0; i < end; i++) {
    const e = events[i];
    switch (e.type) {
      case 'run:start':
        status = 'running';
        order = e.order || [];
        startedAt = e.t;
        for (const id of order) get(id);
        break;
      case 'run:rejected':
        status = 'rejected';
        errors = e.errors || [];
        endedAt = e.t;
        break;
      case 'node:paused': {
        const n = get(e.nodeId);
        n.status = 'paused';
        n.input = e.input;
        paused = { nodeId: e.nodeId, input: e.input };
        break;
      }
      case 'node:start': {
        const n = get(e.nodeId);
        if (paused && paused.nodeId === e.nodeId) paused = null;
        n.status = 'running';
        n.input = e.input;
        n.startedAt = e.t;
        n.attempts = [{ n: 1, status: 'running', startedAt: e.t }];
        break;
      }
      case 'node:attempt': {
        const n = get(e.nodeId);
        n.status = 'running';
        n.attempts.push({ n: e.attempt, status: 'running', startedAt: e.t });
        break;
      }
      case 'node:retry': {
        const n = get(e.nodeId);
        n.status = 'retrying';
        n.nextRetryDelay = e.delayMs;
        const a = lastAttempt(n);
        if (a) Object.assign(a, { status: 'failed', error: e.error, endedAt: e.t });
        break;
      }
      case 'node:success': {
        const n = get(e.nodeId);
        n.status = 'succeeded';
        n.output = e.output;
        n.port = e.port || undefined;
        n.endedAt = e.t;
        const a = lastAttempt(n);
        if (a) Object.assign(a, { status: 'succeeded', endedAt: e.t });
        break;
      }
      case 'node:failed': {
        const n = get(e.nodeId);
        n.status = 'failed';
        n.error = e.error;
        n.continued = !!e.continued;
        n.endedAt = e.t;
        const a = lastAttempt(n);
        if (a) Object.assign(a, { status: 'failed', error: e.error, endedAt: e.t });
        break;
      }
      case 'node:skipped': {
        const n = get(e.nodeId);
        if (paused && paused.nodeId === e.nodeId) paused = null;
        n.status = 'skipped';
        n.note = e.reason;
        break;
      }
      case 'run:end':
        status = e.status;
        endedAt = e.t;
        paused = null;
        if (e.status === 'cancelled') {
          for (const n of Object.values(nodes)) {
            if (['pending', 'running', 'retrying', 'paused'].includes(n.status)) n.status = 'cancelled';
          }
        }
        break;
      default:
        break;
    }
  }
  return { status, paused, order, nodes, startedAt, endedAt, errors, position: end, total: events.length };
}

// Edge state for drawing: 'active' | 'inactive' | 'idle'
export function edgeStates(workflow, nodes) {
  const out = {};
  const byId = new Map(workflow.nodes.map((n) => [n.id, n]));
  for (const e of workflow.edges) {
    const s = nodes[e.source];
    const src = byId.get(e.source);
    if (!s) { out[e.id] = 'idle'; continue; }
    if (s.status === 'succeeded') {
      out[e.id] = src?.type === 'conditional' ? (s.port === (e.sourcePort || 'out') ? 'active' : 'inactive') : 'active';
    } else if (s.status === 'failed') {
      out[e.id] = s.continued ? 'active' : 'inactive';
    } else if (s.status === 'skipped' || s.status === 'cancelled') {
      out[e.id] = 'inactive';
    } else {
      out[e.id] = 'idle';
    }
  }
  return out;
}
