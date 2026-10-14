import { createSlice } from '@reduxjs/toolkit';

const slice = createSlice({
  name: 'ui',
  initialState: {
    panelTab: 'inspector', // inspector | problems | runs | debugger
    viewport: { x: 40, y: 20, k: 0.8 },
    fitRequest: 1,
    fitAll: false, // true when the Fit button asked for the whole graph
    toast: null, // { id, kind: 'info'|'error'|'success', text }
    modal: null, // 'templates' | 'open' | 'help' | null
    sidebarOpen: true,
  },
  reducers: {
    setPanelTab(state, { payload }) { state.panelTab = payload; },
    setViewport(state, { payload }) { state.viewport = payload; },
    requestFit(state, { payload }) { state.fitRequest += 1; state.fitAll = payload === true; },
    showToast: {
      reducer(state, { payload }) { state.toast = payload; },
      prepare(text, kind = 'info') { return { payload: { id: Date.now() + Math.random(), text, kind } }; },
    },
    dismissToast(state) { state.toast = null; },
    openModal(state, { payload }) { state.modal = payload; },
    closeModal(state) { state.modal = null; },
    toggleSidebar(state) { state.sidebarOpen = !state.sidebarOpen; },
  },
});

export const {
  setPanelTab, setViewport, requestFit, showToast, dismissToast, openModal, closeModal, toggleSidebar,
} = slice.actions;
export default slice.reducer;
