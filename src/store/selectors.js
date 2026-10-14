import { createSelector } from '@reduxjs/toolkit';
import { validateWorkflow } from '../engine/graph.js';

export const selectWorkflow = (s) => s.workflow.workflow;

export const selectValidation = createSelector([selectWorkflow], (wf) => validateWorkflow(wf));

// nodeId -> 'error' | 'warning' for canvas outlines
export const selectIssueMap = createSelector([selectValidation], (v) => {
  const map = {};
  for (const w of v.warnings) if (w.nodeId) map[w.nodeId] = 'warning';
  for (const e of v.errors) {
    if (e.nodeId) map[e.nodeId] = 'error';
    for (const id of e.path || []) map[id] = 'error';
  }
  return map;
});
