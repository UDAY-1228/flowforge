import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Icon from './Icon.jsx';
import { NODE_TYPES } from '../engine/nodeTypes.js';
import { wouldCreateCycle } from '../engine/graph.js';
import { addEdge, addNode, beginMove, moveNode, removeSelected, select } from '../store/workflowSlice.js';
import { setViewport, requestFit, showToast } from '../store/uiSlice.js';
import { clearActiveRun, selectRunView, toggleBreakpoint } from '../store/runSlice.js';
import { selectIssueMap } from '../store/selectors.js';
import {
  NODE_W, bezier, fitViewport, inputPort, nodeAt, nodeHeight, nodeSubtitle, nodeTitle,
  outputPort, screenToWorld, snap, truncate,
} from '../utils/geometry.js';

const STATUS_BADGE = {
  running: '#3b6cf6', retrying: '#e0a100', succeeded: '#22a06b', failed: '#d9363e',
  paused: '#8b5cf6', skipped: '#9aa0ae', cancelled: '#9aa0ae',
};

const NodeView = memo(function NodeView({ node, selected, info, issue, breakpoint, connectHover, onNodeDown, onPortDown, onBreakpoint }) {
  const t = NODE_TYPES[node.type];
  const h = nodeHeight(node);
  const status = info?.status && info.status !== 'pending' ? info.status : null;
  const attempts = info?.attempts?.length || 0;
  const isCond = node.type === 'conditional';
  const title = truncate(nodeTitle(node), isCond ? 15 : 19);
  const subtitle = truncate(nodeSubtitle(node), isCond ? 20 : 24);
  const cls = ['node-card', selected && 'is-selected', status && `s-${status}`, issue && `has-${issue}`, connectHover && 'is-target']
    .filter(Boolean).join(' ');

  return (
    <g transform={`translate(${node.x} ${node.y})`} className="node" data-node-id={node.id}>
      <rect className={cls} width={NODE_W} height={h} rx={14} onPointerDown={(e) => onNodeDown(e, node)} />
      <rect x={14} y={h / 2 - 20} width={40} height={40} rx={10} className="node-icon-box" pointerEvents="none" />
      <Icon name={node.type} size={22} x={23} y={h / 2 - 11} color="#3b6cf6" />
      <text x={66} y={h / 2 - 3} className="node-title" pointerEvents="none">{title}</text>
      <text x={66} y={h / 2 + 15} className="node-sub" pointerEvents="none">{subtitle}</text>
      <title>{`${nodeTitle(node)} — ${nodeSubtitle(node)}`}</title>

      {t.inputs.length > 0 && (
        <circle className="port port-in" cx={0} cy={h / 2} r={6} pointerEvents="none" />
      )}
      {t.outputs.map((p) => {
        const pos = outputPort({ ...node, x: 0, y: 0 }, p);
        return (
          <g key={p}>
            {isCond && <text x={NODE_W - 16} y={pos.y + 4} className="port-label" textAnchor="end" pointerEvents="none">{p}</text>}
            <circle className="port-hit" cx={pos.x} cy={pos.y} r={14} onPointerDown={(e) => onPortDown(e, node, p)} />
            <circle className={`port port-out port-${p}`} cx={pos.x} cy={pos.y} r={6} pointerEvents="none" />
          </g>
        );
      })}

      {status && (
        <g pointerEvents="none">
          <circle cx={NODE_W - 14} cy={14} r={6} fill={STATUS_BADGE[status] || '#9aa0ae'} className={status === 'running' ? 'badge-pulse' : ''} />
          {attempts > 1 && <text x={NODE_W - 26} y={18} className="attempt-count" textAnchor="end">×{attempts}</text>}
        </g>
      )}
      {breakpoint && <circle cx={-2} cy={-2} r={6} className="breakpoint-dot" pointerEvents="none" />}
      {selected && node.type !== 'trigger' && (
        <g className="node-action" transform={`translate(${NODE_W - 30} ${-34})`} onPointerDown={(e) => { e.stopPropagation(); onBreakpoint(node.id); }}>
          <rect width={30} height={26} rx={7} />
          <circle cx={15} cy={13} r={5} className={breakpoint ? 'bp-on' : 'bp-off'} />
          <title>{breakpoint ? 'Remove breakpoint' : 'Add breakpoint'}</title>
        </g>
      )}
    </g>
  );
});

