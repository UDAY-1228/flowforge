import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGraph, topologicalSort, findCycles, validateWorkflow, wouldCreateCycle, reachableFrom,
} from '../src/engine/graph.js';
import { executeWorkflow, NODE_STATUS, RUN_STATUS } from '../src/engine/executor.js';
import { defaultConfig } from '../src/engine/nodeTypes.js';

// ---- helpers ---------------------------------------------------------------
let t = 0;
const clock = () => ++t;
const node = (id, type, config = {}) => ({ id, type, config: { ...defaultConfig(type), ...config }, x: 0, y: 0 });
const edge = (source, target, sourcePort = 'out') => ({ id: `${source}.${sourcePort}->${target}`, source, sourcePort, target });
const wf = (nodes, edges) => ({ id: 'wf', name: 'test', nodes, edges });
const exec = (w, opts = {}) => executeWorkflow(w, { timeScale: 0, now: clock, ...opts });
const names = (run, status) => Object.values(run.nodes).filter((n) => n.status === status).map((n) => n.nodeId).sort();

// ---- topological sort ------------------------------------------------------
test('topologicalSort orders a diamond and exposes levels', () => {
  const w = wf(
    [node('t', 'trigger'), node('a', 'logic'), node('b', 'logic'), node('m', 'merge')],
    [edge('t', 'a'), edge('t', 'b'), edge('a', 'm'), edge('b', 'm')],
  );
  const r = topologicalSort(buildGraph(w));
  assert.equal(r.acyclic, true);
  assert.deepEqual(r.order, ['t', 'a', 'b', 'm']);
  assert.deepEqual(r.levels, [['t'], ['a', 'b'], ['m']]);
});

test('topologicalSort is deterministic regardless of edge order', () => {
  const nodes = [node('t', 'trigger'), node('a', 'logic'), node('b', 'logic'), node('c', 'logic')];
  const e1 = [edge('t', 'c'), edge('t', 'b'), edge('t', 'a')];
  const e2 = [...e1].reverse();
  assert.deepEqual(topologicalSort(buildGraph(wf(nodes, e1))).order, topologicalSort(buildGraph(wf(nodes, e2))).order);
});

test('every edge goes forward in the computed order (property check on random DAGs)', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let trial = 0; trial < 50; trial++) {
    const n = 3 + Math.floor(rnd() * 12);
    const nodes = Array.from({ length: n }, (_, i) => node(`n${i}`, i === 0 ? 'trigger' : 'logic'));
    const edges = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rnd() < 0.3) edges.push(edge(`n${i}`, `n${j}`));
    // shuffle node order so insertion order is not already topological
    nodes.sort(() => rnd() - 0.5);
    const { order, acyclic } = topologicalSort(buildGraph(wf(nodes, edges)));
    assert.equal(acyclic, true);
    const pos = new Map(order.map((id, i) => [id, i]));
    for (const e of edges) assert.ok(pos.get(e.source) < pos.get(e.target), `${e.source} before ${e.target}`);
  }
});

// ---- cycles ----------------------------------------------------------------
test('findCycles returns a concrete path that closes on itself', () => {
  const w = wf(
    [node('t', 'trigger'), node('a', 'logic'), node('b', 'logic'), node('c', 'logic')],
    [edge('t', 'a'), edge('a', 'b'), edge('b', 'c'), edge('c', 'a')],
  );
  const cycles = findCycles(buildGraph(w));
  assert.equal(cycles.length, 1);
  const p = cycles[0];
  assert.equal(p[0], p[p.length - 1]);
  assert.deepEqual([...new Set(p)].sort(), ['a', 'b', 'c']);
});

test('self loops are cycles; acyclic graphs have none', () => {
  const self = wf([node('t', 'trigger'), node('a', 'logic')], [edge('t', 'a'), edge('a', 'a')]);
  assert.equal(findCycles(buildGraph(self)).length, 1);
  const ok = wf([node('t', 'trigger'), node('a', 'logic')], [edge('t', 'a')]);
  assert.equal(findCycles(buildGraph(ok)).length, 0);
});

