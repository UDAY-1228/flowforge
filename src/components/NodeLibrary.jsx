import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Icon from './Icon.jsx';
import { NODE_TYPES } from '../engine/nodeTypes.js';
import { addNode } from '../store/workflowSlice.js';
import { openModal, toggleSidebar } from '../store/uiSlice.js';
import { NODE_W, screenToWorld, snap } from '../utils/geometry.js';

export default function NodeLibrary() {
  const dispatch = useDispatch();
  const viewport = useSelector((s) => s.ui.viewport);
  const count = useSelector((s) => s.workflow.workflow.nodes.length);

  const addAtCenter = (type) => {
    // Drop near the middle of the visible canvas, staggered so repeats do not stack.
    const cx = 280 + (window.innerWidth - 280 - 360) / 2;
    const cy = 60 + (window.innerHeight - 60) / 2;
    const p = screenToWorld(cx, cy, { left: 0, top: 0 }, viewport);
    const off = (count % 6) * 24;
    dispatch(addNode({ type, x: snap(p.x - NODE_W / 2 + off), y: snap(p.y - 34 + off) }));
  };

  return (
    <aside className="library">
      <div className="library-head">
        <h2>Nodes Library</h2>
        <button type="button" className="icon-btn" title="Hide library" onClick={() => dispatch(toggleSidebar())}>
          <Icon name="panel" size={18} />
        </button>
      </div>
      <div className="library-list">
        {Object.entries(NODE_TYPES).map(([type, t]) => (
          <button
            type="button"
            key={type}
            className="library-card"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-flowforge-node', type);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => addAtCenter(type)}
            title="Drag onto the canvas, or click to add"
          >
            <span className="library-icon"><Icon name={type} size={22} color="#3b6cf6" /></span>
            <span className="library-text">
              <strong>{t.label}</strong>
              <small>{t.subtitle}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="library-foot">
        <button type="button" onClick={() => dispatch(openModal('templates'))}>Templates</button>
        <button type="button" onClick={() => dispatch(openModal('help'))}>Help &amp; Support</button>
      </div>
    </aside>
  );
}
