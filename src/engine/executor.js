// Workflow executor: a small state machine over the DAG.
//
// Run states:   running -> succeeded | failed | cancelled   (or "rejected" if validation fails)
// Node states:  pending -> running -> succeeded | failed | skipped | cancelled
//                              \-> retrying -> running ... (until retries are exhausted)
// Edge states:  pending -> active | inactive
//
// Scheduling is dependency-ordered: a node becomes eligible only once every
// incoming edge has been resolved (active or inactive). It runs if at least one
// incoming edge is active, otherwise it is skipped and its outgoing edges are
// marked inactive, which propagates "dead" branches downstream. Conditional
// nodes activate exactly one of their "true"/"false" ports.

import { buildGraph, topologicalSort, validateWorkflow, labelOf } from './graph.js';

export const NODE_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  RETRYING: 'retrying',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
});

export const RUN_STATUS = Object.freeze({
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
});

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function clone(v) {
  if (v === undefined) return undefined;
  return JSON.parse(JSON.stringify(v));
}

function serializeError(e) {
  return { name: e?.name || 'Error', message: e?.message || String(e) };
}

// Expressions are evaluated inside the Web Worker, which has no DOM access.
export function evaluateExpression(expression, input) {
  // eslint-disable-next-line no-new-func
  const fn = new Function('input', `"use strict"; return (${expression});`);
  return fn(clone(input));
}

// Default simulated handlers. Swap any of them via options.handlers.
export const defaultHandlers = {
  async trigger(node, _input, ctx) {
    return { ...(node.config?.payload || {}), ...(ctx.triggerPayload || {}) };
  },

  async action(node, input, ctx) {
    const c = node.config || {};
    await ctx.sleep(Number(c.latencyMs || 0));
    if (ctx.attempt <= Number(c.failFirstN || 0)) {
      throw new Error(`HTTP 503 from ${c.url || 'endpoint'} (simulated, attempt ${ctx.attempt})`);
    }
    return { ...input, response: { status: 200, url: c.url, attempt: ctx.attempt } };
  },

  async notification(node, input, ctx) {
    const c = node.config || {};
    await ctx.sleep(10);
    return { ...input, notified: { channel: c.channel, to: c.to, message: c.message } };
  },

  async conditional(node, input) {
    const result = evaluateExpression(node.config.expression, input);
    return { output: input, port: result ? 'true' : 'false' };
  },

  async delay(node, input, ctx) {
    await ctx.sleep(Number(node.config?.ms || 0));
    return input;
  },

  async logic(node, input) {
    const result = evaluateExpression(node.config.expression, input);
    if (result && typeof result === 'object' && !Array.isArray(result)) return { ...input, ...result };
    return { ...input, result };
  },

  async merge(_node, input) {
    return input;
  },
};

/**
 * @param {object} workflow
 * @param {object} [options]
 * @param {(event:object)=>void} [options.onEvent]       Receives every event as it happens.
 * @param {(info:object)=>Promise<'run'|'skip'|'abort'>} [options.beforeNode]
 *        Step-debugger hook. When provided, nodes run one at a time and each
 *        pauses here first, with its resolved input.
 * @param {number} [options.timeScale=1]  Multiplies every sleep (0 = instant, used by tests).
 * @param {{aborted:boolean}} [options.signal]
 * @param {object} [options.triggerPayload]
 * @param {object} [options.handlers]
 * @returns {Promise<object>} the run record
 */