test('two independent cycles are both reported', () => {
  const w = wf(
    [node('t', 'trigger'), node('a', 'logic'), node('b', 'logic'), node('c', 'logic'), node('d', 'logic')],
    [edge('t', 'a'), edge('a', 'b'), edge('b', 'a'), edge('t', 'c'), edge('c', 'd'), edge('d', 'c')],
  );
  assert.equal(findCycles(buildGraph(w)).length, 2);
});

test('wouldCreateCycle guards connection attempts', () => {
  const w = wf([node('t', 'trigger'), node('a', 'logic'), node('b', 'logic')], [edge('t', 'a'), edge('a', 'b')]);
  assert.equal(wouldCreateCycle(w, 'b', 'a'), true);
  assert.equal(wouldCreateCycle(w, 'a', 'a'), true);
  assert.equal(wouldCreateCycle(w, 't', 'b'), false);
});

// ---- validation ------------------------------------------------------------
test('validation: missing trigger, cycle, bad port, dangling edge', () => {
  const noTrigger = validateWorkflow(wf([node('a', 'logic')], []));
  assert.ok(noTrigger.errors.some((e) => e.code === 'NO_TRIGGER'));

  const cyc = validateWorkflow(wf(
    [node('t', 'trigger'), node('a', 'logic'), node('b', 'logic')],
    [edge('t', 'a'), edge('a', 'b'), edge('b', 'a')],
  ));
  const c = cyc.errors.find((e) => e.code === 'CYCLE');
  assert.ok(c && c.message.includes('→'));
  assert.equal(cyc.valid, false);

  const bad = validateWorkflow(wf([node('t', 'trigger'), node('a', 'logic')], [edge('t', 'a', 'nope'), edge('t', 'ghost')]));
  assert.ok(bad.errors.some((e) => e.code === 'BAD_PORT'));
  assert.ok(bad.errors.some((e) => e.code === 'DANGLING_EDGE'));
});

test('validation: warnings for unreachable nodes and open branches, but still valid', () => {
  const v = validateWorkflow(wf(
    [node('t', 'trigger'), node('c', 'conditional'), node('x', 'logic'), node('orphan', 'logic')],
    [edge('t', 'c'), edge('c', 'x', 'true')],
  ));
  assert.equal(v.valid, true);
  assert.ok(v.warnings.some((w) => w.code === 'OPEN_BRANCH' && w.message.includes('"false"')));
  assert.ok(v.warnings.some((w) => w.code === 'UNREACHABLE' && w.nodeId === 'orphan'));
});

test('validation: retries and delay bounds', () => {
  const v = validateWorkflow(wf(
    [node('t', 'trigger'), node('a', 'action', { retries: 99 }), node('d', 'delay', { ms: -5 })],
    [edge('t', 'a'), edge('a', 'd')],
  ));
  assert.ok(v.errors.some((e) => e.code === 'BAD_RETRIES'));
  assert.ok(v.errors.some((e) => e.code === 'BAD_DELAY'));
});

test('invalid workflows are rejected by the executor without running anything', async () => {
  const run = await exec(wf([node('a', 'logic')], []));
  assert.equal(run.status, RUN_STATUS.REJECTED);
  assert.ok(run.errors.length > 0);
});

// ---- execution -------------------------------------------------------------
test('executes in dependency order and flows data downstream', async () => {
  const w = wf(
    [node('t', 'trigger', { payload: { amount: 100 } }), node('a', 'logic', { expression: '({ x: input.amount + 1 })' }),
      node('b', 'logic', { expression: '({ y: input.x * 2 })' })],
    [edge('t', 'a'), edge('a', 'b')],
  );
  const run = await exec(w);
  assert.equal(run.status, RUN_STATUS.SUCCEEDED);
  assert.deepEqual(run.order, ['t', 'a', 'b']);
  assert.equal(run.nodes.b.output.y, 202);
  assert.equal(run.nodes.b.input.x, 101);
  const starts = run.events.filter((e) => e.type === 'node:start').map((e) => e.nodeId);
  assert.deepEqual(starts, ['t', 'a', 'b']);
});

