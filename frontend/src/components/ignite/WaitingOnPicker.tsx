"use client";

import { useMemo, useState } from "react";
import { Link2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { teamLabel } from "./teams";
import type { IgniteProject, IgniteTask } from "./types";

interface WaitingOnPickerProps {
  tasks: IgniteTask[];
  projects: IgniteProject[];
  taskId?: string; // the task being edited (excluded, along with anything waiting on it)
  selected: string[];
  onChange: (ids: string[]) => void;
}

// Pick the tasks this one can't finish without. Search by title or by the
// person doing it; tasks that would create a loop are never offered.
export function WaitingOnPicker({ tasks, projects, taskId, selected, onChange }: WaitingOnPickerProps) {
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "";

  // Everything that already waits on this task, directly or through others
  const dependents = useMemo(() => {
    const out = new Set<string>();
    if (!taskId) return out;
    const stack = [taskId];
    while (stack.length) {
      const current = stack.pop()!;
      for (const t of tasks) {
        if (t.depends_on_ids.includes(current) && !out.has(t.id)) {
          out.add(t.id);
          stack.push(t.id);
        }
      }
    }
    return out;
  }, [tasks, taskId]);

  const q = query.trim().toLowerCase();
  const results = q
    ? tasks
        .filter(
          (t) =>
            t.id !== taskId &&
            !dependents.has(t.id) &&
            !selected.includes(t.id) &&
            t.status !== "done" &&
            `${t.title} ${t.assignees.map((m) => m.name).join(" ")}`.toLowerCase().includes(q)
        )
        .slice(0, 6)
    : [];

  const add = (id: string) => {
    onChange([...selected, id]);
    setQuery("");
  };

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <ul className="space-y-1.5">
          {selected.map((id) => {
            const t = byId.get(id);
            if (!t) return null;
            const done = t.status === "done";
            return (
              <li key={id} className="flex items-start gap-2 rounded-md border border-gray-200 px-2.5 py-1.5 text-sm">
                <Link2 className={cn("mt-0.5 h-4 w-4 shrink-0", done ? "text-green-600" : "text-amber-600")} />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate", done ? "text-gray-400 line-through" : "text-gray-900")}>{t.title}</p>
                  <p className="truncate text-xs text-gray-500">
                    {t.assignees.map((m) => m.name).join(", ")} · {teamLabel(t.team)}
                    {done && " · finished"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onChange(selected.filter((x) => x !== id))}
                  aria-label={`Stop waiting on ${t.title}`}
                  className="text-gray-400 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a task or a person to wait on"
          className="pl-8"
          aria-label="Search tasks to wait on"
        />
      </div>
      {q && (
        <div className="overflow-hidden rounded-md border border-gray-200">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">No matching open tasks</p>
          ) : (
            results.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => add(t.id)}
                className="block w-full border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-gray-50"
              >
                <p className="truncate text-sm text-gray-900">{t.title}</p>
                <p className="truncate text-xs text-gray-500">
                  {t.assignees.map((m) => m.name).join(", ")} · {teamLabel(t.team)} · {projectName(t.project_id)}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
