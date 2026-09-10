import "server-only";

import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { generateText } from "ai";

import { db } from "@/db/client";
import { decks, type DeckRow } from "@/db/schema";
import { getChatModel } from "./provider";
import { parseDeck, type Deck, type DeckTheme } from "./deck";

const TITLE_MAX = 80;
const SOURCE_MAX = 40_000;
const PROMPT_MAX = 24_000;

export function listDecks(): DeckRow[] {
  return db.select().from(decks).orderBy(desc(decks.updatedAt)).all();
}

export function getDeck(id: string): DeckRow | undefined {
  return db.select().from(decks).where(eq(decks.id, id)).get();
}

export function createDeck(input: {
  title: string;
  source: string;
  prompt?: string;
  theme?: DeckTheme;
  generatedBy?: "model" | "manual";
  model?: string | null;
}): DeckRow {
  return db
    .insert(decks)
    .values({
      id: randomUUID(),
      title: input.title.trim().slice(0, TITLE_MAX) || "Untitled deck",
      source: input.source.slice(0, SOURCE_MAX),
      prompt: (input.prompt ?? "").slice(0, PROMPT_MAX),
      theme: input.theme ?? "neon",
      generatedBy: input.generatedBy ?? "manual",
      model: input.model ?? null,
    })
    .returning()
    .get();
}

export function renameDeck(id: string, title: string): void {
  db.update(decks)
    .set({
      title: title.trim().slice(0, TITLE_MAX) || "Untitled deck",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(decks.id, id))
    .run();
}

export function deleteDeck(id: string): void {
  db.delete(decks).where(eq(decks.id, id)).run();
}

export function saveDeck(
  id: string,
  input: { source?: string; theme?: DeckTheme },
): DeckRow | undefined {
  return db
    .update(decks)
    .set({
      ...(input.source !== undefined
        ? {
            source: input.source.slice(0, SOURCE_MAX),
            generatedBy: "manual" as const,
            error: null,
          }
        : {}),
      ...(input.theme !== undefined ? { theme: input.theme } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(decks.id, id))
    .returning()
    .get();
}

/** Parses a row's stored outline into slides. */
export function loadDeck(row: DeckRow): Deck {
  return parseDeck(row.source);
}

// --- LLM generation ---

const SYSTEM = `You write slide decks as Markdown. Reply with ONLY the Markdown — no prose around it, no code fence around the whole thing.

Slides are separated by a line containing only \`---\`. The layout of each slide comes from what it contains, so write plain Markdown and the right slide appears:

- \`# Title\` plus one line under it — the opening slide. Use this once, first.
- \`## Heading\` plus \`-\` bullets — a normal slide. 3-5 bullets, one line each.
- \`## Heading\` plus two \`### Sub\` sections, each with bullets — a two-column comparison.
- \`## Heading\` plus bullets that all look like \`**42%** — what it measures\` — a stats slide. 2-4 of them.
- A \`>\` blockquote on its own, optionally followed by \`— Attribution\` — a quote slide.
- A fenced \`\`\`mermaid block — a flowchart slide. Write \`flowchart LR\` or \`flowchart TD\`, node shapes \`A([Start])\`, \`B{Decision}\`, \`C[Step]\`, and labelled edges \`B -->|Yes| C\`.
- A fenced code block — a code slide. Tag JavaScript you want run during the talk as \`\`\`js run.
- A Markdown table — a table slide.
- \`# Heading\` alone, after the first slide — a section divider.

End any slide with \`Notes: …\` to add speaker notes: what to say, not what is already on the slide.

Rules:
- One idea per slide. Bullets are phrases, not sentences, and never wrap past one line.
- Never put a paragraph on a slide. If it needs prose, it belongs in the notes.
- Use a diagram slide when the point is a process, and a stats slide when the point is numbers.
- 6-12 slides unless asked otherwise. Open with a title slide and close with a takeaway.
- Use only facts from the material you were given. Do not invent numbers.`;

function extractMarkdown(text: string): string {
  // Models often wrap the whole deck in one fence; unwrap it, but keep the
  // inner fences that make code and diagram slides work.
  const whole = /^\s*```(?:markdown|md)?\s*\n([\s\S]*)```\s*$/i.exec(text.trim());
  return (whole ? whole[1] : text).trim();
}

/**
 * Asks the model for a deck outline. Throws when the model is unreachable or
 * returns something with no slides in it, so callers report a real problem
 * rather than persisting an empty deck.
 */
export async function generateDeckSource(
  prompt: string,
  existingSource?: string,
): Promise<{ source: string; deck: Deck; modelId: string }> {
  const { model, modelId } = getChatModel();
  if (!modelId) {
    throw new Error("No model configured. Set a model in Settings.");
  }

  const base = existingSource?.trim()
    ? `Here is the current deck:\n\n${existingSource.slice(0, SOURCE_MAX)}\n\nRevise it as follows: `
    : "Build a deck about: ";
  const { text } = await generateText({
    model,
    system: SYSTEM,
    prompt: `${base}${prompt.slice(0, PROMPT_MAX)}`,
  });

  const source = extractMarkdown(text);
  const deck = parseDeck(source);
  if (deck.slides.length === 0) {
    throw new Error("The model did not return any slides.");
  }
  return { source, deck, modelId };
}

/**
 * Regenerates a stored deck from `instructions` (or its original prompt). A
 * failed generation leaves the existing outline untouched and records why.
 */
export async function regenerateDeck(
  row: DeckRow,
  instructions?: string,
): Promise<{ ok: true } | { error: string }> {
  const prompt = instructions?.trim() || row.prompt.trim();
  if (!prompt) {
    return { error: "Describe what the deck should cover." };
  }
  try {
    const { source, modelId } = await generateDeckSource(
      prompt,
      instructions?.trim() ? row.source : undefined,
    );
    db.update(decks)
      .set({
        source,
        prompt: prompt.slice(0, PROMPT_MAX),
        generatedBy: "model",
        model: modelId,
        error: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(decks.id, row.id))
      .run();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "The model request failed.";
    db.update(decks)
      .set({ error: message, updatedAt: new Date().toISOString() })
      .where(eq(decks.id, row.id))
      .run();
    return { error: message };
  }
}

/** Backing function for the `createSlideDeck` tool. */
export async function createDeckFromPrompt(
  description: string,
  title?: string,
): Promise<{ id: string; title: string; slides: number } | { error: string }> {
  try {
    const { source, deck, modelId } = await generateDeckSource(description);
    const row = createDeck({
      title: title?.trim() || deck.title,
      source,
      prompt: description,
      generatedBy: "model",
      model: modelId,
    });
    return { id: row.id, title: row.title, slides: deck.slides.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to build the deck." };
  }
}
