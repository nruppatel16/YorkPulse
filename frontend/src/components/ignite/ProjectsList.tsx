"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderKanban, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BackToDashboard } from "./BackToDashboard";
import { useIgniteProjects, useIgniteTasks, useTaskIndex } from "./hooks";
import { ProgressBar } from "./ProgressBar";
import { ProjectForm } from "./ProjectForm";
import { projectStats } from "./projectStats";
import type { IgniteProject } from "./types";

export function ProjectsList() {
  const { data: projects = [], isLoading } = useIgniteProjects();
  const { data: tasks = [] } = useIgniteTasks();
  const byId = useTaskIndex(tasks);
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const active = projects.filter((p) => p.status === "active");
  const archived = projects.filter((p) => p.status === "archived");

  const card = (p: IgniteProject) => {
    const s = projectStats(tasks.filter((t) => t.project_id === p.id), byId);
    return (
      <Link key={p.id} href={`/ignite/projects/${p.id}`} className="rounded-lg border border-gray-200 p-4 transition-colors hover:border-gray-400">
        <div className="flex items-start gap-2">
          <FolderKanban className="mt-0.5 h-4 w-4 shrink-0 text-gray-600" />
          <div className="min-w-0">
            <p className="font-medium text-gray-900">{p.name}</p>
            {p.description && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{p.description}</p>}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <ProgressBar value={s.completion} barClassName="bg-gray-900" />
          <span className="text-xs tabular-nums text-gray-500">{s.completion}%</span>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {s.done}/{s.total} finished
          {s.waiting > 0 && <span className="text-amber-700"> · {s.waiting} waiting</span>}
          {s.overdue > 0 && <span className="text-red-600"> · {s.overdue} overdue</span>}
        </p>
      </Link>
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <BackToDashboard />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="mt-1 text-sm text-gray-500">Each project or workshop keeps its own tasks, across every team.</p>
        </div>
        <Button onClick={() => setCreating(true)} className="bg-gray-900 text-white hover:bg-gray-800">
          <Plus className="mr-1 h-4 w-4" />
          New project
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{active.map(card)}</div>
          {archived.length > 0 && (
            <>
              <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-gray-400">Archived</h2>
              <div className="mt-3 grid gap-3 opacity-70 sm:grid-cols-2 lg:grid-cols-3">{archived.map(card)}</div>
            </>
          )}
        </>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          {creating && (
            <ProjectForm
              onDone={(p) => {
                setCreating(false);
                if (p) router.push(`/ignite/projects/${p.id}`);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