export default function Canvas() {
  const dispatch = useDispatch();
  const workflow = useSelector((s) => s.workflow.workflow);
  const selected = useSelector((s) => s.workflow.selected);
  const viewport = useSelector((s) => s.ui.viewport);
  const fitRequest = useSelector((s) => s.ui.fitRequest);
  const fitAllRef = useRef(false);
  fitAllRef.current = useSelector((s) => s.ui.fitAll);
  const issues = useSelector(selectIssueMap);
  const runView = useSelector(selectRunView);
  const breakpoints = useSelector((s) => s.run.breakpoints);
  const { nodes, edges } = workflow;

  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const vpRef = useRef(viewport);
  const nodesRef = useRef(nodes);
  vpRef.current = viewport;
  nodesRef.current = nodes;

  const [connecting, setConnecting] = useState(null); // { fromId, port, pos }
  const [hoverTarget, setHoverTarget] = useState(null);

  // Track canvas size and honour "fit" requests.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      sizeRef.current = { w: r.width, h: r.height };
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const r = svgRef.current?.getBoundingClientRect();
    if (r) sizeRef.current = { w: r.width, h: r.height };
    dispatch(setViewport(fitViewport(nodesRef.current, sizeRef.current, { fitAll: fitAllRef.current })));
  }, [fitRequest, dispatch]);

  // Wheel: ctrl/cmd (and trackpad pinch) zooms about the cursor; plain wheel pans.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const vp = vpRef.current;
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const k = Math.min(2, Math.max(0.2, vp.k * Math.exp(-e.deltaY * 0.01)));
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const wx = (px - vp.x) / vp.k;
        const wy = (py - vp.y) / vp.k;
        dispatch(setViewport({ k, x: px - wx * k, y: py - wy * k }));
      } else {
        dispatch(setViewport({ ...vp, x: vp.x - e.deltaX, y: vp.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [dispatch]);

  const worldPoint = useCallback((e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return screenToWorld(e.clientX, e.clientY, rect, vpRef.current);
  }, []);

  // ---- pointer interactions -------------------------------------------------
  const onBackgroundDown = (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    dispatch(select(null));
    dragRef.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: vpRef.current.x, vy: vpRef.current.y };
    svgRef.current.setPointerCapture(e.pointerId);
  };

  const onNodeDown = useCallback((e, node) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    dispatch(select({ type: 'node', id: node.id }));
    dragRef.current = { type: 'node', id: node.id, start: worldPoint(e), ox: node.x, oy: node.y, moved: false };
    svgRef.current.setPointerCapture(e.pointerId);
  }, [dispatch, worldPoint]);

  const onPortDown = useCallback((e, node, port) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    dragRef.current = { type: 'connect', fromId: node.id, port };
    setConnecting({ fromId: node.id, port, pos: worldPoint(e) });
    svgRef.current.setPointerCapture(e.pointerId);
  }, [worldPoint]);

  const onBreakpoint = useCallback((id) => dispatch(toggleBreakpoint(id)), [dispatch]);

  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.type === 'pan') {
      dispatch(setViewport({ ...vpRef.current, x: d.vx + (e.clientX - d.sx), y: d.vy + (e.clientY - d.sy) }));
    } else if (d.type === 'node') {
      const p = worldPoint(e);
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      if (!d.moved) {
        if (Math.hypot(dx, dy) * vpRef.current.k < 3) return;
        d.moved = true;
        dispatch(beginMove()); // one undo step for the whole drag
      }
      dispatch(moveNode({ id: d.id, x: snap(d.ox + dx), y: snap(d.oy + dy) }));
    } else if (d.type === 'connect') {
      const p = worldPoint(e);
      setConnecting((c) => (c ? { ...c, pos: p } : c));
      setHoverTarget(nodeAt(nodesRef.current, p, d.fromId)?.id || null);
    }
  };

  const finishConnect = (p, d) => {
    const target = nodeAt(nodesRef.current, p, d.fromId);
    if (!target) return;
    const wf = { nodes: nodesRef.current, edges };
    const source = nodesRef.current.find((n) => n.id === d.fromId);
    if (NODE_TYPES[target.type].inputs.length === 0) {
      dispatch(showToast('A Trigger starts the workflow, so it cannot receive connections.', 'error'));
      return;
    }
    if (wouldCreateCycle(wf, d.fromId, target.id)) {
      dispatch(showToast(`Not connected: "${nodeTitle(target)}" already leads back to "${nodeTitle(source)}", so this would create a cycle.`, 'error'));
      return;
    }
    if (edges.some((x) => x.source === d.fromId && x.target === target.id && (x.sourcePort || 'out') === d.port)) {
      dispatch(showToast('Those nodes are already connected.', 'info'));
      return;
    }
    dispatch(addEdge({ source: d.fromId, sourcePort: d.port, target: target.id }));
  };

  const onUp = (e) => {
    const d = dragRef.current;
    if (d?.type === 'connect') finishConnect(worldPoint(e), d);
    dragRef.current = null;
    setConnecting(null);
    setHoverTarget(null);
    try { svgRef.current.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
  };

  const onDrop = (e) => {
    const type = e.dataTransfer.getData('application/x-flowforge-node');
    if (!type || !NODE_TYPES[type]) return;
    e.preventDefault();
    const p = worldPoint(e);
    dispatch(addNode({ type, x: snap(p.x - NODE_W / 2), y: snap(p.y - 34) }));
  };

  // ---- render ----------------------------------------------------------------
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const liveNodes = runView?.view.nodes || {};
  const edgeState = runView?.edges || {};
  const connectFrom = connecting ? byId.get(connecting.fromId) : null;

  return (
    <div className="canvas-wrap">
      <svg
        ref={svgRef}
        className="canvas"
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDrop={onDrop}
      >
        <defs>
          <pattern id="grid" width={24} height={24} patternUnits="userSpaceOnUse"
            patternTransform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.k})`}>
            <circle cx={1.5} cy={1.5} r={1.2} className="grid-dot" />
          </pattern>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 1 9 5 0 9z" className="arrow-head" />
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.k})`}>
          <g className="edges">
            {edges.map((e) => {
              const s = byId.get(e.source);
              const t = byId.get(e.target);
              if (!s || !t) return null;
              const a = outputPort(s, e.sourcePort);
              const b = inputPort(t);
              const d = bezier(a, b);
              const isSel = selected?.type === 'edge' && selected.id === e.id;
              const st = edgeState[e.id] || 'idle';
              const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
              return (
                <g key={e.id}>
                  <path d={d} className={`edge edge-${st} ${isSel ? 'is-selected' : ''}`} markerEnd="url(#arrow)" />
                  <path d={d} className="edge-hit"
                    onPointerDown={(ev) => { ev.stopPropagation(); dispatch(select({ type: 'edge', id: e.id })); }} />
                  {isSel && (
                    <g className="edge-delete" transform={`translate(${mid.x} ${mid.y})`}
                      onPointerDown={(ev) => { ev.stopPropagation(); dispatch(removeSelected()); }}>
                      <circle r={11} />
                      <Icon name="x" size={12} x={-6} y={-6} color="#fff" strokeWidth={2.4} />
                      <title>Delete connection</title>
                    </g>
                  )}
                </g>
              );
            })}
            {connecting && connectFrom && (
              <path d={bezier(outputPort(connectFrom, connecting.port), connecting.pos)} className="edge edge-draft" />
            )}
          </g>

          <g className="nodes">
            {nodes.map((n) => (
              <NodeView
                key={n.id}
                node={n}
                selected={selected?.type === 'node' && selected.id === n.id}
                info={liveNodes[n.id]}
                issue={issues[n.id]}
                breakpoint={breakpoints.includes(n.id)}
                connectHover={hoverTarget === n.id}
                onNodeDown={onNodeDown}
                onPortDown={onPortDown}
                onBreakpoint={onBreakpoint}
              />
            ))}
          </g>
        </g>
      </svg>

      {nodes.length === 0 && (
        <div className="canvas-empty">
          <Icon name="plus" size={28} />
          <p>Drag a node from the library, or click one to add it.</p>
        </div>
      )}

      {runView && (
        <div className={`run-chip run-${runView.view.status}`}>
          <span className="run-chip-dot" />
          <span>
            {runView.following ? 'Run' : 'Replay'} · {runView.view.status}
            {!runView.following && ` · step ${runView.view.position}/${runView.view.total}`}
          </span>
          <button type="button" onClick={() => dispatch(clearActiveRun())}>Clear</button>
        </div>
      )}

      <div className="zoom-controls">
        <button type="button" title="Zoom in" onClick={() => dispatch(setViewport({ ...viewport, k: Math.min(2, viewport.k * 1.2) }))}><Icon name="plus" size={16} /></button>
        <button type="button" title="Zoom out" onClick={() => dispatch(setViewport({ ...viewport, k: Math.max(0.2, viewport.k / 1.2) }))}>
          <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none"><path d="M5 12h14" /></svg>
        </button>
        <button type="button" title="Fit to screen" onClick={() => dispatch(requestFit(true))}><Icon name="fit" size={16} /></button>
      </div>
    </div>
  );
}
