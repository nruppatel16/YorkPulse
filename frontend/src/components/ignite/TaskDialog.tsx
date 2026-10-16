"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AssigneePicker } from "./AssigneePicker";
import { useIgniteMembers, useIgniteProjects, useIgniteTasks, useTaskMutations } from "./hooks";
import { ProgressBar } from "./ProgressBar";
import { IGNITE_TEAMS, teamLabel, type TeamSlug } from "./teams";
import { WaitingOnPicker } from "./WaitingOnPicker";
import { PRIORITIES, STATUSES, statusMeta, type IgniteTask, type TaskPriority, type TaskStatus } from "./types";

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: IgniteTask | null; // edit mode when set
  defaultTeam?: TeamSlug;
  defaultProjectId?: string;
}

export function TaskDialog(props: TaskDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        // editing: don't auto-select the title, it's easy to type over by accident
        onOpenAutoFocus={(e) => props.task && e.preventDefault()}
      >
        {/* keyed so the form resets whenever a different task is opened */}
        {props.open && <TaskForm key={props.task?.id ?? "new"} {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function TaskForm({ onOpenChange, task, defaultTeam, defaultProjectId }: TaskDialogProps) {
  const { data: members = [] } = useIgniteMembers();
  const { data: projects = [] } = useIgniteProjects();
  const { data: allTasks = [] } = useIgniteTasks();
  const { create, update, remove } = useTaskMutations();

  const [title, setTitle] = useState(task?.title ?? "");
  const [projectId, setProjectId] = useState(task?.project_id ?? defaultProjectId ?? "");
  const [dependsOnIds, setDependsOnIds] = useState<string[]>(task?.depends_on_ids ?? []);
  const [description, setDescription] = useState(task?.description ?? "");
  const [team, setTeam] = useState<TeamSlug>(task?.team ?? defaultTeam ?? "marketing");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "not_started");
  const [progress, setProgress] = useState(task?.progress ?? 0);
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task?.assignees.map((m) => m.id) ?? []);
  const [actorId, setActorId] = useState(""); // "Created by" on new tasks, "Updated by" on edits
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const saving = create.isPending || update.isPending;

  // Mirror the server's rules so the form never shows a contradictory state
  const changeStatus = (s: TaskStatus) => {
    setStatus(s);
    if (s === "done") setProgress(100);
    else if (s === "not_started") setProgress(0);
    else if (progress === 100) setProgress(90);
  };
  const changeProgress = (p: number) => {
    setProgress(p);
    if (p === 100) setStatus("done");
    else if (status === "done" || (status === "not_started" && p > 0)) setStatus("in_progress");
  };

  // Active members, plus anyone inactive who is still on this task
  const selectable = members.filter((m) => m.is_active || assigneeIds.includes(m.id));

  const actor = members.find((m) => m.id === actorId);

  // Every field is required (the backend enforces this too)
  const errors: Partial<Record<"title" | "project" | "description" | "dueDate" | "assignees" | "actor", string>> = {};
  if (!title.trim()) errors.title = "Add a title";
  if (!projectId) errors.project = "Pick a project";
  if (!description.trim()) errors.description = "Add some details";
  if (!dueDate) errors.dueDate = "Pick a due date";
  if (assigneeIds.length === 0) errors.assignees = "Assign at least one person";
  if (!actor) errors.actor = task ? "Pick your name" : "Pick who is creating this";
  const err = (k: keyof typeof errors) =>
    showErrors && errors[k] ? <p className="text-xs text-red-600">{errors[k]}</p> : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(errors).length > 0 || !actor) {
      setShowErrors(true);
      return;
    }
    const data = {
      title,
      project_id: projectId,
      depends_on_ids: dependsOnIds,
      description,
      team,
      status,
      progress,
      priority,
      due_date: dueDate,
      assignee_ids: assigneeIds,
      actor: actor.name,
    };
    try {
      if (task) await update.mutateAsync({ id: task.id, data });
      else await create.mutateAsync(data);
      onOpenChange(false);
    } catch {
      // the mutation's onError already shows a toast; keep the form open
    }
  };

  const onDelete = async () => {
    if (!task) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await remove.mutateAsync(task.id);
      onOpenChange(false);
    } catch {
      // toast shown by onError
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-1.5">
        <Label htmlFor="task-title">Title</Label>
        <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus={!task} />
        {err("title")}
      </div>

      <div className="space-y-1.5">
        <Label>Project / workshop</Label>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Select a project" /></SelectTrigger>
          <SelectContent>
            {projects
              // archived projects take no new tasks, but a task already in one keeps it
              .filter((p) => p.status === "active" || p.id === task?.project_id)
              .map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
          </SelectContent>
        </Select>
        {err("project")}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="task-desc">Details</Label>
        <Textarea id="task-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={5000} />
        {err("description")}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Team</Label>
          <Select value={team} onValueChange={(v) => setTeam(v as TeamSlug)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {IGNITE_TEAMS.map((t) => (
                <SelectItem key={t.slug} value={t.slug}>{teamLabel(t.slug)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => changeStatus(v as TaskStatus)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="task-due">Due date</Label>
          <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          {err("dueDate")}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="task-progress">Progress</Label>
          <span className="text-sm tabular-nums text-gray-600">{progress}%</span>
        </div>
        <ProgressBar value={progress} barClassName={statusMeta(status).bar} className="h-2" />
        <input
          id="task-progress"
          type="range"
          min={0}
          max={100}
          step={5}
          value={progress}
          onChange={(e) => changeProgress(Number(e.target.value))}
          className="w-full accent-gray-900"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Assigned to</Label>
        {selectable.length === 0 ? (
          <p className="text-sm text-gray-500">No members yet. Add people on the Members page.</p>
        ) : (
          <AssigneePicker members={selectable} team={team} selected={assigneeIds} onChange={setAssigneeIds} />
        )}
        {err("assignees")}
      </div>

      <div className="space-y-1.5">
        <Label>Waiting on <span className="font-normal text-gray-400">(optional)</span></Label>
        <p className="text-xs text-gray-500">Tasks, often someone else&apos;s, that need to be done before this one can finish.</p>
        <WaitingOnPicker
          tasks={allTasks}
          projects={projects}
          taskId={task?.id}
          selected={dependsOnIds}
          onChange={setDependsOnIds}
        />
      </div>

      <div className="space-y-1.5">
        <Label>{task ? "Updated by" : "Created by"}</Label>
        <Select value={actorId} onValueChange={setActorId}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Select your name" /></SelectTrigger>
          <SelectContent>
            {members
              .filter((m) => m.is_active)
              .map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
          </SelectContent>
        </Select>
        {err("actor")}
      </div>

      {task && (task.created_by || task.updated_by) && (
        <p className="text-xs text-gray-500">
          {task.created_by && <>Created by {task.created_by}. </>}
          {task.updated_by && <>Last updated by {task.updated_by}.</>}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 pt-2">
        {task ? (
          <Button type="button" variant="ghost" onClick={onDelete} disabled={remove.isPending} className="text-red-600 hover:text-red-700">
            <Trash2 className="mr-1.5 h-4 w-4" />
            {confirmDelete ? "Click again to delete" : "Delete"}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving} className="bg-gray-900 text-white hover:bg-gray-800">
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {task ? "Save" : "Create task"}
          </Button>
        </div>
      </div>
    </form>
  );
}
