// Web Worker host for the executor. Keeps expression evaluation and any long
// running work off the UI thread, and gives the step debugger a place to park.
//
// Messages in:
//   { type: 'run', workflow, runId, mode: 'normal' | 'step', timeScale, triggerPayload }
//   { type: 'decide', decision: 'run' | 'skip' | 'abort' }   (step mode only)
//   { type: 'cancel' }
// Messages out:
//   { type: 'event', event }   every executor event as it happens
//   { type: 'done', run }      the full run record
//   { type: 'error', message } unexpected failure inside the worker

import { executeWorkflow } from '../engine/executor.js';

// Defense in depth: user-written expressions run via new Function inside this
// worker. It has no DOM or localStorage, and we also shadow the obvious network
// APIs. This is NOT a sandbox (a determined script can still reach the
// prototypes), so only run workflows you trust.
for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches']) {
  try { self[name] = undefined; } catch { /* read-only in this runtime */ }
}

let signal = null;
let pendingDecision = null;

self.onmessage = async (msg) => {
  const data = msg.data;

  if (data.type === 'cancel') {
    if (signal) signal.aborted = true;
    if (pendingDecision) {
      pendingDecision('abort');
      pendingDecision = null;
    }
    return;
  }

  if (data.type === 'decide') {
    if (pendingDecision) {
      pendingDecision(data.decision || 'run');
      pendingDecision = null;
    }
    return;
  }

  if (data.type === 'run') {
    signal = { aborted: false };
    const stepMode = data.mode === 'step';
    try {
      const run = await executeWorkflow(data.workflow, {
        timeScale: data.timeScale ?? 1,
        triggerPayload: data.triggerPayload,
        runId: data.runId,
        signal,
        onEvent: (event) => self.postMessage({ type: 'event', event }),
        beforeNode: stepMode ? () => new Promise((resolve) => { pendingDecision = resolve; }) : undefined,
      });
      self.postMessage({ type: 'done', run });
    } catch (err) {
      self.postMessage({ type: 'error', message: err?.message || String(err) });
    } finally {
      signal = null;
      pendingDecision = null;
    }
  }
};
