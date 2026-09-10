import "server-only";

import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { generateText } from "ai";

import { db } from "@/db/client";
import { diagrams, type DiagramRow } from "@/db/schema";
import { getChatModel } from "./provider";
import { hasContent, parseDiagram, type DiagramSpec, type ParseWarning } from "./diagram";

const TITLE_MAX = 80;
const PROMPT_MAX = 6_000;
const SOURCE_MAX = 20_000;

export function listDiagrams(): DiagramRow[] {
  return db.select().from(diagrams).orderBy(desc(diagrams.updatedAt)).all();
}

export function getDiagram(id: string): DiagramRow | undefined {
  return db.select().from(diagrams).where(eq(diagrams.id, id)).get();
}

export function createDiagram(input: {
  title: string;
  source: string;
  prompt?: string;
  generatedBy?: "model" | "manual";
  model?: string | null;
}): DiagramRow {
  return db
    .insert(diagrams)
    .values({
      id: randomUUID(),
      title: input.title.trim().slice(0, TITLE_MAX) || "Untitled diagram",
      source: input.source.slice(0, SOURCE_MAX),
      prompt: (input.prompt ?? "").slice(0, PROMPT_MAX),
      generatedBy: input.generatedBy ?? "manual",
      model: input.model ?? null,
    })
    .returning()
    .get();
}

export function renameDiagram(id: string, title: string): DiagramRow | undefined {
  return db
    .update(diagrams)
    .set({
      title: title.trim().slice(0, TITLE_MAX) || "Untitled diagram",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(diagrams.id, id))
    .returning()
    .get();
}

export function deleteDiagram(id: string): void {
  db.delete(diagrams).where(eq(diagrams.id, id)).run();
}

export function saveDiagramSource(id: string, source: string): DiagramRow | undefined {
  return db
    .update(diagrams)
    .set({
      source: source.slice(0, SOURCE_MAX),
      generatedBy: "manual",
      error: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(diagrams.id, id))
    .returning()
    .get();
}

/** Parses a row's stored Mermaid source into a spec, with any parse warnings. */
export function loadDiagram(row: DiagramRow): {
  spec: DiagramSpec;
  warnings: ParseWarning[];
} {
  return parseDiagram(row.source);
}

// --- LLM generation ---

const SYSTEM = `You draw flowcharts as Mermaid source. Reply with ONLY a Mermaid \`flowchart\` block — no prose, no explanation, no code fences.

Start with a direction line: \`flowchart TD\` (top-down) or \`flowchart LR\` (left-right). Use LR for pipelines and sequences, TD for decision-heavy logic.

Node shapes carry meaning — pick the right one:
- \`id([Text])\` — start and end points
- \`id[Text]\` — a step or action
- \`id{Text}\` — a decision; every decision needs at least two labelled outgoing edges
- \`id[/Text/]\` — input or output
- \`id[(Text)]\` — a datastore
- \`id[[Text]]\` — a call into another process
- \`id((Text))\` — a connector or terminal state

Edges:
- \`A --> B\` a step follows another
- \`A -->|Yes| B\` a labelled branch — always label the edges out of a decision
- \`A -.-> B\` an optional, async, or error path
- \`A ==> B\` the main path, when one deserves emphasis

Group related steps with \`subgraph Name[Label]\` ... \`end\`.

Rules:
- Node ids are short and alphanumeric (A, B, C1, step2). Labels go in the brackets.
- Put multi-word labels in double quotes: \`B{"Is the token valid?"}\`.
- Keep labels under 8 words. Never put a semicolon, pipe, or unescaped quote inside a label.
- 5-20 nodes. Every node except the start must be reachable; every path must reach an end.
- Describe only what the user asked about. Do not invent steps you were not told about.`;

function extractMermaid(text: string): string {
  const fenced = /```(?:mermaid)?\s*\n([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  // Models sometimes prepend a sentence; start at the flowchart header when present.
  const header = /^\s*(?:flowchart|graph)\s+[A-Za-z]{2}/im.exec(body);
  return (header ? body.slice(header.index) : body).trim();
}

/**
 * Asks the configured LLM for Mermaid flowchart source. Throws when the model is
 * unreachable or returns something with no nodes in it, so callers can report a
 * real problem rather than persisting an empty diagram.
 */
export async function generateDiagramSource(
  prompt: string,
  existingSource?: string,
): Promise<{ source: string; modelId: string }> {
  const { model, modelId } = getChatModel();
  if (!modelId) {
    throw new Error("No model configured. Set a model in Settings.");
  }

  const base = existingSource?.trim()
    ? `Here is the current diagram:\n\n${existingSource.slice(0, SOURCE_MAX)}\n\nRevise it as follows: `
    : "Draw a flowchart for: ";
  const { text } = await generateText({
    model,
    system: SYSTEM,
    prompt: `${base}${prompt.slice(0, PROMPT_MAX)}`,
  });

  const source = extractMermaid(text);
  const { spec } = parseDiagram(source);
  if (!hasContent(spec)) {
    throw new Error("The model did not return a usable flowchart.");
  }
  return { source, modelId };
}

/**
 * Regenerates a stored diagram from `instructions` (or its original prompt).
 * A failed generation leaves the existing source untouched and records why.
 */
export async function regenerateDiagram(
  row: DiagramRow,
  instructions?: string,
): Promise<{ ok: true } | { error: string }> {
  const prompt = instructions?.trim() || row.prompt.trim();
  if (!prompt) {
    return { error: "Describe what the diagram should show." };
  }
  try {
    const { source, modelId } = await generateDiagramSource(
      prompt,
      instructions?.trim() ? row.source : undefined,
    );
    db.update(diagrams)
      .set({
        source,
        prompt: prompt.slice(0, PROMPT_MAX),
        generatedBy: "model",
        model: modelId,
        error: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(diagrams.id, row.id))
      .run();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "The model request failed.";
    db.update(diagrams)
      .set({ error: message, updatedAt: new Date().toISOString() })
      .where(eq(diagrams.id, row.id))
      .run();
    return { error: message };
  }
}

/** Backing function for the `createFlowchart` tool. */
export async function createFlowchartFromPrompt(
  description: string,
  title?: string,
): Promise<{ id: string; title: string; source: string } | { error: string }> {
  try {
    const { source, modelId } = await generateDiagramSource(description);
    const { spec } = parseDiagram(source);
    const row = createDiagram({
      title: title?.trim() || firstLabel(spec) || description,
      source,
      prompt: description,
      generatedBy: "model",
      model: modelId,
    });
    return { id: row.id, title: row.title, source: row.source };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to draw the flowchart.",
    };
  }
}

/** A diagram's own first node label makes a better default title than the prompt. */
function firstLabel(spec: DiagramSpec): string | undefined {
  return spec.nodes[0]?.label;
}
