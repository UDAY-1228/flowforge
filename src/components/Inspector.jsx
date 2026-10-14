import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Icon from './Icon.jsx';
import { NODE_TYPES } from '../engine/nodeTypes.js';
import { SCHEMA } from './inspectorSchema.js';
import { duplicateSelected, removeSelected, setNodeLabel, updateNodeConfig } from '../store/workflowSlice.js';
import { toggleBreakpoint } from '../store/runSlice.js';
import { nodeTitle } from '../utils/geometry.js';

function JsonField({ nodeId, field, value }) {
  const dispatch = useDispatch();
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState(null);
  useEffect(() => {
    setText(JSON.stringify(value ?? {}, null, 2));
    setError(null);
    // Only reset when switching to a different node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  return (
    <>
      <textarea
        className="mono"
        rows={6}
        value={text}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value || '{}');
            if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Must be a JSON object');
            setError(null);
            dispatch(updateNodeConfig({ id: nodeId, patch: { [field.key]: parsed }, coalesceKey: `${nodeId}:${field.key}` }));
          } catch (err) {
            setError(err.message);
          }
        }}
      />
      {error && <div className="field-error">Not saved yet: {error}</div>}
    </>
  );
}

function Field({ node, field }) {
  const dispatch = useDispatch();
  const value = node.config?.[field.key];
  const set = (v) => dispatch(updateNodeConfig({ id: node.id, patch: { [field.key]: v }, coalesceKey: `${node.id}:${field.key}` }));

  let input;
  switch (field.type) {
    case 'number':
      input = (
        <input type="number" min={field.min} max={field.max} value={value ?? ''}
          onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))} />
      );
      break;
    case 'select':
      input = (
        <select value={value ?? field.options[0]} onChange={(e) => set(e.target.value)}>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
      break;
    case 'checkbox':
      input = (
        <label className="check">
          <input type="checkbox" checked={!!value} onChange={(e) => set(e.target.checked)} />
          <span>{value ? 'On' : 'Off'}</span>
        </label>
      );
      break;
    case 'expression':
      input = <textarea className="mono" rows={3} spellCheck={false} value={value ?? ''} onChange={(e) => set(e.target.value)} />;
      break;
    case 'json':
      input = <JsonField nodeId={node.id} field={field} value={value} />;
      break;
    default:
      input = <input type="text" value={value ?? ''} onChange={(e) => set(e.target.value)} />;
  }

  return (
    <div className="field">
      <label>{field.label}</label>
      {input}
      {field.help && <div className="field-help">{field.help}</div>}
    </div>
  );
}

export default function Inspector() {
  const dispatch = useDispatch();
  const workflow = useSelector((s) => s.workflow.workflow);
  const selected = useSelector((s) => s.workflow.selected);
  const breakpoints = useSelector((s) => s.run.breakpoints);

  if (selected?.type === 'node') {
    const node = workflow.nodes.find((n) => n.id === selected.id);
    if (!node) return null;
    const t = NODE_TYPES[node.type];
    const fields = SCHEMA[node.type] || [];
    const hasBp = breakpoints.includes(node.id);
    return (
      <div className="panel-body">
        <div className="inspector-head">
          <span className="library-icon"><Icon name={node.type} size={22} color="#3b6cf6" /></span>
          <div>
            <strong>{t.label}</strong>
            <small>{node.id}</small>
          </div>
        </div>
        <div className="field">
          <label>Display name</label>
          <input type="text" value={node.label ?? ''} placeholder={nodeTitle({ ...node, label: '' })}
            onChange={(e) => dispatch(setNodeLabel({ id: node.id, label: e.target.value }))} />
        </div>
        {fields.map((f) => <Field key={`${node.id}:${f.key}`} node={node} field={f} />)}
        {fields.length === 0 && <p className="muted">This node has no settings. It combines the data from every branch that reached it.</p>}
        <div className="button-row">
          {node.type !== 'trigger' && (
            <button type="button" className="btn small" onClick={() => dispatch(toggleBreakpoint(node.id))}>
              <Icon name="dot" size={12} color={hasBp ? '#d9363e' : '#9aa0ae'} /> {hasBp ? 'Remove breakpoint' : 'Add breakpoint'}
            </button>
          )}
          {node.type !== 'trigger' && (
            <button type="button" className="btn small" onClick={() => dispatch(duplicateSelected())}>
              <Icon name="copy" size={14} /> Duplicate
            </button>
          )}
          <button type="button" className="btn small danger-outline" onClick={() => dispatch(removeSelected())}>
            <Icon name="trash" size={14} /> Delete
          </button>
        </div>
      </div>
    );
  }

  if (selected?.type === 'edge') {
    const edge = workflow.edges.find((e) => e.id === selected.id);
    if (!edge) return null;
    const s = workflow.nodes.find((n) => n.id === edge.source);
    const t = workflow.nodes.find((n) => n.id === edge.target);
    return (
      <div className="panel-body">
        <div className="inspector-head"><div><strong>Connection</strong><small>{edge.id}</small></div></div>
        <p>
          <b>{s ? nodeTitle(s) : '?'}</b>
          {edge.sourcePort && edge.sourcePort !== 'out' && <span className="tag">{edge.sourcePort}</span>}
          {' → '}
          <b>{t ? nodeTitle(t) : '?'}</b>
        </p>
        <div className="button-row">
          <button type="button" className="btn small danger-outline" onClick={() => dispatch(removeSelected())}>
            <Icon name="trash" size={14} /> Delete connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-body">
      <div className="inspector-head"><div><strong>{workflow.name}</strong><small>{workflow.nodes.length} nodes · {workflow.edges.length} connections</small></div></div>
      <p className="muted">Select a node or connection to edit it.</p>
      <ul className="tips">
        <li>Drag from a node&apos;s right-hand port to another node to connect them.</li>
        <li>Conditional nodes have a <b>true</b> and a <b>false</b> port.</li>
        <li>Connections that would create a cycle are refused.</li>
        <li><kbd>Del</kbd> removes the selection · <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes · <kbd>Ctrl</kbd>+scroll zooms.</li>
        <li>Use <b>Debug</b> to pause before each node and inspect its input.</li>
      </ul>
    </div>
  );
}
