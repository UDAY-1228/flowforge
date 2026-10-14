import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Icon from './Icon.jsx';
import { selectRunView, setReplayIndex } from '../store/runSlice.js';
import { select } from '../store/workflowSlice.js';
import { continueRun, skipStep, stepRun, stopRun } from '../store/runThunks.js';
import { nodeTitle } from '../utils/geometry.js';

function describe(e, label) {
  const name = e.nodeId ? label(e.nodeId) : '';
  switch (e.type) {
    case 'run:start': return 'Run started';
    case 'run:end': return `Run ${e.status}`;
    case 'run:rejected': return 'Run rejected by validation';
    case 'node:paused': return `Paused before ${name}`;
    case 'node:start': return `Started ${name}`;
    case 'node:attempt': return `Attempt ${e.attempt} of ${name}`;
    case 'node:retry': return `${name} failed (${e.error?.message}). Retrying in ${e.delayMs} ms`;
    case 'node:success': return `${name} succeeded${e.port ? ` → ${e.port} branch` : ''}`;
    case 'node:failed': return `${name} failed: ${e.error?.message}${e.continued ? ' (continuing)' : ''}`;
    case 'node:skipped': return `${name} skipped: ${e.reason}`;
    default: return e.type;
  }
}

const Json = ({ value }) => (
  <pre className="json">{value === undefined ? '—' : JSON.stringify(value, null, 2)}</pre>
);

export default function DebuggerPanel() {
  const dispatch = useDispatch();
  const rv = useSelector(selectRunView);
  const running = useSelector((s) => s.run.status === 'running');
  const nodes = useSelector((s) => s.workflow.workflow.nodes);
  const selected = useSelector((s) => s.workflow.selected);
  const [focusId, setFocusId] = useState(null);

  const pausedId = rv?.view.paused?.nodeId;
  useEffect(() => { if (pausedId) setFocusId(pausedId); }, [pausedId]);
  useEffect(() => { if (selected?.type === 'node') setFocusId(selected.id); }, [selected]);

  if (!rv) {
    return (
      <div className="panel-body">
        <div className="empty-state">
          <Icon name="debug" size={26} />
          <p>Nothing to debug yet. Press <b>Debug</b> to pause before each node, or open a past run from the Runs tab.</p>
        </div>
      </div>
    );
  }

  const { run, view, following } = rv;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const label = (id) => nodeTitle(byId.get(id) || { id });
  const total = run.events.length;
  const position = view.position;
  const paused = following && running ? view.paused : null;

  const touched = Object.keys(view.nodes);
  const order = view.order.length ? view.order.filter((id) => view.nodes[id]) : touched;
  const firstFailed = order.find((id) => view.nodes[id]?.status === 'failed');
  const activeId = (focusId && view.nodes[focusId] && focusId) || pausedId || firstFailed || order[0];
  const info = activeId ? view.nodes[activeId] : null;
  const node = activeId ? byId.get(activeId) : null;
  const t0 = run.startedAt || 0;

  const go = (i) => dispatch(setReplayIndex(i >= total ? null : Math.max(0, i)));

  return (
    <div className="panel-body debugger">
      {paused && (
        <div className="paused-card">
          <div className="paused-title"><span className="pulse-dot" /> Paused before <b>{label(paused.nodeId)}</b></div>
          <p className="muted small">Its input is shown below. Choose what happens next.</p>
          <div className="button-row">
            <button type="button" className="btn small primary" onClick={() => dispatch(stepRun())}><Icon name="next" size={14} /> Step</button>
            <button type="button" className="btn small" onClick={() => dispatch(skipStep())}><Icon name="skip" size={14} /> Skip node</button>
            <button type="button" className="btn small" onClick={() => dispatch(continueRun())}><Icon name="play" size={13} /> Continue</button>
            <button type="button" className="btn small danger-outline" onClick={() => dispatch(stopRun())}><Icon name="stop" size={12} /> Stop</button>
          </div>
          <p className="muted small">Continue runs until the next breakpoint (select a node and add one) or the end.</p>
        </div>
      )}
      {running && !following && (
        <div className="notice">
          Viewing history while the run continues. <button type="button" className="link-btn" onClick={() => go(total)}>Jump to latest</button>
        </div>
      )}

      <div className="scrubber">
        <button type="button" className="icon-btn" title="First" disabled={position === 0} onClick={() => go(0)}>«</button>
        <button type="button" className="icon-btn" title="Previous event" disabled={position === 0} onClick={() => go(position - 1)}>‹</button>
        <input type="range" min={0} max={total} value={position} onChange={(e) => go(Number(e.target.value))} aria-label="Replay position" />
        <button type="button" className="icon-btn" title="Next event" disabled={position >= total} onClick={() => go(position + 1)}>›</button>
        <span className="scrub-label">{position}/{total}</span>
      </div>

      <h3 className="panel-h">Steps</h3>
      <ul className="steps">
        {order.map((id) => {
          const n = view.nodes[id];
          return (
            <li key={id}>
              <button
                type="button"
                className={`step-row ${id === activeId ? 'active' : ''}`}
                onClick={() => { setFocusId(id); if (byId.has(id)) dispatch(select({ type: 'node', id })); }}
              >
                <span className={`status-dot st-${n.status}`} />
                <span className="step-name">{label(id)}</span>
                {n.attempts.length > 1 && <span className="tag">×{n.attempts.length}</span>}
                <span className="step-status">{n.status}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {info && node && (
        <div className="detail">
          <div className="detail-head">
            <strong>{label(activeId)}</strong>
            <span className={`badge st-${info.status}`}>{info.status}</span>
          </div>
          {info.note && <p className="muted small">{info.note}</p>}

          <h4>Input</h4>
          <Json value={info.input} />

          <h4>Output{info.port ? <span className="tag">{info.port} branch</span> : null}</h4>
          <Json value={info.output} />

          {info.error && (
            <>
              <h4>Failure</h4>
              <div className="error-box"><b>{info.error.name}</b>: {info.error.message}{info.continued ? ' (workflow continued past this)' : ''}</div>
            </>
          )}

          {info.attempts.length > 0 && (
            <>
              <h4>Attempts</h4>
              <ul className="attempts">
                {info.attempts.map((a) => (
                  <li key={a.n}>
                    <span className={`status-dot st-${a.status}`} />
                    <span>#{a.n}</span>
                    <span className="muted">{a.endedAt && a.startedAt ? `${a.endedAt - a.startedAt} ms` : 'in progress'}</span>
                    {a.error && <span className="attempt-err">{a.error.message}</span>}
                  </li>
                ))}
              </ul>
              {info.status === 'retrying' && <p className="muted small">Waiting {info.nextRetryDelay} ms before the next attempt.</p>}
            </>
          )}

          <h4>Node settings</h4>
          <Json value={node.config} />
        </div>
      )}

      <h3 className="panel-h">Event log</h3>
      <ol className="events">
        {run.events.map((e, i) => (
          <li key={e.seq ?? i} className={i === position - 1 ? 'current' : i >= position ? 'future' : ''}>
            <button type="button" onClick={() => go(i + 1)}>
              <span className="ev-time">+{Math.max(0, (e.t || 0) - t0)}ms</span>
              <span>{describe(e, label)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
