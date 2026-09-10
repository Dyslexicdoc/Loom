import { DeckCreate } from "@/components/slides/deck-create";
import { DeckList } from "@/components/slides/deck-list";
import { DeckView } from "@/components/slides/deck-view";
import { getDeck, listDecks } from "@/lib/decks";
import { listEditorDocuments } from "@/lib/editor";

export const dynamic = "force-dynamic";

export default async function SlidesPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { d } = await searchParams;
  const rows = listDecks();
  const active = d ? getDeck(d) : undefined;

  return (
    <div className="flex h-full">
      <DeckList
        items={rows.map((row) => ({ id: row.id, title: row.title }))}
        activeId={active?.id}
      />
      {active ? (
        <DeckView
          key={active.id}
          deck={{
            id: active.id,
            title: active.title,
            source: active.source,
            theme: active.theme,
            model: active.model,
            error: active.error,
          }}
        />
      ) : (
        <DeckCreate
          editorDocs={listEditorDocuments().map((doc) => ({
            id: doc.id,
            title: doc.title,
          }))}
        />
      )}
    </div>
  );
}
