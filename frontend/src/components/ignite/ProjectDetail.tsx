"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Archive, ArchiveRestore, FolderKanban, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useIgniteProjects, useIgniteTasks, useProjectMutations, useTaskIndex } from "./hooks";
import { ProjectForm } from "./ProjectForm";
import { GENERAL_PROJECT_ID, projectStats } from "./projectStats";
import { TaskBoard } from "./TaskBoard";

export function ProjectDetail({ projectId }: { projectId: string }) {
  const { data: projects = [], isLoading } = useIgniteProjects();
  const { data: tasks = [] } = useIgniteTasks();
  const byId = useTaskIndex(tasks);
  const { update } = useProjectMutations();
  const [editing, setEditing] = useState(false);

  const project = projects.find((p) => p.id === projectId);
  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  }
  if (!project) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center text-sm text-gray-500">
        Project not found. <Link href="/ignite/projects" className="underline">Back to projects</Link>
      </div>
    );
  }

  const s = projectStats(tasks.filter((t) => t.project_id === project.id), byId);
  const archived = project.status === "archived";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Link href="/ignite/projects" className="mb-4 inline-flex items-center gap-1.5 py-1 pr-2 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" />
        Projects
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
            <FolderKanban className="h-5 w-5 text-gray-700" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">
              {project.name}
              {archived && <span className="ml-2 align-middle text-sm font-normal text-gray-400">Archived</span>}
            </h1>
            {project.description && <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{project.description}</p>}
            <p className="mt-1 text-xs text-gray-500">
              {s.done}/{s.total} finished · {s.completion}% complete
              {s.waiting > 0 && <span className="text-amber-700"> · {s.waiting} waiting on others</span>}
              {project.created_by && <> · Created by {project.created_by}</>}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="mr-1 h-4 w-4" />
            Edit
          </Button>
          {project.id !== GENERAL_PROJECT_ID && (
            <Button
              variant="outline"
              size="sm"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: project.id, data: { status: archived ? "active" : "archived" } })}
            >
              {archived ? <ArchiveRestore className="mr-1 h-4 w-4" /> : <Archive className="mr-1 h-4 w-4" />}
              {archived ? "Reopen" : "Archive"}
            </Button>
          )}
        </div>
      </div>
      {archived && (
        <p className="mt-4 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
          This project is archived: its tasks can still be updated, but no new tasks can be added.
        </p>
      )}

      <div className="mt-6">
        <TaskBoard project={project.id} />
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md">
          {editing && <ProjectForm project={project} onDone={() => setEditing(false)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
