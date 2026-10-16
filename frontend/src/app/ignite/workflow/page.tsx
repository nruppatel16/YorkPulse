import type { Metadata } from "next";
import { WorkflowView } from "@/components/ignite/flow/WorkflowView";

export const metadata: Metadata = { title: "Workflow" };

export default function WorkflowPage() {
  return <WorkflowView />;
}
