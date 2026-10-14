import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import TopBar, { saveWorkflow } from './TopBar.jsx';
import NodeLibrary from './NodeLibrary.jsx';
import Canvas from './Canvas.jsx';
import Inspector from './Inspector.jsx';
import ProblemsPanel from './ProblemsPanel.jsx';
import RunsPanel from './RunsPanel.jsx';
import DebuggerPanel from './DebuggerPanel.jsx';
import Modals from './Modals.jsx';
import { dismissToast, setPanelTab } from '../store/uiSlice.js';
import { duplicateSelected, redo, removeSelected, undo } from '../store/workflowSlice.js';
import { selectValidation } from '../store/selectors.js';

const TABS = [
  { id: 'inspector', label: 'Properties' },
  { id: 'problems', label: 'Problems' },
  { id: 'runs', label: 'Runs' },
  { id: 'debugger', label: 'Debugger' },
];

function Toast() {
  const dispatch = useDispatch();
  const toast = useSelector((s) => s.ui.toast);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => dispatch(dismissToast()), 4500);
    return () => clearTimeout(t);
  }, [toast, dispatch]);
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.kind}`} role="status" onClick={() => dispatch(dismissToast())}>
      {toast.text}
    </div>
  );
}

export default function App() {
  const dispatch = useDispatch();
  const tab = useSelector((s) => s.ui.panelTab);
  const sidebarOpen = useSelector((s) => s.ui.sidebarOpen);
  const workflow = useSelector((s) => s.workflow.workflow);
  const validation = useSelector(selectValidation);
  const selected = useSelector((s) => s.workflow.selected);

  // Selecting something on the canvas brings the properties tab forward.
  useEffect(() => {
    if (selected && tab !== 'inspector' && tab !== 'debugger') dispatch(setPanelTab('inspector'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 's') {
        e.preventDefault();
        saveWorkflow(dispatch, workflow);
        return;
      }
      if (typing) return; // let text fields use their own undo and delete
      if (mod && key === 'z') {
        e.preventDefault();
        dispatch(e.shiftKey ? redo() : undo());
      } else if (mod && key === 'y') {
        e.preventDefault();
        dispatch(redo());
      } else if (mod && key === 'd') {
        e.preventDefault();
        dispatch(duplicateSelected());
      } else if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        dispatch(removeSelected());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, workflow]);

  const problemCount = validation.errors.length;

  return (
    <div className={`app ${sidebarOpen ? '' : 'no-sidebar'}`}>
      <TopBar />
      <div className="main">
        {sidebarOpen && <NodeLibrary />}
        <Canvas />
        <aside className="panel">
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? 'active' : ''}
                onClick={() => dispatch(setPanelTab(t.id))}
              >
                {t.label}
                {t.id === 'problems' && problemCount > 0 && <span className="tab-badge">{problemCount}</span>}
              </button>
            ))}
          </nav>
          <div className="panel-scroll">
            {tab === 'inspector' && <Inspector />}
            {tab === 'problems' && <ProblemsPanel />}
            {tab === 'runs' && <RunsPanel />}
            {tab === 'debugger' && <DebuggerPanel />}
          </div>
        </aside>
      </div>
      <Modals />
      <Toast />
    </div>
  );
}
