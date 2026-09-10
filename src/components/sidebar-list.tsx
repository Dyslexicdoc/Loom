"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Plus, Trash2, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SidebarItem {
  id: string;
  title: string;
}

/**
 * The pick-one-of-many rail that Diagrams, Code Lab, and Slides share: a new
 * button, the list, and inline rename/delete. The three arrived together and
 * behave identically, so they read from one component rather than three copies.
 */
export function SidebarList({
  items,
  activeId,
  icon: Icon,
  emptyLabel,
  newLabel,
  onNew,
  onRename,
  onDelete,
  hrefFor,
  baseHref,
}: {
  items: SidebarItem[];
  activeId?: string;
  icon: LucideIcon;
  emptyLabel: string;
  newLabel: string;
  /** Omit to make "New" navigate to `baseHref` (the create form) instead. */
  onNew?: () => Promise<{ id: string }>;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  hrefFor: (id: string) => string;
  baseHref: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const editValue = useRef("");

  function handleNew() {
    if (!onNew) {
      router.push(baseHref);
      return;
    }
    startTransition(async () => {
      const { id } = await onNew();
      router.push(hrefFor(id));
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await onDelete(id);
      if (id === activeId) {
        router.push(baseHref);
      } else {
        router.refresh();
      }
    });
  }

  function commitRename(id: string) {
    const next = editValue.current.trim();
    setEditingId(null);
    if (next) {
      startTransition(async () => {
        await onRename(id, next);
        router.refresh();
      });
    }
  }

  return (
    <div className="bg-sidebar/40 flex h-full w-64 shrink-0 flex-col border-r">
      <div className="p-2">
        <Button onClick={handleNew} disabled={isPending} className="w-full justify-start gap-2">
          <Plus className="size-4" />
          {newLabel}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {items.length === 0 ? (
          <p className="text-muted-foreground px-3 py-6 text-center text-xs">{emptyLabel}</p>
        ) : (
          <ul className="space-y-0.5">
            {items.map((item) => {
              if (editingId === item.id) {
                return (
                  <li key={item.id}>
                    <Input
                      autoFocus
                      defaultValue={item.title}
                      onChange={(e) => (editValue.current = e.target.value)}
                      onBlur={() => commitRename(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(item.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="h-8 text-sm"
                    />
                  </li>
                );
              }
              const active = item.id === activeId;
              return (
                <li key={item.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => router.push(hrefFor(item.id))}
                    className={cn(
                      "flex w-full items-center gap-2 truncate rounded-md py-2 pr-8 pl-3 text-left text-sm transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="size-3.5 shrink-0 opacity-70" />
                    <span className="truncate">{item.title}</span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label="Item actions"
                      className="hover:bg-accent text-muted-foreground absolute top-1.5 right-1 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 data-[popup-open]:opacity-100"
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          editValue.current = item.title;
                          setEditingId(item.id);
                        }}
                      >
                        <Pencil className="size-4" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
