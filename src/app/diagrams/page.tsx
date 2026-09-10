import { Workflow } from "lucide-react";

import { SidebarList } from "@/components/sidebar-list";
import { DiagramCreate } from "@/components/diagrams/diagram-create";
import { DiagramView } from "@/components/diagrams/diagram-view";
import { getDiagram, listDiagrams } from "@/lib/diagrams";
import { deleteDiagramAction, renameDiagramAction } from "@/app/diagrams/actions";

export const dynamic = "force-dynamic";

export default async function DiagramsPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { d } = await searchParams;
  const rows = listDiagrams();
  const active = d ? getDiagram(d) : undefined;

  return (
    <div className="flex h-full">
      <SidebarList
        items={rows.map((row) => ({ id: row.id, title: row.title }))}
        activeId={active?.id}
        icon={Workflow}
        newLabel="New diagram"
        emptyLabel="No diagrams yet."
        baseHref="/diagrams"
        hrefFor={(id) => `/diagrams?d=${id}`}
        onRename={renameDiagramAction}
        onDelete={deleteDiagramAction}
      />
      {active ? (
        <DiagramView
          key={active.id}
          diagram={{
            id: active.id,
            title: active.title,
            source: active.source,
            generatedBy: active.generatedBy,
            model: active.model,
            error: active.error,
          }}
        />
      ) : (
        <DiagramCreate />
      )}
    </div>
  );
}
