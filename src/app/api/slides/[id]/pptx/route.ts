import { getDeck, loadDeck } from "@/lib/decks";
import { deckToPptx } from "@/lib/pptx";
import { slugify } from "@/lib/download";

/**
 * Builds the .pptx on the server, where pptxgenjs can write a node buffer. The
 * deck is rendered from its stored outline at request time, so a download is
 * always the current deck rather than a stale build.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const row = getDeck(id);
  if (!row) {
    return new Response("Deck not found.", { status: 404 });
  }

  const deck = loadDeck(row);
  if (deck.slides.length === 0) {
    return new Response("That deck has no slides yet.", { status: 422 });
  }

  try {
    const buffer = await deckToPptx(deck, row.theme);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${slugify(row.title, "deck")}.pptx"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed.";
    return new Response(`Could not build the PowerPoint file: ${message}`, {
      status: 500,
    });
  }
}
