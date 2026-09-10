"use client";

import { Braces } from "lucide-react";

import { SidebarList, type SidebarItem } from "@/components/sidebar-list";
import { deleteSnippetAction, renameSnippetAction } from "@/app/code/actions";

/** Binds the shared rail to the Code Lab route — see `DiagramList` for why. */
export function CodeList({
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
      icon={Braces}
      newLabel="New snippet"
      emptyLabel="No snippets yet."
      baseHref="/code"
      hrefFor={(id) => `/code?s=${id}`}
      onRename={renameSnippetAction}
      onDelete={deleteSnippetAction}
    />
  );
}
