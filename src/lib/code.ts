/**
 * Code Lab types, shared by the client runner and the server actions.
 *
 * Two languages, deliberately: JavaScript, which runs in a worker and can be
 * asserted against, and HTML, which renders in a sandboxed frame. Both execute
 * in the browser — nothing here ever runs code on the server.
 */

export const CODE_LANGUAGES = ["javascript", "html"] as const;

export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

export function isLanguage(value: string): value is CodeLanguage {
  return (CODE_LANGUAGES as readonly string[]).includes(value);
}

export const LANGUAGE_LABELS: Record<CodeLanguage, string> = {
  javascript: "JavaScript",
  html: "HTML page",
};

/**
 * One assertion about the snippet. `expression` is evaluated after the snippet
 * has run, in the same scope, and compared to `expected` — which is itself a
 * JavaScript expression, so tests can expect objects and arrays, not just text.
 */
export interface TestCase {
  id: string;
  name: string;
  expression: string;
  expected: string;
}

export interface TestOutcome {
  id: string;
  name: string;
  passed: boolean;
  /** The evaluated `expression`, formatted; absent when it threw. */
  actual?: string;
  expected: string;
  error?: string;
}

export type ConsoleLevel = "log" | "warn" | "error";

export interface ConsoleLine {
  level: ConsoleLevel;
  text: string;
}

export interface RunResult {
  /** Everything the snippet printed, in order. */
  console: ConsoleLine[];
  /** A thrown error or a timeout — the run did not finish. */
  error?: string;
  tests: TestOutcome[];
  durationMs: number;
}

export function parseTests(raw: string): TestCase[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      const test = item as Partial<TestCase>;
      if (typeof test.expression !== "string" || typeof test.expected !== "string") return [];
      return [
        {
          id: typeof test.id === "string" ? test.id : cryptoId(),
          name: typeof test.name === "string" && test.name ? test.name : test.expression,
          expression: test.expression,
          expected: test.expected,
        },
      ];
    });
  } catch {
    return [];
  }
}

/** `crypto.randomUUID` is available in both the browser and Node here. */
export function cryptoId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `t${Math.random().toString(36).slice(2, 10)}`;
}

export function passCount(outcomes: TestOutcome[]): number {
  return outcomes.filter((outcome) => outcome.passed).length;
}

export const STARTER_SOURCE: Record<CodeLanguage, string> = {
  javascript: `// Anything you define here is visible to the tests below.
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^\\w\\s-]+/g, "")
    .trim()
    .replace(/\\s+/g, "-");
}

console.log(slugify("Hello, World!"));
`,
  html: `<style>
  body { font-family: system-ui; display: grid; place-items: center; height: 100vh; margin: 0; }
  button { font-size: 1.1rem; padding: 0.6rem 1.2rem; cursor: pointer; }
</style>

<button id="tap">Tapped 0 times</button>

<script>
  let count = 0;
  const button = document.getElementById("tap");
  button.addEventListener("click", () => {
    count += 1;
    button.textContent = \`Tapped \${count} times\`;
  });
</script>
`,
};
