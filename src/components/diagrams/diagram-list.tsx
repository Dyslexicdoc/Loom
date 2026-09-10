"use client";

import { GitBranch } from "lucide-react";

import { SidebarList, type SidebarItem } from "@/components/sidebar-list";
import { deleteDiagramAction, renameDiagramAction } from "@/app/diagrams/actions";

/**
 * Binds the shared rail to the Diagrams route. The wrapper exists because an
 * icon component and an href builder cannot cross the server/client boundary as
 * props — only the server actions can.
 */
export function DiagramList({ items, activeId }: { items: SidebarItem[]; activeId?: string }) {
  return (
    <SidebarList
      items={items}
      activeId={activeId}
      icon={GitBranch}
      newLabel="New diagram"
      emptyLabel="No diagrams yet."
      baseHref="/diagrams"
      hrefFor={(id) => `/diagrams?d=${id}`}
      onRename={renameDiagramAction}
      onDelete={deleteDiagramAction}
    />
  );
}
