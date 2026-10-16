"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { useLogout } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { IGNITE_TEAMS, teamLabel } from "./teams";

const NAV = [
  { href: "/ignite", label: "Overview", exact: true },
  { href: "/ignite/projects", label: "Projects", exact: false },
  { href: "/ignite/workflow", label: "Workflow", exact: false },
  ...IGNITE_TEAMS.map((t) => ({ href: t.href, label: teamLabel(t.slug), exact: false })),
  { href: "/ignite/members", label: "Members", exact: false },
  { href: "/ignite/files", label: "Files", exact: false },
];

export function IgniteHeader() {
  const pathname = usePathname();
  const logout = useLogout();

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/ignite" className="text-lg font-bold text-gray-900">
          AI Ignite
        </Link>
        <div className="flex items-center gap-3">
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
      <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
                active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
