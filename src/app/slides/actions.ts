"use server";

import { revalidatePath } from "next/cache";

import {
  createDeck,
  deleteDeck,
  generateDeckSource,
  getDeck,
  regenerateDeck,
  renameDeck,
  saveDeck,
} from "@/lib/decks";
import { parseDeck, type DeckTheme } from "@/lib/deck";
import { getEditorDocument } from "@/lib/editor";

const STARTER = `# Your deck
One line that says what this is about

---

## The point
- Something true
- Something surprising
- Something to do about it

Notes: what to say here, not what is already on the slide

---

# Thanks
`;

export async function createDeckFromPromptAction(input: {
  prompt: string;
  theme: DeckTheme;
}): Promise<{ id: string } | { error: string }> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    return { error: "Describe what the deck should cover." };
  }
  try {
    const { source, deck, modelId } = await generateDeckSource(prompt);
    const row = createDeck({
      title: deck.title,
      source,
      prompt,
      theme: input.theme,
      generatedBy: "model",
      model: modelId,
    });
    revalidatePath("/slides");
    return { id: row.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The model request failed." };
  }
}

/** Turns an existing document — pasted, uploaded, or from the Editor — into a deck. */
export async function createDeckFromMarkdownAction(input: {
  markdown: string;
  theme: DeckTheme;
  sourceName?: string;
  /** Skip the model and treat the Markdown as the outline it already is. */
  literal?: boolean;
}): Promise<{ id: string } | { error: string }> {
  const markdown = input.markdown.trim();
  if (!markdown) {
    return { error: "Add some Markdown first." };
  }

  if (input.literal) {
    const deck = parseDeck(markdown);
    if (deck.slides.length === 0) {
      return { error: "That Markdown produced no slides. Separate slides with `---`." };
    }
    const row = createDeck({ title: deck.title, source: markdown, theme: input.theme });
    revalidatePath("/slides");
    return { id: row.id };
  }

  return createDeckFromPromptAction({
    prompt: `Turn this document into a deck. Keep to what it says.\n\n${markdown}`,
    theme: input.theme,
  });
}

export async function createDeckFromEditorDocAction(
  docId: string,
  theme: DeckTheme,
): Promise<{ id: string } | { error: string }> {
  const doc = getEditorDocument(docId);
  if (!doc) {
    return { error: "That Editor document no longer exists." };
  }
  if (!doc.content.trim()) {
    return { error: "That Editor document is empty." };
  }
  return createDeckFromMarkdownAction({
    markdown: doc.content,
    theme,
    sourceName: doc.title,
  });
}

export async function createBlankDeckAction(): Promise<{ id: string }> {
  const row = createDeck({ title: "Untitled deck", source: STARTER });
  revalidatePath("/slides");
  return { id: row.id };
}

export async function saveDeckAction(
  id: string,
  input: { source?: string; theme?: DeckTheme },
): Promise<{ ok: true } | { error: string }> {
  if (!saveDeck(id, input)) {
    return { error: "Deck not found." };
  }
  revalidatePath("/slides");
  return { ok: true };
}

export async function regenerateDeckAction(
  id: string,
  instructions?: string,
): Promise<{ ok: true } | { error: string }> {
  const row = getDeck(id);
  if (!row) {
    return { error: "Deck not found." };
  }
  const result = await regenerateDeck(row, instructions);
  if ("error" in result) {
    return result;
  }
  revalidatePath("/slides");
  return { ok: true };
}

export async function renameDeckAction(id: string, title: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) {
    return;
  }
  renameDeck(id, trimmed);
  revalidatePath("/slides");
}

export async function deleteDeckAction(id: string): Promise<void> {
  deleteDeck(id);
  revalidatePath("/slides");
}