test('conditional runs only the chosen branch and skips the other, including downstream', async () => {
  const w = wf(
    [node('t', 'trigger', { payload: { amount: 500 } }), node('c', 'conditional', { expression: 'input.amount > 100' }),
      node('hi', 'logic', { expression: '({ tier: "high" })' }), node('hi2', 'logic', { expression: '({ more: 1 })' }),
      node('lo', 'logic', { expression: '({ tier: "low" })' }), node('lo2', 'logic', { expression: '({ more: 2 })' })],
    [edge('t', 'c'), edge('c', 'hi', 'true'), edge('hi', 'hi2'), edge('c', 'lo', 'false'), edge('lo', 'lo2')],
  );
  const run = await exec(w);
  assert.equal(run.status, RUN_STATUS.SUCCEEDED);
  assert.equal(run.nodes.c.port, 'true');
  assert.deepEqual(names(run, NODE_STATUS.SUCCEEDED), ['c', 'hi', 'hi2', 't']);
  assert.deepEqual(names(run, NODE_STATUS.SKIPPED), ['lo', 'lo2']);

  const low = await exec({ ...w, nodes: w.nodes.map((n) => (n.id === 't' ? { ...n, config: { payload: { amount: 5 } } } : n)) });
  assert.equal(low.nodes.c.port, 'false');
  assert.deepEqual(names(low, NODE_STATUS.SKIPPED), ['hi', 'hi2']);
});

test('merge after a conditional still runs when only one branch was taken', async () => {
  const w = wf(
    [node('t', 'trigger', { payload: { amount: 1 } }), node('c', 'conditional', { expression: 'input.amount > 100' }),
      node('hi', 'logic', { expression: '({ tier: "high" })' }), node('lo', 'logic', { expression: '({ tier: "low" })' }),
      node('m', 'merge')],
    [edge('t', 'c'), edge('c', 'hi', 'true'), edge('c', 'lo', 'false'), edge('hi', 'm'), edge('lo', 'm')],
  );
  const run = await exec(w);
  assert.equal(run.nodes.m.status, NODE_STATUS.SUCCEEDED);
  assert.equal(run.nodes.m.output.tier, 'low');
  assert.deepEqual(run.nodes.m.sources, ['lo']);
});

test('merge combines data from parallel branches', async () => {
  const w = wf(
    [node('t', 'trigger', { payload: {} }), node('a', 'logic', { expression: '({ a: 1 })' }), node('b', 'logic', { expression: '({ b: 2 })' }), node('m', 'merge')],
    [edge('t', 'a'), edge('t', 'b'), edge('a', 'm'), edge('b', 'm')],
  );
  const run = await exec(w);
  assert.deepEqual(run.nodes.m.output, { a: 1, b: 2 });
});

test('a join node waits for all branches (never runs before its dependencies)', async () => {
  const order = [];
  const w = wf(
    [node('t', 'trigger'), node('slow', 'delay', { ms: 30 }), node('fast', 'logic', { expression: '({})' }), node('m', 'merge')],
    [edge('t', 'slow'), edge('t', 'fast'), edge('slow', 'm'), edge('fast', 'm')],
  );
  const run = await executeWorkflow(w, { timeScale: 1, now: clock, onEvent: (e) => e.type === 'node:success' && order.push(e.nodeId) });
  assert.ok(order.indexOf('m') > order.indexOf('slow') && order.indexOf('m') > order.indexOf('fast'));
  assert.equal(run.status, RUN_STATUS.SUCCEEDED);
});

test('retries: flaky action succeeds on a later attempt and records each attempt', async () => {
  const w = wf(
    [node('t', 'trigger'), node('a', 'action', { failFirstN: 2, retries: 3, retryDelayMs: 10, backoff: 'exponential' })],
    [edge('t', 'a')],
  );
  const run = await exec(w);
  assert.equal(run.status, RUN_STATUS.SUCCEEDED);
  const a = run.nodes.a;
  assert.equal(a.attempts.length, 3);
  assert.deepEqual(a.attempts.map((x) => x.status), ['failed', 'failed', 'succeeded']);
  const retries = run.events.filter((e) => e.type === 'node:retry');
  assert.deepEqual(retries.map((e) => e.delayMs), [10, 20]); // exponential backoff
});

