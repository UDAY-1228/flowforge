import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Icon from './Icon.jsx';
import { select } from '../store/workflowSlice.js';
import { selectValidation } from '../store/selectors.js';

export default function ProblemsPanel() {
  const dispatch = useDispatch();
  const v = useSelector(selectValidation);
  const nodes = useSelector((s) => s.workflow.workflow.nodes);

  const focus = (issue) => {
    const id = issue.nodeId || issue.path?.[0];
    if (id && nodes.some((n) => n.id === id)) dispatch(select({ type: 'node', id }));
  };

  if (v.errors.length === 0 && v.warnings.length === 0) {
    return (
      <div className="panel-body">
        <div className="empty-state good"><Icon name="check" size={26} /><p>No problems. This workflow is valid and acyclic, so it can run.</p></div>
      </div>
    );
  }

  const row = (issue, kind, i) => (
    <li key={`${kind}${i}`} className={`issue ${kind}`}>
      <button type="button" onClick={() => focus(issue)}>
        <Icon name="alert" size={16} />
        <span>{issue.message}</span>
      </button>
    </li>
  );

  return (
    <div className="panel-body">
      {v.errors.length > 0 && (
        <>
          <h3 className="panel-h">Errors <span className="count bad">{v.errors.length}</span></h3>
          <p className="muted small">Errors block execution.</p>
          <ul className="issues">{v.errors.map((e, i) => row(e, 'error', i))}</ul>
        </>
      )}
      {v.warnings.length > 0 && (
        <>
          <h3 className="panel-h">Warnings <span className="count warn">{v.warnings.length}</span></h3>
          <ul className="issues">{v.warnings.map((w, i) => row(w, 'warning', i))}</ul>
        </>
      )}
    </div>
  );
}
