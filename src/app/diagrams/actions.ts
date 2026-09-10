"use server";

import { revalidatePath } from "next/cache";

import {
  createDiagram,
  deleteDiagram,
  generateDiagramSource,
  getDiagram,
  regenerateDiagram,
  renameDiagram,
  saveDiagramSource,
} from "@/lib/diagrams";
import { hasContent, parseDiagram } from "@/lib/diagram";

const STARTER = `flowchart TD
  A([Start]) --> B{"Does it work?"}
  B -->|Yes| C[Ship it]
  B -->|No| D[Fix it]
  D --> B
  C --> E([Done])`;

/** A diagram's first node label is a better title than the whole prompt. */
function titleFrom(source: string, fallback: string): string {
  const { spec } = parseDiagram(source);
  const label = spec.nodes.find((n) => n.label.trim())?.label;
  return label ?? fallback;
}

export async function createDiagramFromPromptAction(input: {
  prompt: string;
  title?: string;
}): Promise<{ id: string } | { error: string }> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    return { error: "Describe what the flowchart should show." };
  }
  try {
    const { source, modelId } = await generateDiagramSource(prompt);
    const row = createDiagram({
      title: input.title?.trim() || titleFrom(source, prompt),
      source,
      prompt,
      generatedBy: "model",
      model: modelId,
    });
    revalidatePath("/diagrams");
    return { id: row.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The model request failed." };
  }
}

/** Creates a diagram from Mermaid source the user already has. */
export async function createDiagramFromSourceAction(input: {
  source: string;
  title?: string;
}): Promise<{ id: string } | { error: string }> {
  const source = input.source.trim();
  if (!source) {
    return { error: "Paste some Mermaid flowchart source first." };
  }
  const { spec } = parseDiagram(source);
  if (!hasContent(spec)) {
    return { error: "That source has no flowchart nodes in it." };
  }
  const row = createDiagram({
    title: input.title?.trim() || titleFrom(source, "Untitled diagram"),
    source,
  });
  revalidatePath("/diagrams");
  return { id: row.id };
}

export async function createBlankDiagramAction(): Promise<{ id: string }> {
  const row = createDiagram({ title: "Untitled diagram", source: STARTER });
  revalidatePath("/diagrams");
  return { id: row.id };
}

export async function saveDiagramSourceAction(
  id: string,
  source: string,
): Promise<{ ok: true } | { error: string }> {
  if (!saveDiagramSource(id, source)) {
    return { error: "Diagram not found." };
  }
  revalidatePath("/diagrams");
  return { ok: true };
}

export async function regenerateDiagramAction(
  id: string,
  instructions?: string,
): Promise<{ ok: true } | { error: string }> {
  const row = getDiagram(id);
  if (!row) {
    return { error: "Diagram not found." };
  }
  const result = await regenerateDiagram(row, instructions);
  if ("error" in result) {
    return result;
  }
  revalidatePath("/diagrams");
  return { ok: true };
}

export async function renameDiagramAction(id: string, title: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) {
    return;
  }
  renameDiagram(id, trimmed);
  revalidatePath("/diagrams");
}

export async function deleteDiagramAction(id: string): Promise<void> {
  deleteDiagram(id);
  revalidatePath("/diagrams");
}
