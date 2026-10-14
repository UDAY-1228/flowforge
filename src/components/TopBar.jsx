import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Icon, { Logo } from './Icon.jsx';
import { redo, setWorkflowName, undo, markSaved } from '../store/workflowSlice.js';
import { openModal, setPanelTab, showToast, toggleSidebar } from '../store/uiSlice.js';
import { setSpeed } from '../store/runSlice.js';
import { startRun, stopRun } from '../store/runThunks.js';
import { selectValidation } from '../store/selectors.js';
import { saveNamed } from '../store/persistence.js';

export function saveWorkflow(dispatch, workflow) {
  const ok = saveNamed(workflow);
  dispatch(markSaved());
  dispatch(showToast(ok ? `Saved "${workflow.name}" to this browser.` : 'Could not save: browser storage is unavailable.', ok ? 'success' : 'error'));
}

export default function TopBar() {
  const dispatch = useDispatch();
  const workflow = useSelector((s) => s.workflow.workflow);
  const canUndo = useSelector((s) => s.workflow.past.length > 0);
  const canRedo = useSelector((s) => s.workflow.future.length > 0);
  const dirty = useSelector((s) => s.workflow.dirty);
  const sidebarOpen = useSelector((s) => s.ui.sidebarOpen);
  const running = useSelector((s) => s.run.status === 'running');
  const mode = useSelector((s) => s.run.mode);
  const speed = useSelector((s) => s.run.speed);
  const validation = useSelector(selectValidation);

  const nErr = validation.errors.length;
  const nWarn = validation.warnings.length;

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Logo size={24} />
        {!sidebarOpen && (
          <button type="button" className="icon-btn dark" title="Show library" onClick={() => dispatch(toggleSidebar())}>
            <Icon name="panel" />
          </button>
        )}
        <button type="button" className="icon-btn dark" title="Save (Ctrl+S)" onClick={() => saveWorkflow(dispatch, workflow)}>
          <Icon name="save" />
          {dirty && <span className="dirty-dot" />}
        </button>
        <button type="button" className="icon-btn dark" title="Open / import / export" onClick={() => dispatch(openModal('open'))}>
          <Icon name="open" />
        </button>
        <button type="button" className="icon-btn dark" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => dispatch(undo())}>
          <Icon name="undo" />
        </button>
        <button type="button" className="icon-btn dark" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => dispatch(redo())}>
          <Icon name="redo" />
        </button>
      </div>

      <div className="breadcrumb">
        <span className="crumb-muted">My Workflows</span>
        <span className="crumb-sep">/</span>
        <input
          className="name-input"
          value={workflow.name}
          aria-label="Workflow name"
          onChange={(e) => dispatch(setWorkflowName(e.target.value))}
        />
      </div>

      <div className="topbar-right">
        <button
          type="button"
          className={`status-pill ${nErr ? 'bad' : nWarn ? 'warn' : 'good'}`}
          onClick={() => dispatch(setPanelTab('problems'))}
          title="Open validation results"
        >
          <Icon name={nErr || nWarn ? 'alert' : 'check'} size={15} />
          {nErr ? `${nErr} error${nErr > 1 ? 's' : ''}` : nWarn ? `${nWarn} warning${nWarn > 1 ? 's' : ''}` : 'Valid'}
        </button>

        <label className="speed">
          <span>Speed</span>
          <select value={speed} onChange={(e) => dispatch(setSpeed(Number(e.target.value)))} disabled={running}>
            <option value={3}>Slow</option>
            <option value={1}>Normal</option>
            <option value={0}>Instant</option>
          </select>
        </label>

        {running ? (
          <button type="button" className="btn danger" onClick={() => dispatch(stopRun())}>
            <Icon name="stop" size={14} /> Stop
          </button>
        ) : (
          <>
            <button type="button" className="btn ghost" onClick={() => dispatch(startRun('step'))} title="Pause before every node and inspect it">
              <Icon name="debug" size={15} /> Debug
            </button>
            <button type="button" className="btn primary" onClick={() => dispatch(startRun('auto'))}>
              <Icon name="play" size={14} /> Run
            </button>
          </>
        )}
        {running && <span className="running-label">{mode === 'step' ? 'Debugging…' : 'Running…'}</span>}
      </div>
    </header>
  );
}
