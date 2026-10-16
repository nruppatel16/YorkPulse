"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";

// Root, team and person bubbles of the team map (mind-map style)
export type MapNodeData = {
  kind: "root" | "team" | "person";
  label: string;
  sub?: string;
  color: string;
};

export const MAP_NODE_SIZE = {
  root: { width: 140, height: 48 },
  team: { width: 170, height: 48 },
  person: { width: 190, height: 50 },
};

export function MapNode({ data }: NodeProps<Node<MapNodeData>>) {
  const { kind, label, sub, color } = data;
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col justify-center rounded-full border px-4 shadow-sm",
        kind === "root" ? "bg-gray-900 text-white" : "bg-white text-gray-900"
      )}
      style={kind === "root" ? undefined : { borderColor: color, borderWidth: kind === "team" ? 2 : 1 }}
    >
      <p className={cn("truncate text-center", kind === "person" ? "text-xs font-medium" : "text-sm font-semibold")}>{label}</p>
      {sub && <p className={cn("truncate text-center text-[10px]", kind === "root" ? "text-gray-300" : "text-gray-500")}>{sub}</p>}
      {kind !== "root" && <Handle type="target" position={Position.Left} className="!opacity-0" />}
      <Handle type="source" position={Position.Right} className="!opacity-0" />
    </div>
  );
}
