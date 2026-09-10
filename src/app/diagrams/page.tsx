import { DiagramCreate } from "@/components/diagrams/diagram-create";
import { DiagramList } from "@/components/diagrams/diagram-list";
import { DiagramView } from "@/components/diagrams/diagram-view";
import { getDiagram, listDiagrams } from "@/lib/diagrams";

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
      <DiagramList
        items={rows.map((row) => ({ id: row.id, title: row.title }))}
        activeId={active?.id}
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
