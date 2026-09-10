import "server-only";

import { generateObject, generateText, type LanguageModel } from "ai";
import type { z } from "zod";

/**
 * Structured output with a fallback for models that lack it.
 *
 * Small local models often reject the constrained-decoding path but will happily
 * write JSON into a plain reply. Asking twice — schema first, then "just the
 * JSON" — is the difference between a feature that works on LM Studio and one
 * that only works against a frontier API.
 */
export async function generateJson<T>(input: {
  model: LanguageModel;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
}): Promise<T> {
  try {
    const { object } = await generateObject({
      model: input.model,
      schema: input.schema,
      system: input.system,
      prompt: input.prompt,
    });
    return object;
  } catch {
    const { text } = await generateText({
      model: input.model,
      system: `${input.system}\n\nReturn ONLY the JSON — no prose, no code fences.`,
      prompt: input.prompt,
    });
    return input.schema.parse(JSON.parse(sliceJson(text)));
  }
}

/** Pulls the outermost JSON object or array out of a reply that may wrap it in prose. */
export function sliceJson(text: string): string {
  const fenced = /```(?:json)?\s*\n([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1] : text).trim();

  const first = [body.indexOf("{"), body.indexOf("[")].filter((i) => i !== -1);
  if (first.length === 0) {
    throw new Error("The model did not return any JSON.");
  }
  const start = Math.min(...first);
  const closer = body[start] === "{" ? "}" : "]";
  const end = body.lastIndexOf(closer);
  if (end <= start) {
    throw new Error("The model's JSON was truncated.");
  }
  return body.slice(start, end + 1);
}

/** Pulls a fenced code block out of a reply, or returns the whole thing trimmed. */
export function sliceCode(text: string): string {
  const fenced = /```[\w-]*\s*\n([\s\S]*?)```/.exec(text);
  return (fenced ? fenced[1] : text).trim();
}
