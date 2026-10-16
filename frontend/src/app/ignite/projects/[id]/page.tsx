import type { Metadata } from "next";
import { ProjectDetail } from "@/components/ignite/ProjectDetail";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectDetail projectId={id} />;
}