test('retries exhausted: node fails, downstream skipped, independent branch still runs', async () => {
  const w = wf(
    [node('t', 'trigger'), node('bad', 'action', { failFirstN: 99, retries: 1, retryDelayMs: 0 }), node('after', 'logic', { expression: '({})' }),
      node('ok', 'logic', { expression: '({ fine: true })' })],
    [edge('t', 'bad'), edge('bad', 'after'), edge('t', 'ok')],
  );
  const run = await exec(w);
  assert.equal(run.status, RUN_STATUS.FAILED);
  assert.equal(run.nodes.bad.status, NODE_STATUS.FAILED);
  assert.equal(run.nodes.bad.attempts.length, 2);
  assert.match(run.nodes.bad.error.message, /503/);
  assert.equal(run.nodes.after.status, NODE_STATUS.SKIPPED);
  assert.equal(run.nodes.ok.status, NODE_STATUS.SUCCEEDED);
  assert.equal(run.errors[0].nodeId, 'bad');
});

test('continueOnError lets the workflow proceed with the error attached', async () => {
  const w = wf(
    [node('t', 'trigger'), node('bad', 'action', { failFirstN: 99, continueOnError: true }), node('after', 'logic', { expression: '({ saw: input._error })' })],
    [edge('t', 'bad'), edge('bad', 'after')],
  );
  const run = await exec(w);
  assert.equal(run.status, RUN_STATUS.SUCCEEDED);
  assert.equal(run.nodes.bad.status, NODE_STATUS.FAILED);
  assert.match(run.nodes.after.output.saw, /503/);
});

test('a throwing expression fails the node with a useful message', async () => {
  const w = wf([node('t', 'trigger'), node('a', 'logic', { expression: 'input.nope.deeper' })], [edge('t', 'a')]);
  const run = await exec(w);
  assert.equal(run.status, RUN_STATUS.FAILED);
  assert.match(run.nodes.a.error.message, /undefined|deeper/);
});

test('step debugger hook: pauses before every node with its input; skip and abort work', async () => {
  const w = wf(
    [node('t', 'trigger', { payload: { amount: 7 } }), node('a', 'logic', { expression: '({ x: 1 })' }), node('b', 'logic', { expression: '({ y: 2 })' })],
    [edge('t', 'a'), edge('a', 'b')],
  );
  const seen = [];
  const run = await exec(w, {
    beforeNode: async ({ nodeId, input }) => {
      seen.push({ nodeId, input });
      return nodeId === 'a' ? 'skip' : 'run';
    },
  });
  assert.deepEqual(seen.map((s) => s.nodeId), ['t', 'a']);
  assert.deepEqual(seen[1].input, { amount: 7 });
  assert.equal(run.nodes.a.status, NODE_STATUS.SKIPPED);
  assert.equal(run.nodes.b.status, NODE_STATUS.SKIPPED); // dead branch propagates

  const aborted = await exec(w, { beforeNode: async ({ nodeId }) => (nodeId === 'a' ? 'abort' : 'run') });
  assert.equal(aborted.status, RUN_STATUS.CANCELLED);
  assert.equal(aborted.nodes.t.status, NODE_STATUS.SUCCEEDED);
  assert.equal(aborted.nodes.a.status, NODE_STATUS.CANCELLED);
  assert.equal(aborted.nodes.b.status, NODE_STATUS.CANCELLED);
});

test('cancellation mid-run marks unfinished nodes cancelled', async () => {
  const signal = { aborted: false };
  const w = wf([node('t', 'trigger'), node('d', 'delay', { ms: 10 }), node('x', 'logic', { expression: '({})' })], [edge('t', 'd'), edge('d', 'x')]);
  const run = await executeWorkflow(w, {
    timeScale: 1, now: clock, signal,
    onEvent: (e) => { if (e.type === 'node:success' && e.nodeId === 't') signal.aborted = true; },
  });
  assert.equal(run.status, RUN_STATUS.CANCELLED);
  assert.equal(run.nodes.x.status, NODE_STATUS.CANCELLED);
});

