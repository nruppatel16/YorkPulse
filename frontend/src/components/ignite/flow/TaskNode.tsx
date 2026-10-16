"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Hourglass, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { teamLabel } from "../teams";
import { isOverdue, statusMeta, type IgniteTask } from "../types";
import { GROUP_COLORS } from "./colors";

export const TASK_NODE_SIZE = { width: 230, height: 96 };

export type TaskNodeData = {
  task: IgniteTask;
  waiting: number; // unfinished tasks this one waits on
  blocking: number; // unfinished tasks waiting on this one
  compact?: boolean; // the team map uses a smaller card
};

export function TaskNode({ data }: NodeProps<Node<TaskNodeData>>) {
  const { task, waiting, blocking, compact } = data;
  const status = statusMeta(task.status);
  const done = task.status === "done";
  const overdue = isOverdue(task);

  return (
    <div
      className={cn(
        "flex h-full w-full cursor-pointer overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md",
        waiting > 0 ? "border-amber-400" : "border-gray-200",
        done && "opacity-60"
      )}
    >
      <div className="w-1.5 shrink-0" style={{ background: GROUP_COLORS[task.team] }} />
      <div className="min-w-0 flex-1 px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", status.dot)} />
          <p className={cn("truncate text-xs font-semibold text-gray-900", done && "line-through")}>{task.title}</p>
        </div>
        {!compact && (
          <p className="mt-0.5 truncate text-[11px] text-gray-500">
            {teamLabel(task.team)} · {task.assignees.map((m) => m.name.split(" ")[0]).join(", ") || "Unassigned"}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-1.5">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div className={cn("h-full rounded-full", status.bar)} style={{ width: `${task.progress}%` }} />
          </div>
          <span className="text-[10px] tabular-nums text-gray-500">{task.progress}%</span>
        </div>
        {!compact && (
          <div className="mt-1 flex items-center gap-2 text-[10px]">
            {waiting > 0 && (
              <span className="flex items-center gap-0.5 font-medium text-amber-700">
                <Hourglass className="h-3 w-3" />
                Waiting on {waiting}
              </span>
            )}
            {blocking > 0 && !done && (
              <span className="flex items-center gap-0.5 font-medium text-red-700">
                <Link2 className="h-3 w-3" />
                Blocking {blocking}
              </span>
            )}
            {overdue && <span className="font-medium text-red-600">Overdue</span>}
            {waiting === 0 && blocking === 0 && !overdue && <span className="text-gray-400">{status.label}</span>}
          </div>
        )}
      </div>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-gray-300 !bg-white" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-gray-300 !bg-white" />
    </div>
  );
}
