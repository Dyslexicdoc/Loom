import { notFound } from "next/navigation";

import { DeckPresent } from "@/components/slides/deck-present";
import { getDeck, loadDeck } from "@/lib/decks";

export const dynamic = "force-dynamic";

/** Chromeless (see `CHROMELESS` in `components/nav.tsx`) — this is the talk. */
export default async function PresentDeckPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const { id } = await params;
  const { s } = await searchParams;
  const row = getDeck(id);
  if (!row) {
    notFound();
  }

  const deck = loadDeck(row);
  // `?s=` is 1-based, the way the slide counter reads on screen.
  const requested = Number.parseInt(s ?? "", 10);
  const startIndex = Number.isFinite(requested)
    ? Math.min(Math.max(0, requested - 1), Math.max(0, deck.slides.length - 1))
    : 0;

  return <DeckPresent deck={deck} theme={row.theme} startIndex={startIndex} />;
}
