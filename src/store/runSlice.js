import { createSlice, createSelector } from '@reduxjs/toolkit';
import { foldEvents, edgeStates } from '../engine/replay.js';
import { loadRuns } from './persistence.js';

const MAX_RUNS = 25;

const initialState = {
  runs: loadRuns(), // newest first. Each: { id, workflowName, status, startedAt, endedAt, events, errors }
  activeRunId: null,
  replayIndex: null, // null = follow the latest event
  status: 'idle', // idle | running
  mode: 'auto', // auto | step
  breakpoints: [], // node ids
  speed: 1, // 0 = instant, 1 = normal, 3 = slow
};

const slice = createSlice({
  name: 'run',
  initialState,
  reducers: {
    runRequested(state, { payload }) {
      state.status = 'running';
      state.mode = payload.mode;
    },
    runEvent(state, { payload: event }) {
      let run = state.runs.find((r) => r.id === event.runId);
      if (!run) {
        run = { id: event.runId, workflowName: event.workflowName || '', status: 'running', startedAt: event.t, endedAt: null, events: [], errors: [], live: true };
        state.runs.unshift(run);
        state.activeRunId = event.runId;
        state.replayIndex = null;
      }
      if (event.type === 'run:start') run.workflowName = event.workflowName || run.workflowName;
      run.events.push(event);
      if (event.type === 'run:end') { run.status = event.status; run.endedAt = event.t; }
      if (event.type === 'run:rejected') { run.status = 'rejected'; run.endedAt = event.t; run.errors = event.errors; }
    },
    runFinished(state, { payload: record }) {
      const stored = {
        id: record.id, workflowId: record.workflowId, workflowName: record.workflowName, status: record.status,
        startedAt: record.startedAt, endedAt: record.endedAt, order: record.order, errors: record.errors, events: record.events,
      };
      const i = state.runs.findIndex((r) => r.id === record.id);
      if (i >= 0) state.runs[i] = stored; else state.runs.unshift(stored);
      state.runs = state.runs.slice(0, MAX_RUNS);
      state.status = 'idle';
    },
    runAborted(state) {
      state.status = 'idle';
    },
    selectRun(state, { payload }) {
      state.activeRunId = payload;
      state.replayIndex = null;
    },
    setReplayIndex(state, { payload }) {
      state.replayIndex = payload;
    },
    clearActiveRun(state) {
      state.activeRunId = null;
      state.replayIndex = null;
    },
    deleteRun(state, { payload }) {
      state.runs = state.runs.filter((r) => r.id !== payload);
      if (state.activeRunId === payload) { state.activeRunId = null; state.replayIndex = null; }
    },
    clearHistory(state) {
      state.runs = state.runs.filter((r) => r.live && state.status === 'running');
      state.activeRunId = state.runs[0]?.id ?? null;
      state.replayIndex = null;
    },
    toggleBreakpoint(state, { payload }) {
      const i = state.breakpoints.indexOf(payload);
      if (i >= 0) state.breakpoints.splice(i, 1); else state.breakpoints.push(payload);
    },
    setSpeed(state, { payload }) {
      state.speed = payload;
    },
  },
});

export const {
  runRequested, runEvent, runFinished, runAborted, selectRun, setReplayIndex, clearActiveRun,
  deleteRun, clearHistory, toggleBreakpoint, setSpeed,
} = slice.actions;

// ---- selectors --------------------------------------------------------------
const selectRunState = (s) => s.run;
export const selectActiveRun = createSelector([selectRunState], (r) => r.runs.find((x) => x.id === r.activeRunId) || null);

export const selectRunView = createSelector(
  [selectActiveRun, (s) => s.run.replayIndex, (s) => s.workflow.workflow],
  (run, replayIndex, workflow) => {
    if (!run) return null;
    const upto = replayIndex == null ? run.events.length : replayIndex;
    const view = foldEvents(run.events, upto);
    return { run, view, edges: edgeStates(workflow, view.nodes), following: replayIndex == null };
  },
);

export default slice.reducer;
