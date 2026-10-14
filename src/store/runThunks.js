// Bridges Redux and the executor Web Worker.
// The worker owns execution; this module forwards events into the store and
// relays the step debugger's decisions (run / skip / continue / stop).

import { validateWorkflow } from '../engine/graph.js';
import { runRequested, runEvent, runFinished, runAborted } from './runSlice.js';
import { setPanelTab, showToast } from './uiSlice.js';

let worker = null;
let autoContinue = false; // "Continue": keep running until the next breakpoint

function teardown() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

export const startRun = (mode = 'auto') => (dispatch, getState) => {
  const state = getState();
  if (state.run.status === 'running') return;
  const workflow = state.workflow.workflow;

  const validation = validateWorkflow(workflow);
  if (!validation.valid) {
    dispatch(setPanelTab('problems'));
    dispatch(showToast(`Fix ${validation.errors.length} problem${validation.errors.length === 1 ? '' : 's'} before running.`, 'error'));
    return;
  }

  teardown();
  autoContinue = false;
  const runId = `run_${Date.now().toString(36)}`;
  const speed = state.run.speed;

  dispatch(runRequested({ mode }));
  dispatch(setPanelTab(mode === 'step' ? 'debugger' : 'runs'));

  try {
    worker = new Worker(new URL('../workers/executor.worker.js', import.meta.url), { type: 'module' });
  } catch (err) {
    dispatch(runAborted());
    dispatch(showToast(`Could not start the worker: ${err.message}`, 'error'));
    return;
  }

  worker.onmessage = ({ data }) => {
    if (data.type === 'event') {
      dispatch(runEvent(data.event));
      if (data.event.type === 'node:paused' && autoContinue) {
        const atBreakpoint = getState().run.breakpoints.includes(data.event.nodeId);
        if (atBreakpoint) autoContinue = false;
        else worker?.postMessage({ type: 'decide', decision: 'run' });
      }
    } else if (data.type === 'done') {
      dispatch(runFinished(data.run));
      teardown();
    } else if (data.type === 'error') {
      dispatch(runAborted());
      dispatch(showToast(`Run crashed: ${data.message}`, 'error'));
      teardown();
    }
  };
  worker.onerror = (e) => {
    dispatch(runAborted());
    dispatch(showToast(`Worker error: ${e.message || 'unknown'}`, 'error'));
    teardown();
  };

  worker.postMessage({
    type: 'run',
    workflow,
    runId,
    mode: mode === 'step' ? 'step' : 'normal',
    timeScale: speed,
  });
};

// Step debugger controls -------------------------------------------------------
export const stepRun = () => () => {
  autoContinue = false;
  worker?.postMessage({ type: 'decide', decision: 'run' });
};
export const skipStep = () => () => {
  autoContinue = false;
  worker?.postMessage({ type: 'decide', decision: 'skip' });
};
export const continueRun = () => () => {
  autoContinue = true;
  worker?.postMessage({ type: 'decide', decision: 'run' });
};
export const stopRun = () => () => {
  autoContinue = false;
  worker?.postMessage({ type: 'cancel' });
};
