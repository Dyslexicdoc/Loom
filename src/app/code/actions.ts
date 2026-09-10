"use server";

import { revalidatePath } from "next/cache";

import {
  createSnippet,
  deleteSnippet,
  explainSnippet,
  fixSnippet,
  generateSnippet,
  generateTests,
  getSnippet,
  renameSnippet,
  saveSnippet,
} from "@/lib/snippets";
import { STARTER_SOURCE, type CodeLanguage, type TestCase } from "@/lib/code";

export async function createSnippetFromPromptAction(input: {
  prompt: string;
  language: CodeLanguage;
  withTests: boolean;
}): Promise<{ id: string; warning?: string } | { error: string }> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    return { error: "Describe what the code should do." };
  }
  try {
    const { title, source } = await generateSnippet(prompt, input.language);

    // Tests are a bonus, not the point — a model that cannot write them still
    // gets the user their code, with a note saying why the panel is empty.
    let tests: TestCase[] = [];
    let warning: string | undefined;
    if (input.withTests && input.language === "javascript") {
      try {
        tests = await generateTests(source);
      } catch (err) {
        warning = err instanceof Error ? err.message : "Tests could not be written.";
      }
    }

    const row = createSnippet({ title, language: input.language, source, tests });
    revalidatePath("/code");
    return { id: row.id, warning };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The model request failed." };
  }
}

export async function createBlankSnippetAction(
  language: CodeLanguage = "javascript",
): Promise<{ id: string }> {
  const row = createSnippet({
    title: "Untitled snippet",
    language,
    source: STARTER_SOURCE[language],
  });
  revalidatePath("/code");
  return { id: row.id };
}

export async function saveSnippetAction(
  id: string,
  input: { source?: string; tests?: TestCase[]; language?: CodeLanguage },
): Promise<{ ok: true } | { error: string }> {
  if (!saveSnippet(id, input)) {
    return { error: "Snippet not found." };
  }
  revalidatePath("/code");
  return { ok: true };
}

export async function generateTestsAction(
  id: string,
): Promise<{ tests: TestCase[] } | { error: string }> {
  const row = getSnippet(id);
  if (!row) {
    return { error: "Snippet not found." };
  }
  if (row.language !== "javascript") {
    return { error: "Tests only apply to JavaScript snippets." };
  }
  try {
    const tests = await generateTests(row.source);
    if (tests.length === 0) {
      return { error: "The model did not return any test cases." };
    }
    saveSnippet(id, { tests });
    revalidatePath("/code");
    return { tests };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The model request failed." };
  }
}

export async function explainSnippetAction(
  id: string,
): Promise<{ notes: string } | { error: string }> {
  const row = getSnippet(id);
  if (!row) {
    return { error: "Snippet not found." };
  }
  try {
    const notes = await explainSnippet(row.source, row.language);
    saveSnippet(id, { notes });
    revalidatePath("/code");
    return { notes };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The model request failed." };
  }
}

/**
 * Asks the model to repair a snippet against the failures a run just reported.
 * The caller passes the run's own results, so the model is fixing what actually
 * happened rather than what the code looks like it should do.
 */
export async function fixSnippetAction(
  id: string,
  failures: { name: string; expression: string; expected: string; detail: string }[],
  runError?: string,
): Promise<{ source: string } | { error: string }> {
  const row = getSnippet(id);
  if (!row) {
    return { error: "Snippet not found." };
  }
  if (failures.length === 0 && !runError) {
    return { error: "Nothing is failing." };
  }
  try {
    const source = await fixSnippet(row.source, failures, runError);
    saveSnippet(id, { source });
    revalidatePath("/code");
    return { source };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The model request failed." };
  }
}

export async function renameSnippetAction(id: string, title: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) {
    return;
  }
  renameSnippet(id, trimmed);
  revalidatePath("/code");
}

export async function deleteSnippetAction(id: string): Promise<void> {
  deleteSnippet(id);
  revalidatePath("/code");
}
