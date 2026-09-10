import { CodeCreate } from "@/components/code/code-create";
import { CodeList } from "@/components/code/code-list";
import { CodeView } from "@/components/code/code-view";
import { getSnippet, listSnippets } from "@/lib/snippets";
import { parseTests } from "@/lib/code";

export const dynamic = "force-dynamic";

export default async function CodePage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const { s } = await searchParams;
  const rows = listSnippets();
  const active = s ? getSnippet(s) : undefined;

  return (
    <div className="flex h-full">
      <CodeList
        items={rows.map((row) => ({ id: row.id, title: row.title }))}
        activeId={active?.id}
      />
      {active ? (
        <CodeView
          key={active.id}
          snippet={{
            id: active.id,
            title: active.title,
            language: active.language,
            source: active.source,
            tests: parseTests(active.tests),
            notes: active.notes,
          }}
        />
      ) : (
        <CodeCreate />
      )}
    </div>
  );
}