test('run record is JSON-serializable (safe to postMessage / persist)', async () => {
  const w = wf([node('t', 'trigger'), node('a', 'action', { failFirstN: 1, retries: 1 })], [edge('t', 'a')]);
  const run = await exec(w);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(run)));
});

test('reachableFrom', () => {
  const w = wf([node('t', 'trigger'), node('a', 'logic'), node('z', 'logic')], [edge('t', 'a')]);
  assert.deepEqual([...reachableFrom(buildGraph(w), ['t'])].sort(), ['a', 't']);
});

// ---- replay / event folding -------------------------------------------------
import { foldEvents, edgeStates } from '../src/engine/replay.js';

test('foldEvents at the end of a run reproduces the executor run record', async () => {
  const scenarios = [
    wf(
      [node('t', 'trigger', { payload: { amount: 500 } }), node('c', 'conditional', { expression: 'input.amount > 100' }),
        node('hi', 'logic', { expression: '({ tier: "high" })' }), node('lo', 'logic', { expression: '({ tier: "low" })' }), node('m', 'merge')],
      [edge('t', 'c'), edge('c', 'hi', 'true'), edge('c', 'lo', 'false'), edge('hi', 'm'), edge('lo', 'm')],
    ),
    wf(
      [node('t', 'trigger'), node('a', 'action', { failFirstN: 2, retries: 3, retryDelayMs: 1 }), node('bad', 'action', { failFirstN: 9, retries: 1 }), node('after', 'merge')],
      [edge('t', 'a'), edge('t', 'bad'), edge('bad', 'after')],
    ),
  ];
  for (const w of scenarios) {
    const run = await exec(w);
    const view = foldEvents(run.events);
    assert.equal(view.status, run.status);
    for (const [id, rec] of Object.entries(run.nodes)) {
      assert.equal(view.nodes[id].status, rec.status, `${id} status`);
      assert.deepEqual(view.nodes[id].input, rec.input, `${id} input`);
      assert.deepEqual(view.nodes[id].output, rec.output, `${id} output`);
      assert.equal(view.nodes[id].port, rec.port, `${id} port`);
      assert.equal(view.nodes[id].attempts.length, rec.attempts.length, `${id} attempts`);
      assert.deepEqual(view.nodes[id].error, rec.error, `${id} error`);
    }
  }
});

test('foldEvents can scrub to any point; paused state tracks the step debugger', async () => {
  const w = wf([node('t', 'trigger'), node('a', 'logic', { expression: '({ x: 1 })' })], [edge('t', 'a')]);
  const run = await exec(w, { beforeNode: async () => 'run' });
  const evs = run.events;
  const pausedAt = evs.findIndex((e) => e.type === 'node:paused' && e.nodeId === 'a');
  const mid = foldEvents(evs, pausedAt + 1);
  assert.equal(mid.paused.nodeId, 'a');
  assert.equal(mid.nodes.a.status, 'paused');
  assert.equal(mid.nodes.t.status, 'succeeded');
  const start = foldEvents(evs, 0);
  assert.equal(start.status, 'idle');
  assert.equal(foldEvents(evs).paused, null);
});

test('edgeStates marks the untaken conditional branch inactive', async () => {
  const w = wf(
    [node('t', 'trigger', { payload: { amount: 1 } }), node('c', 'conditional', { expression: 'input.amount > 100' }), node('hi', 'merge'), node('lo', 'merge')],
    [edge('t', 'c'), edge('c', 'hi', 'true'), edge('c', 'lo', 'false')],
  );
  const run = await exec(w);
  const es = edgeStates(w, foldEvents(run.events).nodes);
  assert.equal(es['c.true->hi'], 'inactive');
  assert.equal(es['c.false->lo'], 'active');
  assert.equal(es['t.out->c'], 'active');
});

test('cancelled runs mark unfinished nodes cancelled when folded', async () => {
  const w = wf([node('t', 'trigger'), node('a', 'merge')], [edge('t', 'a')]);
  const run = await exec(w, { beforeNode: async ({ nodeId }) => (nodeId === 'a' ? 'abort' : 'run') });
  const view = foldEvents(run.events);
  assert.equal(view.status, 'cancelled');
  assert.equal(view.nodes.a.status, 'cancelled');
});
