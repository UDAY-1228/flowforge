import React, { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Icon from './Icon.jsx';
import { TEMPLATES, buildTemplate } from '../store/templates.js';
import { closeModal, requestFit, showToast } from '../store/uiSlice.js';
import { loadWorkflow, newWorkflow } from '../store/workflowSlice.js';
import { clearActiveRun } from '../store/runSlice.js';
import { deleteNamed, loadSaved } from '../store/persistence.js';

function Modal({ title, children, onClose, wide }) {
  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title} onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function openWorkflow(dispatch, wf) {
  dispatch(loadWorkflow(wf));
  dispatch(clearActiveRun());
  dispatch(requestFit());
  dispatch(closeModal());
}

function TemplatesModal() {
  const dispatch = useDispatch();
  return (
    <Modal title="Templates" onClose={() => dispatch(closeModal())}>
      <ul className="cards">
        {TEMPLATES.map((t) => (
          <li key={t.key}>
            <button type="button" onClick={() => openWorkflow(dispatch, buildTemplate(t.key))}>
              <strong>{t.name}</strong>
              <span>{t.description}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="muted small">Loading a template replaces the workflow on the canvas and clears undo history, so save first if you want to keep the current one.</p>
    </Modal>
  );
}

function OpenModal() {
  const dispatch = useDispatch();
  const workflow = useSelector((s) => s.workflow.workflow);
  const [saved, setSaved] = useState(() => Object.values(loadSaved()).sort((a, b) => b.savedAt - a.savedAt));
  const fileRef = useRef(null);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${workflow.name.replace(/[^\w-]+/g, '_') || 'workflow'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new Error('Missing nodes or edges');
      openWorkflow(dispatch, data);
      dispatch(showToast(`Imported "${data.name || 'workflow'}".`, 'success'));
    } catch (err) {
      dispatch(showToast(`Could not import that file: ${err.message}`, 'error'));
    }
  };

  return (
    <Modal title="Open workflow" onClose={() => dispatch(closeModal())}>
      <div className="button-row">
        <button type="button" className="btn small" onClick={() => { dispatch(newWorkflow()); dispatch(clearActiveRun()); dispatch(requestFit()); dispatch(closeModal()); }}>
          <Icon name="plus" size={14} /> New blank workflow
        </button>
        <button type="button" className="btn small" onClick={() => fileRef.current?.click()}><Icon name="upload" size={14} /> Import JSON</button>
        <button type="button" className="btn small" onClick={exportJson}><Icon name="download" size={14} /> Export current</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => importJson(e.target.files?.[0])} />
      </div>
      <h3 className="panel-h">Saved in this browser</h3>
      {saved.length === 0 ? (
        <p className="muted">Nothing saved yet. Press the save icon in the top bar.</p>
      ) : (
        <ul className="cards">
          {saved.map((wf) => (
            <li key={wf.id} className="with-action">
              <button type="button" onClick={() => openWorkflow(dispatch, wf)}>
                <strong>{wf.name}</strong>
                <span>{wf.nodes.length} nodes · saved {new Date(wf.savedAt).toLocaleString()}</span>
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Delete saved copy"
                onClick={() => { deleteNamed(wf.id); setSaved((l) => l.filter((x) => x.id !== wf.id)); }}
              >
                <Icon name="trash" size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function HelpModal() {
  const dispatch = useDispatch();
  return (
    <Modal title="Help & Support" onClose={() => dispatch(closeModal())} wide>
      <div className="help">
        <h3>How a workflow runs</h3>
        <ol>
          <li>The graph is validated first: it needs a Trigger, no cycles, valid ports and sane settings.</li>
          <li>Nodes are scheduled in dependency order (topological sort). A node runs once every incoming connection has been resolved.</li>
          <li>A Conditional activates exactly one of its <b>true</b>/<b>false</b> connections; the other branch is skipped, and skipping cascades downstream.</li>
          <li>Merge nodes run when at least one branch reached them, combining the data that arrived.</li>
          <li>Failing nodes retry (with fixed or exponential backoff). If they still fail, that branch stops while independent branches carry on.</li>
        </ol>
        <h3>Debugging</h3>
        <ol>
          <li><b>Debug</b> pauses before each node. You can step, skip a node, or continue to the next breakpoint.</li>
          <li>After any run, open it from the Runs tab and drag the scrubber to replay it event by event.</li>
          <li>Click a node in the step list to see its input, output, failure, and each retry attempt.</li>
        </ol>
        <h3>Shortcuts</h3>
        <table>
          <tbody>
            <tr><td><kbd>Del</kbd> / <kbd>Backspace</kbd></td><td>Delete selected node or connection</td></tr>
            <tr><td><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Z</kbd></td><td>Undo</td></tr>
            <tr><td><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> or <kbd>Y</kbd></td><td>Redo</td></tr>
            <tr><td><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>S</kbd></td><td>Save to this browser</td></tr>
            <tr><td><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>D</kbd></td><td>Duplicate selected node</td></tr>
            <tr><td>Scroll / <kbd>Ctrl</kbd> + scroll</td><td>Pan / zoom the canvas</td></tr>
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export default function Modals() {
  const modal = useSelector((s) => s.ui.modal);
  if (modal === 'templates') return <TemplatesModal />;
  if (modal === 'open') return <OpenModal />;
  if (modal === 'help') return <HelpModal />;
  return null;
}
