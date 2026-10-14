import { configureStore } from '@reduxjs/toolkit';
import workflow from './workflowSlice.js';
import run from './runSlice.js';
import ui from './uiSlice.js';
import { saveCurrent, saveRuns } from './persistence.js';

export const store = configureStore({
  reducer: { workflow, run, ui },
  middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
});

// Debounced autosave of the working copy and the run history.
let timer = null;
let lastWorkflow = store.getState().workflow.workflow;
let lastRuns = store.getState().run.runs;
store.subscribe(() => {
  const s = store.getState();
  if (s.workflow.workflow === lastWorkflow && s.run.runs === lastRuns) return;
  lastWorkflow = s.workflow.workflow;
  lastRuns = s.run.runs;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const st = store.getState();
    saveCurrent(st.workflow.workflow);
    // Only finished runs are persisted; a run that is still live is skipped.
    saveRuns(st.run.runs.filter((r) => !r.live).slice(0, 25));
  }, 400);
});