export async function executeWorkflow(workflow, options = {}) {
  const {
    onEvent = () => {},
    beforeNode,
    timeScale = 1,
    signal = { aborted: false },
    triggerPayload,
    handlers = {},
    now = Date.now,
    sleep: rawSleep = defaultSleep,
    runId = `run_${now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  } = options;

  const H = { ...defaultHandlers, ...handlers };
  const sleep = (ms) => (ms * timeScale > 0 ? rawSleep(ms * timeScale) : Promise.resolve());

  let seq = 0;
  const events = [];
  const emit = (type, data = {}) => {
    const ev = { seq: ++seq, t: now(), runId, type, ...data };
    events.push(ev);
    onEvent(ev);
    return ev;
  };

  const run = {
    id: runId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: RUN_STATUS.RUNNING,
    startedAt: now(),
    endedAt: null,
    order: [],
    nodes: {},
    edges: {},
    events,
    errors: [],
  };

  const validation = validateWorkflow(workflow);
  if (!validation.valid) {
    run.status = RUN_STATUS.REJECTED;
    run.endedAt = now();
    run.errors = validation.errors;
    emit('run:rejected', { errors: validation.errors });
    return run;
  }

  const g = buildGraph(workflow);
  const topo = topologicalSort(g);
  run.order = topo.order;

  for (const n of g.nodes) {
    run.nodes[n.id] = {
      nodeId: n.id,
      type: n.type,
      label: labelOf(n),
      status: NODE_STATUS.PENDING,
      input: undefined,
      output: undefined,
      port: undefined,
      error: undefined,
      attempts: [],
      startedAt: null,
      endedAt: null,
      note: undefined,
    };
  }
  for (const e of g.edges) run.edges[e.id] = 'pending';

  const outputs = new Map(); // nodeId -> output data
  emit('run:start', { order: topo.order, workflowName: workflow.name });

  const rec = (id) => run.nodes[id];

  function resolveOutgoing(node, activePorts /* Set | null = all */) {
    for (const e of g.out.get(node.id)) {
      const active = activePorts === null || activePorts.has(e.sourcePort || 'out');
      run.edges[e.id] = active ? 'active' : 'inactive';
    }
  }

  function skipNode(node, reason) {
    const r = rec(node.id);
    r.status = NODE_STATUS.SKIPPED;
    r.note = reason;
    r.startedAt = r.endedAt = now();
    resolveOutgoing(node, new Set());
    emit('node:skipped', { nodeId: node.id, reason });
  }

  function gatherInput(node) {
    const merged = {};
    const sources = [];
    for (const e of g.inn.get(node.id)) {
      if (run.edges[e.id] === 'active') {
        Object.assign(merged, clone(outputs.get(e.source)) || {});
        sources.push(e.source);
      }
    }
    return { merged, sources };
  }

  async function runNode(node) {
    const r = rec(node.id);
    const { merged: input, sources } = gatherInput(node);
    r.input = clone(input);
    r.sources = sources;

    if (beforeNode) {
      emit('node:paused', { nodeId: node.id, input: clone(input) });
      const decision = await beforeNode({ nodeId: node.id, node, input: clone(input), run });
      if (decision === 'abort') {
        signal.aborted = true;
      }
      if (decision === 'skip') {
        skipNode(node, 'Skipped in step debugger');
        return;
      }
    }
    if (signal.aborted) return; // left pending; marked cancelled below

    const maxAttempts = 1 + Math.max(0, Number(node.config?.retries || 0));
    r.startedAt = now();
    r.status = NODE_STATUS.RUNNING;
    emit('node:start', { nodeId: node.id, input: clone(input) });

    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (signal.aborted) break;
      const at = { n: attempt, startedAt: now(), endedAt: null, status: 'running', error: null };
      r.attempts.push(at);
      r.status = NODE_STATUS.RUNNING;
      if (attempt > 1) emit('node:attempt', { nodeId: node.id, attempt });
      try {
        const result = await H[node.type](node, clone(input), {
          attempt,
          sleep,
          triggerPayload,
          runId,
        });
        at.endedAt = now();
        at.status = 'succeeded';
        let output = result;
        let port = null;
        if (node.type === 'conditional') {
          output = result.output;
          port = result.port;
        }
        r.output = clone(output);
        r.port = port || undefined;
        r.status = NODE_STATUS.SUCCEEDED;
        r.endedAt = now();
        outputs.set(node.id, r.output);
        resolveOutgoing(node, port ? new Set([port]) : null);
        emit('node:success', { nodeId: node.id, output: clone(output), port, attempt });
        return;
      } catch (err) {
        lastErr = serializeError(err);
        at.endedAt = now();
        at.status = 'failed';
        at.error = lastErr;
        if (attempt < maxAttempts && !signal.aborted) {
          const base = Number(node.config?.retryDelayMs || 0);
          const delay = node.config?.backoff === 'exponential' ? base * 2 ** (attempt - 1) : base;
          r.status = NODE_STATUS.RETRYING;
          emit('node:retry', { nodeId: node.id, attempt, nextAttempt: attempt + 1, delayMs: delay, error: lastErr });
          await sleep(delay);
        }
      }
    }

    if (signal.aborted && !lastErr) return;

    r.error = lastErr;
    r.endedAt = now();
    if (node.config?.continueOnError) {
      r.status = NODE_STATUS.FAILED;
      r.note = 'Failed, but "continue on error" is on';
      const passthrough = { ...input, _error: lastErr?.message };
      r.output = clone(passthrough);
      outputs.set(node.id, r.output);
      resolveOutgoing(node, null);
      emit('node:failed', { nodeId: node.id, error: lastErr, continued: true });
    } else {
      r.status = NODE_STATUS.FAILED;
      resolveOutgoing(node, new Set());
      run.errors.push({ nodeId: node.id, ...lastErr });
      emit('node:failed', { nodeId: node.id, error: lastErr, continued: false });
    }
  }

  // Main scheduling loop.
  const pending = new Set(topo.order);
  while (pending.size > 0 && !signal.aborted) {
    const eligible = topo.order.filter(
      (id) => pending.has(id) && g.inn.get(id).every((e) => run.edges[e.id] !== 'pending'),
    );
    if (eligible.length === 0) break; // cannot happen on a DAG; guard against infinite loops

    const ready = [];
    for (const id of eligible) {
      pending.delete(id);
      const node = g.nodeById.get(id);
      const hasActiveIn = g.inn.get(id).some((e) => run.edges[e.id] === 'active');
      if (node.type !== 'trigger' && !hasActiveIn) {
        skipNode(node, 'No active incoming branch');
      } else {
        ready.push(node);
      }
    }

    if (beforeNode) {
      for (const node of ready) {
        if (signal.aborted) break;
        await runNode(node);
      }
    } else {
      await Promise.all(ready.map(runNode));
    }
  }

  if (signal.aborted) {
    for (const n of g.nodes) {
      const r = rec(n.id);
      if (r.status === NODE_STATUS.PENDING || r.status === NODE_STATUS.RETRYING || r.status === NODE_STATUS.RUNNING) {
        r.status = NODE_STATUS.CANCELLED;
        r.endedAt = now();
      }
    }
    run.status = RUN_STATUS.CANCELLED;
  } else {
    // Anything still pending is unreachable work; mark it skipped for a complete record.
    for (const id of pending) skipNode(g.nodeById.get(id), 'Not reached');
    const anyFailed = g.nodes.some((n) => rec(n.id).status === NODE_STATUS.FAILED && !n.config?.continueOnError);
    run.status = anyFailed ? RUN_STATUS.FAILED : RUN_STATUS.SUCCEEDED;
  }

  run.endedAt = now();
  emit('run:end', { status: run.status });
  return run;
}

// A compact, serializable summary for the history list (drops big event logs).
export function summarizeRun(run) {
  const counts = {};
  for (const r of Object.values(run.nodes)) counts[r.status] = (counts[r.status] || 0) + 1;
  return {
    id: run.id,
    workflowId: run.workflowId,
    workflowName: run.workflowName,
    status: run.status,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    durationMs: run.endedAt && run.startedAt ? run.endedAt - run.startedAt : null,
    counts,
  };
}
