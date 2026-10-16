"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useIgniteMembers, useIgniteProjects, useIgniteTasks, useTaskIndex } from "./hooks";
import { TaskCard } from "./TaskCard";
import { TaskDialog } from "./TaskDialog";
import { IGNITE_TEAMS, teamLabel, type TeamSlug } from "./teams";
import { isOverdue, isWaiting, PRIORITIES, STATUSES, type IgniteTask } from "./types";

const ALL = "all";

// Kanban board of tasks by status. `team` or `project` pins the board to one
// team or one project; without either it's the club-wide view with filters.
export function TaskBoard({ team, project }: { team?: TeamSlug; project?: string }) {
  const { data: tasks = [], isLoading, isError } = useIgniteTasks();
  const { data: members = [] } = useIgniteMembers();
  const { data: projects = [] } = useIgniteProjects();
  const byId = useTaskIndex(tasks);

  // How many unfinished tasks are waiting on each task
  const blockingCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      if (t.status === "done") continue;
      for (const id of t.depends_on_ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name;

  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>(ALL);
  const [assignee, setAssignee] = useState<string>(ALL);
  const [priority, setPriority] = useState<string>(ALL);
  const [projectFilter, setProjectFilter] = useState<string>(ALL);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [waitingOnly, setWaitingOnly] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; task: IgniteTask | null }>({ open: false, task: null });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (team && t.team !== team) return false;
      if (!team && teamFilter !== ALL && t.team !== teamFilter) return false;
      if (project && t.project_id !== project) return false;
      if (!project && projectFilter !== ALL && t.project_id !== projectFilter) return false;
      if (assignee !== ALL && !t.assignees.some((m) => m.id === assignee)) return false;
      if (priority !== ALL && t.priority !== priority) return false;
      if (overdueOnly && !isOverdue(t)) return false;
      if (waitingOnly && !isWaiting(t, byId)) return false;
      if (q && !`${t.title} ${t.description ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, team, teamFilter, project, projectFilter, assignee, priority, overdueOnly, waitingOnly, byId, search]);

  const activeMembers = members.filter((m) => m.is_active);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks" className="pl-8" />
        </div>
        {!team && (
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All teams</SelectItem>
              {IGNITE_TEAMS.map((t) => (
                <SelectItem key={t.slug} value={t.slug}>{teamLabel(t.slug)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!project && (
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All projects</SelectItem>
              {projects
                .filter((p) => p.status === "active")
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Anyone</SelectItem>
            {activeMembers.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any priority</SelectItem>
            {PRIORITIES.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          onClick={() => setOverdueOnly((v) => !v)}
          className={cn(
            "h-9 rounded-md border px-3 text-sm transition-colors",
            overdueOnly ? "border-red-300 bg-red-50 text-red-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
          )}
        >
          Overdue only
        </button>
        <button
          onClick={() => setWaitingOnly((v) => !v)}
          className={cn(
            "h-9 rounded-md border px-3 text-sm transition-colors",
            waitingOnly ? "border-amber-300 bg-amber-50 text-amber-800" : "border-gray-200 text-gray-600 hover:bg-gray-50"
          )}
        >
          Waiting on others
        </button>
        <Button onClick={() => setDialog({ open: true, task: null })} className="ml-auto bg-gray-900 text-white hover:bg-gray-800">
          <Plus className="mr-1 h-4 w-4" />
          New task
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : isError ? (
        <p className="py-16 text-center text-sm text-red-600">Couldn&apos;t load tasks. Refresh to try again.</p>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STATUSES.map((s) => {
            const column = visible.filter((t) => t.status === s.value);
            return (
              <section key={s.value} className="rounded-lg bg-gray-50 p-3">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <span className={cn("h-2 w-2 rounded-full", s.dot)} />
                  {s.label}
                  <span className="font-normal text-gray-400">{column.length}</span>
                </h3>
                <div className="space-y-2">
                  {column.length === 0 ? (
                    <p className="py-4 text-center text-xs text-gray-400">No tasks</p>
                  ) : (
                    column.map((t) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        byId={byId}
                        blockingCount={blockingCount.get(t.id) ?? 0}
                        projectName={project ? undefined : projectName(t.project_id)}
                        showTeam={!team}
                        onOpen={() => setDialog({ open: true, task: t })}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <TaskDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        task={dialog.task}
        defaultTeam={team ?? (teamFilter !== ALL ? (teamFilter as TeamSlug) : undefined)}
        defaultProjectId={project ?? (projectFilter !== ALL ? projectFilter : undefined)}
      />
    </div>
  );
}
