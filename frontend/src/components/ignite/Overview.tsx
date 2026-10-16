"use client";

import Link from "next/link";
import { useIgniteTasks, useTaskIndex } from "./hooks";
import { ProgressBar } from "./ProgressBar";
import { TaskBoard } from "./TaskBoard";
import { IGNITE_TEAMS, teamLabel } from "./teams";
import { isOverdue, isWaiting, type IgniteTask } from "./types";

function summarize(tasks: IgniteTask[]) {
  const done = tasks.filter((t) => t.status === "done").length;
  return {
    total: tasks.length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
    overdue: tasks.filter(isOverdue).length,
    done,
    // average of each task's own progress bar
    completion: tasks.length ? Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length) : 0,
  };
}

export function Overview() {
  const { data: tasks = [] } = useIgniteTasks();
  const byId = useTaskIndex(tasks);
  const all = summarize(tasks);
  const waiting = tasks.filter((t) => isWaiting(t, byId)).length;

  const tiles = [
    { label: "Open tasks", value: all.total - all.done },
    { label: "In progress", value: all.inProgress },
    { label: "Blocked", value: all.blocked, alert: all.blocked > 0 },
    { label: "Waiting on others", value: waiting, alert: waiting > 0 },
    { label: "Overdue", value: all.overdue, alert: all.overdue > 0 },
    { label: "Finished", value: all.done },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Club overview</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{t.label}</p>
            <p className={t.alert ? "mt-1 text-2xl font-semibold text-red-600" : "mt-1 text-2xl font-semibold text-gray-900"}>
              {t.value}
            </p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-lg font-semibold text-gray-900">Teams</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {IGNITE_TEAMS.map((team) => {
          const s = summarize(tasks.filter((t) => t.team === team.slug));
          const Icon = team.icon;
          return (
            <Link key={team.slug} href={team.href} className="rounded-lg border border-gray-200 p-4 transition-colors hover:border-gray-400">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-gray-600" />
                <p className="font-medium text-gray-900">{teamLabel(team.slug)}</p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <ProgressBar value={s.completion} barClassName="bg-gray-900" />
                <span className="text-xs tabular-nums text-gray-500">{s.completion}%</span>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {s.done}/{s.total} finished
                {s.blocked > 0 && <span className="text-amber-700"> · {s.blocked} blocked</span>}
                {s.overdue > 0 && <span className="text-red-600"> · {s.overdue} overdue</span>}
              </p>
            </Link>
          );
        })}
      </div>

      <h2 className="mt-10 mb-4 text-lg font-semibold text-gray-900">All tasks</h2>
      <TaskBoard />
    </div>
  );
}
