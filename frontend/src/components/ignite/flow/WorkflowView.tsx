"use client";

import { useMemo, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { BackToDashboard } from "../BackToDashboard";
import { useIgniteMembers, useIgniteProjects, useIgniteTasks, useTaskIndex } from "../hooks";
import { TaskDialog } from "../TaskDialog";
import { MEMBER_GROUPS } from "../teams";
import { openBlockers, STATUSES, type IgniteTask } from "../types";
import { GROUP_COLORS } from "./colors";
import { autoLayout } from "./layout";
import { MAP_NODE_SIZE, MapNode, type MapNodeData } from "./MapNode";
import { TASK_NODE_SIZE, TaskNode, type TaskNodeData } from "./TaskNode";

const nodeTypes = { task: TaskNode, map: MapNode };
const ALL = "all";
type View = "dependencies" | "map";

export function WorkflowView() {
  const { data: tasks = [], isLoading } = useIgniteTasks();
  const { data: members = [] } = useIgniteMembers();
  const { data: projects = [] } = useIgniteProjects();
  const byId = useTaskIndex(tasks);

  const [view, setView] = useState<View>("dependencies");
  const [project, setProject] = useState<string>(ALL);
  const [hideDone, setHideDone] = useState(false);
  const [linkedOnly, setLinkedOnly] = useState(false);
  const [openTask, setOpenTask] = useState<IgniteTask | null>(null);

  const visibleTasks = useMemo(
    () => tasks.filter((t) => (project === ALL || t.project_id === project) && !(hideDone && t.status === "done")),
    [tasks, project, hideDone]
  );

  // Unfinished tasks waiting on each task
  const blocking = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      if (t.status === "done") continue;
      for (const id of t.depends_on_ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

  const taskData = (t: IgniteTask, compact = false): TaskNodeData => ({
    task: t,
    waiting: t.status === "done" ? 0 : openBlockers(t, byId).length,
    blocking: blocking.get(t.id) ?? 0,
    compact,
  });

  const graph = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    if (view === "dependencies") {
      // An arrow from a task to every task waiting on it
      const ids = new Set(visibleTasks.map((t) => t.id));
      for (const t of visibleTasks) {
        for (const dep of t.depends_on_ids) {
          if (!ids.has(dep)) continue;
          const depDone = byId.get(dep)?.status === "done";
          edges.push({
            id: `${dep}->${t.id}`,
            source: dep,
            target: t.id,
            animated: !depDone,
            style: { stroke: depDone ? "#16a34a" : "#d97706", strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: depDone ? "#16a34a" : "#d97706" },
          });
        }
      }
      const linked = new Set(edges.flatMap((e) => [e.source, e.target]));
      for (const t of visibleTasks) {
        if (linkedOnly && !linked.has(t.id)) continue;
        nodes.push({ id: t.id, type: "task", data: taskData(t), position: { x: 0, y: 0 }, ...TASK_NODE_SIZE });
      }
      return { nodes: autoLayout(nodes, edges, { rankSep: 90, nodeSep: 18 }), edges };
    }

    // Team map: AI Ignite -> teams -> people -> their tasks
    nodes.push({
      id: "root",
      type: "map",
      data: { kind: "root", label: "AI Ignite", sub: `${visibleTasks.length} tasks`, color: "#111827" } satisfies MapNodeData,
      position: { x: 0, y: 0 },
      ...MAP_NODE_SIZE.root,
    });
    const line = (color: string) => ({ stroke: color, strokeWidth: 1.5 });
    for (const g of MEMBER_GROUPS) {
      const people = members.filter((m) => m.is_active && m.teams.includes(g.slug));
      if (people.length === 0) continue;
      const color = GROUP_COLORS[g.slug];
      const teamId = `team:${g.slug}`;
      nodes.push({
        id: teamId,
        type: "map",
        data: { kind: "team", label: g.label, sub: `${people.length} people`, color } satisfies MapNodeData,
        position: { x: 0, y: 0 },
        ...MAP_NODE_SIZE.team,
      });
      edges.push({ id: `root->${teamId}`, source: "root", target: teamId, type: "smoothstep", style: line(color) });

      for (const m of people) {
        const mine = visibleTasks.filter((t) => t.assignees.some((a) => a.id === m.id));
        const open = mine.filter((t) => t.status !== "done").length;
        const personId = `${teamId}:${m.id}`;
        nodes.push({
          id: personId,
          type: "map",
          data: {
            kind: "person",
            label: m.name,
            sub: mine.length ? `${open} open · ${mine.length - open} done` : "No tasks",
            color,
          } satisfies MapNodeData,
          position: { x: 0, y: 0 },
          ...MAP_NODE_SIZE.person,
        });
        edges.push({ id: `${teamId}->${personId}`, source: teamId, target: personId, type: "smoothstep", style: line(color) });
        for (const t of mine) {
          // a task shared by several people appears under each of them
          const nodeId = `${personId}:${t.id}`;
          nodes.push({ id: nodeId, type: "task", data: taskData(t, true), position: { x: 0, y: 0 }, width: 200, height: 52 });
          edges.push({ id: `${personId}->${nodeId}`, source: personId, target: nodeId, type: "smoothstep", style: line("#d1d5db") });
        }
      }
    }
    return { nodes: autoLayout(nodes, edges, { rankSep: 70, nodeSep: 10 }), edges };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, visibleTasks, members, byId, blocking, linkedOnly]);

  const onNodeClick: NodeMouseHandler = (_, node) => {
    if (node.type === "task") setOpenTask((node.data as TaskNodeData).task);
  };

  const toggle = (on: boolean) =>
    cn("h-9 rounded-md border px-3 text-sm transition-colors", on ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50");

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <BackToDashboard />
      <h1 className="text-2xl font-bold text-gray-900">Workflow</h1>
      <p className="mt-1 text-sm text-gray-500">
        {view === "dependencies"
          ? "Every task as a node. Arrows run from a task to the tasks waiting on it: orange while it's still open, green once it's done."
          : "Who is working on what: each team, its people, and their tasks."}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-gray-200 p-0.5">
          {(["dependencies", "map"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn("rounded px-3 py-1.5 text-sm", view === v ? "bg-gray-900 text-white" : "text-gray-600")}
            >
              {v === "dependencies" ? "Dependencies" : "Team map"}
            </button>
          ))}
        </div>
        <Select value={project} onValueChange={setProject}>
          <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All projects</SelectItem>
            {projects.filter((p) => p.status === "active").map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button onClick={() => setHideDone((v) => !v)} className={toggle(hideDone)}>Hide finished</button>
        {view === "dependencies" && (
          <button onClick={() => setLinkedOnly((v) => !v)} className={toggle(linkedOnly)}>Linked tasks only</button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        {MEMBER_GROUPS.filter((g) => g.slug !== "exec").map((g) => (
          <span key={g.slug} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: GROUP_COLORS[g.slug] }} />
            {g.label}
          </span>
        ))}
        <span className="text-gray-300">|</span>
        {STATUSES.map((s) => (
          <span key={s.value} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", s.dot)} />
            {s.label}
          </span>
        ))}
      </div>

      <div className="mt-4 h-[70vh] min-h-[420px] overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
        {isLoading ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : graph.nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-gray-500">
            {view === "dependencies" && linkedOnly
              ? "No tasks are linked yet. Use “Waiting on” in a task to connect it to the tasks it needs."
              : "No tasks to show."}
          </div>
        ) : (
          <ReactFlow
            key={`${view}:${project}:${hideDone}:${linkedOnly}`}
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.1}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={18} color="#e5e7eb" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!hidden md:!block" nodeColor={(n) => (n.type === "task" ? GROUP_COLORS[(n.data as TaskNodeData).task.team] : "#9ca3af")} />
          </ReactFlow>
        )}
      </div>

      <TaskDialog open={!!openTask} onOpenChange={(o) => !o && setOpenTask(null)} task={openTask} />
    </div>
  );
}
