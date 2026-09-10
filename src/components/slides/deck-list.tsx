"use client";

import { Presentation } from "lucide-react";

import { SidebarList, type SidebarItem } from "@/components/sidebar-list";
import { deleteDeckAction, renameDeckAction } from "@/app/slides/actions";

/** Binds the shared rail to the Slides route — see `DiagramList` for why. */
export function DeckList({
  items,
  activeId,
}: {
  items: SidebarItem[];
  activeId?: string;
}) {
  return (
    <SidebarList
      items={items}
      activeId={activeId}
      icon={Presentation}
      newLabel="New deck"
      emptyLabel="No decks yet."
      baseHref="/slides"
      hrefFor={(id) => `/slides?d=${id}`}
      onRename={renameDeckAction}
      onDelete={deleteDeckAction}
    />
  );
}
