"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useIgniteMembers, useProjectMutations } from "./hooks";
import type { IgniteProject } from "./types";

// Create a project (name, details, who's creating it) or rename/re-describe one
export function ProjectForm({ project, onDone }: { project?: IgniteProject | null; onDone: (p?: IgniteProject) => void }) {
  const { data: members = [] } = useIgniteMembers();
  const { create, update } = useProjectMutations();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [actorId, setActorId] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const saving = create.isPending || update.isPending;
  const actor = members.find((m) => m.id === actorId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || (!project && !actor)) {
      setShowErrors(true);
      return;
    }
    try {
      const saved = project
        ? await update.mutateAsync({ id: project.id, data: { name, description: description.trim() || null } })
        : await create.mutateAsync({ name, description: description.trim() || null, actor: actor!.name });
      onDone(saved);
    } catch {
      // toast shown by onError
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{project ? "Edit project" : "New project or workshop"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="project-name">Name</Label>
        <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Intro to LLMs workshop" autoFocus={!project} />
        {showErrors && !name.trim() && <p className="text-xs text-red-600">Add a name</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="project-desc">Details <span className="font-normal text-gray-400">(optional)</span></Label>
        <Textarea id="project-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} placeholder="Date, venue, goals…" />
      </div>
      {!project && (
        <div className="space-y-1.5">
          <Label>Created by</Label>
          <Select value={actorId} onValueChange={setActorId}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select your name" /></SelectTrigger>
            <SelectContent>
              {members.filter((m) => m.is_active).map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showErrors && !actor && <p className="text-xs text-red-600">Pick who is creating this</p>}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => onDone()}>Cancel</Button>
        <Button type="submit" disabled={saving} className="bg-gray-900 text-white hover:bg-gray-800">
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {project ? "Save" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
