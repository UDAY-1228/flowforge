import { createSlice, current, nanoid } from '@reduxjs/toolkit';
import { defaultConfig } from '../engine/nodeTypes.js';
import { wouldCreateCycle } from '../engine/graph.js';
import { buildTemplate } from './templates.js';
import { loadCurrent } from './persistence.js';

const HISTORY_LIMIT = 100;

function freshWorkflow(data) {
  return { id: nanoid(8), name: 'Untitled workflow', nodes: [], edges: [], ...data };
}

function initialWorkflow() {
  const saved = loadCurrent();
  if (saved && Array.isArray(saved.nodes) && Array.isArray(saved.edges)) return saved;
  return freshWorkflow(buildTemplate('order'));
}

const initialState = {
  workflow: initialWorkflow(),
  selected: null, // { type: 'node' | 'edge', id }
  past: [],
  future: [],
  dirty: false,
  lastEditKey: null, // used to coalesce rapid edits (typing) into one undo step
};

function snapshot(state) {
  state.past.push(current(state.workflow));
  if (state.past.length > HISTORY_LIMIT) state.past.shift();
  state.future = [];
  state.dirty = true;
}

const findNode = (state, id) => state.workflow.nodes.find((n) => n.id === id);

const slice = createSlice({
  name: 'workflow',
  initialState,
  reducers: {
    addNode: {
      reducer(state, { payload }) {
        snapshot(state);
        state.workflow.nodes.push(payload);
        state.selected = { type: 'node', id: payload.id };
      },
      prepare({ type, x, y }) {
        return { payload: { id: `${type}_${nanoid(5)}`, type, x: Math.round(x), y: Math.round(y), config: defaultConfig(type) } };
      },
    },

    // Call once when a drag starts so the whole drag is a single undo step.
    beginMove(state) {
      snapshot(state);
    },
    moveNode(state, { payload: { id, x, y } }) {
      const n = findNode(state, id);
      if (n) { n.x = x; n.y = y; }
    },

    updateNodeConfig(state, { payload: { id, patch, coalesceKey } }) {
      const n = findNode(state, id);
      if (!n) return;
      // Typing in a field should not create one undo step per keystroke.
      if (!(coalesceKey && state.lastEditKey === coalesceKey)) snapshot(state);
      state.lastEditKey = coalesceKey || null;
      n.config = { ...n.config, ...patch };
    },
    setNodeLabel(state, { payload: { id, label } }) {
      const n = findNode(state, id);
      if (!n) return;
      const key = `label:${id}`;
      if (state.lastEditKey !== key) snapshot(state);
      state.lastEditKey = key;
      n.label = label;
    },

    addEdge: {
      reducer(state, { payload }) {
        const { source, target, sourcePort } = payload;
        const dup = state.workflow.edges.some(
          (e) => e.source === source && e.target === target && (e.sourcePort || 'out') === (sourcePort || 'out'),
        );
        if (dup || source === target) return;
        // Defensive: the canvas already checks and explains this to the user.
        if (wouldCreateCycle(current(state.workflow), source, target)) return;
        snapshot(state);
        state.workflow.edges.push(payload);
        state.selected = { type: 'edge', id: payload.id };
      },
      prepare({ source, sourcePort, target }) {
        return { payload: { id: nanoid(8), source, sourcePort: sourcePort || 'out', target } };
      },
    },

    removeSelected(state) {
      const sel = state.selected;
      if (!sel) return;
      snapshot(state);
      if (sel.type === 'node') {
        state.workflow.nodes = state.workflow.nodes.filter((n) => n.id !== sel.id);
        state.workflow.edges = state.workflow.edges.filter((e) => e.source !== sel.id && e.target !== sel.id);
      } else {
        state.workflow.edges = state.workflow.edges.filter((e) => e.id !== sel.id);
      }
      state.selected = null;
    },

    duplicateSelected(state) {
      const sel = state.selected;
      if (!sel || sel.type !== 'node') return;
      const src = findNode(state, sel.id);
      if (!src || src.type === 'trigger') return;
      snapshot(state);
      const copy = JSON.parse(JSON.stringify(current(state.workflow).nodes.find((n) => n.id === sel.id)));
      copy.id = `${copy.type}_${nanoid(5)}`;
      copy.x += 40;
      copy.y += 40;
      state.workflow.nodes.push(copy);
      state.selected = { type: 'node', id: copy.id };
    },

    setWorkflowName(state, { payload }) {
      if (state.lastEditKey !== 'wf-name') snapshot(state);
      state.lastEditKey = 'wf-name';
      state.workflow.name = payload;
    },

    select(state, { payload }) {
      state.selected = payload;
      state.lastEditKey = null;
    },

    undo(state) {
      const prev = state.past.pop();
      if (!prev) return;
      state.future.push(current(state.workflow));
      state.workflow = prev;
      state.lastEditKey = null;
      if (state.selected && !workflowHasSelection(state)) state.selected = null;
    },
    redo(state) {
      const next = state.future.pop();
      if (!next) return;
      state.past.push(current(state.workflow));
      state.workflow = next;
      state.lastEditKey = null;
      if (state.selected && !workflowHasSelection(state)) state.selected = null;
    },

    loadWorkflow(state, { payload }) {
      state.workflow = freshWorkflow({ ...payload, id: payload.id || nanoid(8) });
      state.selected = null;
      state.past = [];
      state.future = [];
      state.dirty = false;
      state.lastEditKey = null;
    },
    newWorkflow(state) {
      state.workflow = freshWorkflow({
        nodes: [{ id: `trigger_${nanoid(5)}`, type: 'trigger', x: 80, y: 200, config: defaultConfig('trigger') }],
      });
      state.selected = null;
      state.past = [];
      state.future = [];
      state.dirty = false;
    },
    markSaved(state) {
      state.dirty = false;
    },
  },
});

function workflowHasSelection(state) {
  const sel = state.selected;
  return sel.type === 'node'
    ? state.workflow.nodes.some((n) => n.id === sel.id)
    : state.workflow.edges.some((e) => e.id === sel.id);
}

export const {
  addNode, beginMove, moveNode, updateNodeConfig, setNodeLabel, addEdge, removeSelected,
  duplicateSelected, setWorkflowName, select, undo, redo, loadWorkflow, newWorkflow, markSaved,
} = slice.actions;

export default slice.reducer;
