import { Graph, layout } from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

// Auto-arrange nodes left-to-right so edges flow in one direction, like an
// n8n workflow. Each node must carry its rendered size in width/height.
export function autoLayout<N extends Node>(nodes: N[], edges: Edge[], opts: { rankSep?: number; nodeSep?: number } = {}): N[] {
  const g = new Graph();
  g.setGraph({ rankdir: "LR", ranksep: opts.rankSep ?? 80, nodesep: opts.nodeSep ?? 24, marginx: 16, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: n.width ?? 200, height: n.height ?? 60 });
  for (const e of edges) g.setEdge(e.source, e.target);
  layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    // dagre gives centres; React Flow wants top-left corners
    return { ...n, position: { x: p.x - (n.width ?? 200) / 2, y: p.y - (n.height ?? 60) / 2 } };
  });
}
