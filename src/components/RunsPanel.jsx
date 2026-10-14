import React, { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Icon from './Icon.jsx';
import { clearHistory, deleteRun, selectRun } from '../store/runSlice.js';
import { setPanelTab } from '../store/uiSlice.js';
import { foldEvents } from '../engine/replay.js';

function fmtTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function RunRow({ run, active }) {
  const dispatch = useDispatch();
  const view = useMemo(() => foldEvents(run.events), [run.events]);
  const counts = { succeeded: 0, failed: 0, skipped: 0 };
  for (const n of Object.values(view.nodes)) if (counts[n.status] !== undefined) counts[n.status] += 1;
  const retries = Object.values(view.nodes).reduce((a, n) => a + Math.max(0, n.attempts.length - 1), 0);
  const dur = run.endedAt && run.startedAt ? `${run.endedAt - run.startedAt} ms` : 'running…';

  return (
    <li className={`run-row ${active ? 'active' : ''}`}>
      <button type="button" className="run-main" onClick={() => { dispatch(selectRun(run.id)); dispatch(setPanelTab('debugger')); }}>
        <span className={`status-dot st-${run.status}`} />
        <span className="run-info">
          <strong>{run.workflowName || 'Workflow'}</strong>
          <small>{fmtTime(run.startedAt)} · {dur}</small>
          <small>
            {counts.succeeded} ok{counts.failed ? ` · ${counts.failed} failed` : ''}{counts.skipped ? ` · ${counts.skipped} skipped` : ''}
            {retries ? ` · ${retries} retr${retries === 1 ? 'y' : 'ies'}` : ''}
          </small>
        </span>
        <span className={`badge st-${run.status}`}>{run.status}</span>
      </button>
      {!run.live && (
        <button type="button" className="icon-btn" title="Delete run" onClick={() => dispatch(deleteRun(run.id))}>
          <Icon name="trash" size={15} />
        </button>
      )}
    </li>
  );
}

export default function RunsPanel() {
  const dispatch = useDispatch();
  const runs = useSelector((s) => s.run.runs);
  const activeRunId = useSelector((s) => s.run.activeRunId);

  if (runs.length === 0) {
    return (
      <div className="panel-body">
        <div className="empty-state"><Icon name="play" size={26} /><p>No runs yet. Press <b>Run</b> to execute this workflow, or <b>Debug</b> to step through it.</p></div>
      </div>
    );
  }
  return (
    <div className="panel-body">
      <div className="panel-row">
        <h3 className="panel-h">Execution history</h3>
        <button type="button" className="link-btn" onClick={() => dispatch(clearHistory())}>Clear all</button>
      </div>
      <ul className="runs">
        {runs.map((r) => <RunRow key={r.id} run={r} active={r.id === activeRunId} />)}
      </ul>
    </div>
  );
}
