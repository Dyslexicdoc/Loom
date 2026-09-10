import { notFound } from "next/navigation";

import { CodePresent } from "@/components/code/code-present";
import { getSnippet } from "@/lib/snippets";
import { parseTests } from "@/lib/code";

export const dynamic = "force-dynamic";

/** Chromeless (see `CHROMELESS` in `components/nav.tsx`) — this is the demo view. */
export default async function CodePresentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const snippet = getSnippet(id);
  if (!snippet) {
    notFound();
  }

  return (
    <CodePresent
      title={snippet.title}
      language={snippet.language}
      source={snippet.source}
      tests={parseTests(snippet.tests)}
      notes={snippet.notes}
    />
  );
}
