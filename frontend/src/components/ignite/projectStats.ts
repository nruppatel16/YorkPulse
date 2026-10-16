import { isOverdue, isWaiting, type IgniteTask } from "./types";

// The default bucket created by the migration; it can't be archived
export const GENERAL_PROJECT_ID = "00000000-0000-4000-8000-000000000001";

export function projectStats(tasks: IgniteTask[], byId: Map<string, IgniteTask>) {
  return {
    total: tasks.length,
    done: tasks.filter((t) => t.status === "done").length,
    waiting: tasks.filter((t) => isWaiting(t, byId)).length,
    overdue: tasks.filter(isOverdue).length,
    completion: tasks.length ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length) : 0,
  };
}
