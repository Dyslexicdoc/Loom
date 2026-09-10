import "server-only";

import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { generateText } from "ai";
import { z } from "zod";

import { db } from "@/db/client";
import { codeSnippets, type CodeSnippetRow } from "@/db/schema";
import { getChatModel } from "./provider";
import { generateJson, sliceCode } from "./structured";
import { cryptoId, LANGUAGE_LABELS, type CodeLanguage, type TestCase } from "./code";

const TITLE_MAX = 80;
const SOURCE_MAX = 40_000;
const PROMPT_MAX = 4_000;
const MAX_TESTS = 12;

export function listSnippets(): CodeSnippetRow[] {
  return db.select().from(codeSnippets).orderBy(desc(codeSnippets.updatedAt)).all();
}

export function getSnippet(id: string): CodeSnippetRow | undefined {
  return db.select().from(codeSnippets).where(eq(codeSnippets.id, id)).get();
}

export function createSnippet(input: {
  title: string;
  language: CodeLanguage;
  source: string;
  tests?: TestCase[];
}): CodeSnippetRow {
  return db
    .insert(codeSnippets)
    .values({
      id: randomUUID(),
      title: input.title.trim().slice(0, TITLE_MAX) || "Untitled snippet",
      language: input.language,
      source: input.source.slice(0, SOURCE_MAX),
      tests: JSON.stringify(input.tests ?? []),
    })
    .returning()
    .get();
}

export function renameSnippet(id: string, title: string): void {
  db.update(codeSnippets)
    .set({
      title: title.trim().slice(0, TITLE_MAX) || "Untitled snippet",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(codeSnippets.id, id))
    .run();
}

export function deleteSnippet(id: string): void {
  db.delete(codeSnippets).where(eq(codeSnippets.id, id)).run();
}

export function saveSnippet(
  id: string,
  input: {
    source?: string;
    tests?: TestCase[];
    language?: CodeLanguage;
    notes?: string | null;
  },
): CodeSnippetRow | undefined {
  return db
    .update(codeSnippets)
    .set({
      ...(input.source !== undefined
        ? { source: input.source.slice(0, SOURCE_MAX) }
        : {}),
      ...(input.tests !== undefined
        ? { tests: JSON.stringify(input.tests.slice(0, MAX_TESTS)) }
        : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(codeSnippets.id, id))
    .returning()
    .get();
}

// --- LLM ---

function model() {
  const { model: resolved, modelId } = getChatModel();
  if (!modelId) {
    throw new Error("No model configured. Set a model in Settings.");
  }
  return resolved;
}

const RUNTIME_RULES = `The code runs in a browser Web Worker: there is no DOM, no file system, and no npm packages. Use only standard JavaScript built-ins. Top-level \`await\` is allowed. Print with \`console.log\`.`;

const HTML_RULES = `The code is a fragment dropped inside a <body>: write markup, plus <style> and <script> tags as needed. No external files, no CDN links — everything inline.`;

/** Writes a new snippet from a description. */
export async function generateSnippet(
  prompt: string,
  language: CodeLanguage,
): Promise<{ title: string; source: string }> {
  const rules = language === "html" ? HTML_RULES : RUNTIME_RULES;
  const { text } = await generateText({
    model: model(),
    system:
      `You write small, self-contained ${LANGUAGE_LABELS[language]} snippets. ${rules}\n\n` +
      "Reply with ONLY the code — no prose, no explanation, no code fences. Keep it short and " +
      "readable, name things clearly, and add a comment only where the reason is not obvious. " +
      "Declare functions at the top level so tests can call them.",
    prompt: prompt.slice(0, PROMPT_MAX),
  });

  const source = sliceCode(text);
  if (!source) {
    throw new Error("The model did not return any code.");
  }
  return { title: titleFrom(prompt), source };
}

const testsZ = z.object({
  tests: z.array(
    z.object({
      name: z.string(),
      expression: z.string(),
      expected: z.string(),
    }),
  ),
});

/**
 * Writes assertions for a snippet. Each is a pair of JavaScript expressions
 * evaluated in the snippet's own scope — see `code-runner.ts`.
 */
export async function generateTests(source: string): Promise<TestCase[]> {
  const result = await generateJson({
    model: model(),
    schema: testsZ,
    system:
      "You write test cases for a JavaScript snippet. Respond with " +
      '{"tests": [{"name": string, "expression": string, "expected": string}]}.\n\n' +
      "Both `expression` and `expected` are JavaScript expressions, evaluated in the snippet's " +
      "own scope right after it runs — so they can call any function it declares.\n\n" +
      "Rules:\n" +
      "- `expression` calls the code under test, e.g. \"slugify('Hello World')\".\n" +
      '- `expected` is the literal value it should produce, e.g. "\'hello-world\'" or "[1, 2]".\n' +
      '- Wrap a bare object literal in parentheses: "({ ok: true })".\n' +
      "- `name` says what the case proves, in a few words.\n" +
      "- 3-6 cases. Cover the ordinary path first, then the edges that actually matter " +
      "(empty input, boundaries). Never assert something the code does not do.",
    prompt: `SNIPPET:\n"""\n${source.slice(0, SOURCE_MAX)}\n"""\n\nWrite the test cases.`,
  });

  return result.tests.slice(0, MAX_TESTS).map((test) => ({
    id: cryptoId(),
    name: test.name || test.expression,
    expression: test.expression,
    expected: test.expected,
  }));
}

/** Explains what a snippet does, as Markdown, for the Walkthrough panel. */
export async function explainSnippet(
  source: string,
  language: CodeLanguage,
): Promise<string> {
  const { text } = await generateText({
    model: model(),
    system:
      "You explain code to someone about to present it. Write short Markdown: one sentence on " +
      "what it does, then a bulleted walkthrough of the interesting parts in the order they " +
      "run, then one line on what would break it. Reference real identifiers from the code. " +
      "No preamble, no restating the question, under 200 words.",
    prompt: `${LANGUAGE_LABELS[language]}:\n"""\n${source.slice(0, SOURCE_MAX)}\n"""`,
  });
  return text.trim();
}

/** Rewrites a snippet to fix the failures reported by a run. */
export async function fixSnippet(
  source: string,
  failures: { name: string; expression: string; expected: string; detail: string }[],
  runError?: string,
): Promise<string> {
  const report = failures
    .map(
      (f) => `- ${f.name}: \`${f.expression}\` should be \`${f.expected}\` — ${f.detail}`,
    )
    .join("\n");
  const { text } = await generateText({
    model: model(),
    system:
      `You fix a failing JavaScript snippet. ${RUNTIME_RULES}\n\n` +
      "Reply with ONLY the corrected code — the whole snippet, no prose, no code fences. " +
      "Change as little as possible: fix the cause of the failures and nothing else. " +
      "Never change a test to match the code; the tests define what is correct.",
    prompt:
      `SNIPPET:\n"""\n${source.slice(0, SOURCE_MAX)}\n"""\n\n` +
      (runError ? `The run failed with: ${runError}\n\n` : "") +
      (report ? `Failing tests:\n${report}\n\n` : "") +
      "Return the corrected snippet.",
  });

  const fixed = sliceCode(text);
  if (!fixed) {
    throw new Error("The model did not return any code.");
  }
  return fixed;
}

function titleFrom(prompt: string): string {
  const line = prompt.trim().split("\n")[0];
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line;
}
