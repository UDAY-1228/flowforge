# FlowForge — visual workflow automation builder

A no-code workflow builder: drag nodes onto a canvas, connect triggers, conditions and actions, then run the
workflow and step through it in a debugger.

React · Redux Toolkit · SVG canvas · Web Worker · plain-JavaScript graph engine (no framework dependency).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine unit tests (Node's built-in test runner, no extra deps)
npm run build      # production build in dist/
```

## What it does

| Requirement | Where |
| --- | --- |
| Visual node editor with connections and branching | `src/components/Canvas.jsx` (SVG: drag nodes, drag from a port to connect, pan/zoom, Conditional has `true`/`false` ports) |
| Validation and cycle detection | `src/engine/graph.js` → `validateWorkflow`, `findCycles`; live in the top bar and the **Problems** tab |
| Dependency-ordered execution (topological sort) | `src/engine/graph.js` → `topologicalSort`; `src/engine/executor.js` |
| Conditional branches, retries, execution history | `executor.js` (branch activation, retry/backoff), `src/store/runSlice.js` (history, last 25 runs persisted) |
| Step debugger | `src/components/DebuggerPanel.jsx`, `src/engine/replay.js`, `src/workers/executor.worker.js` |
| Web Workers | Execution and expression evaluation run in `src/workers/executor.worker.js`, off the UI thread |

## The engineering, briefly

**Cycle detection.** Tarjan's strongly connected components, O(V+E). Any SCC with more than one node, or a self-loop,
is a cycle; a concrete path (`A → B → C → A`) is recovered for the error message. The canvas also refuses a connection
up front if the target can already reach the source (`wouldCreateCycle`), and explains why.

**Topological order.** Kahn's algorithm, O(V+E) plus sorting each ready set. Ties break by node insertion order so the
same graph always executes in the same order. It also returns *levels* (nodes that can run together) and, when a cycle
exists, the blocked nodes.

**Execution model.** Every edge is `pending`, `active` or `inactive`. A node is eligible once all its incoming edges are
resolved. It runs if at least one incoming edge is active, otherwise it is *skipped* and its outgoing edges become
inactive. That single rule gives you:

- conditional branching (a Conditional activates only the `true` or `false` port),
- dead-branch propagation (everything downstream of the untaken branch is skipped),
- correct joins (a Merge after a conditional still runs when only one branch fired; it waits for all *live* branches),
- failure isolation (a failed node deactivates its branch; independent branches keep running).

Ready nodes in the same wave run concurrently; in debug mode they run one at a time.

**State machines.**
Run: `running → succeeded | failed | cancelled` (or `rejected` if validation fails).
Node: `pending → running → succeeded | failed | skipped | cancelled`, with `retrying` between attempts.
Retries support fixed or exponential backoff and an optional "continue on error".

**Debugger = event sourcing.** The executor emits an ordered event stream. `foldEvents(events, upTo)` rebuilds node and
edge state at any point, and that one function drives the live overlay, the replay scrubber and the run history, so
they cannot disagree. A test checks that folding a finished run's events reproduces the executor's own run record.

## Node types

Trigger · Action (simulated HTTP, can be told to fail the first N attempts to demo retries) · Notification · Conditional ·
Delay · Logic (JavaScript expression that returns data to merge) · Merge.

Four templates are included, including one deliberately broken workflow so you can watch validation catch a cycle.

## Limits worth knowing

- Actions and notifications are **simulated**; nothing is actually sent. Swap in real behaviour via the `handlers` option of
  `executeWorkflow` (`src/engine/executor.js`).
- Conditions and Logic nodes evaluate JavaScript with `new Function` inside the worker. The worker has no DOM or
  localStorage and its network APIs are shadowed, but **this is not a security sandbox**. Only run or import workflows
  you trust.
- Workflows and run history are stored in this browser's `localStorage` (plus JSON import/export).
- The node library from the design reference also lists User Task, Loop, Sub-process, Parallel, Decision and Exception.
  Those are not implemented: parallel branches and decisions already fall out of the graph model (fan-out and Conditional),
  while loops and sub-processes would need the executor to support re-entry, which conflicts with the acyclic guarantee.

## Layout

```
src/engine/      pure JS: nodeTypes, graph (validate/cycles/topo), executor, replay
src/workers/     executor.worker.js
src/store/       Redux Toolkit slices (workflow + undo/redo, run, ui), thunks, persistence, templates
src/components/  Canvas, NodeLibrary, TopBar, Inspector, ProblemsPanel, RunsPanel, DebuggerPanel, Modals
tests/           engine.test.js
```
