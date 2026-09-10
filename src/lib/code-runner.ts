/**
 * Runs a JavaScript snippet and its tests in a throwaway Web Worker.
 *
 * A worker is the right sandbox here: it has no DOM, no access to the page, and
 * can be terminated mid-loop — so an infinite loop costs a timeout instead of a
 * frozen tab. Everything runs on the user's machine; nothing is sent anywhere.
 */

import type { RunResult, TestCase } from "./code";

/** How long a snippet may run before the worker is killed. */
export const RUN_TIMEOUT_MS = 5_000;

/**
 * The worker program, as source. It is assembled into a Blob at call time
 * rather than shipped as a separate chunk, which keeps the runner to one file
 * and one import.
 *
 * The snippet and its test expressions share one scope: the tests are evaluated
 * with a direct `eval` inside the same function body, so a test can reach
 * anything the snippet declared without the snippet having to export it.
 */
const WORKER_SOURCE = String.raw`
const MAX_DEPTH = 4;
const MAX_ITEMS = 50;
const MAX_TEXT = 4000;

/** Formats a value the way a console would: readable, bounded, never throwing. */
function format(value, depth) {
  depth = depth || 0;
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  const type = typeof value;
  if (type === "string") return depth === 0 ? value : JSON.stringify(value);
  if (type === "number" || type === "boolean" || type === "bigint") return String(value);
  if (type === "symbol") return value.toString();
  if (type === "function") return "[Function " + (value.name || "anonymous") + "]";
  if (value instanceof Error) return value.name + ": " + value.message;
  if (depth > MAX_DEPTH) return "…";
  if (value instanceof Map) {
    const entries = [...value.entries()].slice(0, MAX_ITEMS);
    return "Map(" + value.size + ") {" + entries.map(function (e) {
      return format(e[0], depth + 1) + " => " + format(e[1], depth + 1);
    }).join(", ") + "}";
  }
  if (value instanceof Set) {
    const items = [...value.values()].slice(0, MAX_ITEMS);
    return "Set(" + value.size + ") {" + items.map(function (v) {
      return format(v, depth + 1);
    }).join(", ") + "}";
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map(function (v) { return format(v, depth + 1); });
    if (value.length > MAX_ITEMS) items.push("… " + (value.length - MAX_ITEMS) + " more");
    return "[" + items.join(", ") + "]";
  }
  try {
    const keys = Object.keys(value).slice(0, MAX_ITEMS);
    const body = keys.map(function (k) { return k + ": " + format(value[k], depth + 1); });
    if (Object.keys(value).length > keys.length) body.push("…");
    return "{" + body.join(", ") + "}";
  } catch {
    return String(value);
  }
}

/** Structural equality — the comparison a test author expects from ===. */
function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    return [...a].every(function (v) { return [...b].some(function (w) { return deepEqual(v, w); }); });
  }
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    return [...a].every(function (e) { return b.has(e[0]) && deepEqual(e[1], b.get(e[0])); });
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(function (k) {
    return Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]);
  });
}

self.onmessage = async function (event) {
  const source = event.data.source;
  const tests = event.data.tests || [];
  const lines = [];

  const record = function (level) {
    return function () {
      const text = Array.prototype.map.call(arguments, function (arg) {
        return format(arg, 0);
      }).join(" ");
      lines.push({ level: level, text: text.slice(0, MAX_TEXT) });
    };
  };
  const shim = {
    log: record("log"),
    info: record("log"),
    debug: record("log"),
    warn: record("warn"),
    error: record("error"),
    table: record("log"),
    trace: record("log"),
  };

  // The tests run inside the snippet's own scope via direct eval, which is why
  // they can see every const and function the snippet declared.
  const body =
    "const console = __console;\n" +
    source +
    "\n;return __tests.map(function (t) {\n" +
    "  try {\n" +
    "    const actual = eval(t.expression);\n" +
    "    let expected;\n" +
    "    try { expected = eval(t.expected); } catch (err) {\n" +
    "      return { id: t.id, name: t.name, passed: false, expected: t.expected,\n" +
    "        error: 'Expected value did not evaluate: ' + err.message };\n" +
    "    }\n" +
    "    return { id: t.id, name: t.name, passed: __deepEqual(actual, expected),\n" +
    "      actual: __format(actual, 1), expected: __format(expected, 1) };\n" +
    "  } catch (err) {\n" +
    "    return { id: t.id, name: t.name, passed: false, expected: t.expected,\n" +
    "      error: err && err.message ? err.message : String(err) };\n" +
    "  }\n" +
    "});";

  const started = Date.now();
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const run = new AsyncFunction("__console", "__tests", "__deepEqual", "__format", body);
    const outcomes = await run(shim, tests, deepEqual, format);
    self.postMessage({
      console: lines,
      tests: outcomes,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    self.postMessage({
      console: lines,
      tests: [],
      error: err && err.message ? err.name + ": " + err.message : String(err),
      durationMs: Date.now() - started,
    });
  }
};
`;

/**
 * Runs `source`, then evaluates each test against the scope it left behind.
 * Always resolves — a thrown error, a syntax error, or a timeout all come back
 * as a `RunResult` with `error` set.
 */
export function runJavaScript(
  source: string,
  tests: TestCase[],
  timeoutMs = RUN_TIMEOUT_MS,
): Promise<RunResult> {
  const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));

  return new Promise<RunResult>((resolve) => {
    const worker = new Worker(url);
    const started = Date.now();
    let settled = false;

    const finish = (result: RunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({
        console: [],
        tests: [],
        error: `Stopped after ${timeoutMs / 1000}s — the code did not finish. Check for an infinite loop.`,
        durationMs: Date.now() - started,
      });
    }, timeoutMs);

    worker.onmessage = (event: MessageEvent<RunResult>) => finish(event.data);
    worker.onerror = (event) => {
      // A syntax error surfaces here rather than as a message from inside.
      event.preventDefault();
      finish({
        console: [],
        tests: [],
        error: event.message || "The code could not be run.",
        durationMs: Date.now() - started,
      });
    };

    worker.postMessage({ source, tests });
  });
}

/** Injected into an HTML preview so its console output reaches the Output panel. */
const CONSOLE_BRIDGE = `<script>
(function () {
  var send = function (level, args) {
    parent.postMessage({ __loom: "console", level: level, text: Array.prototype.map.call(args, String).join(" ") }, "*");
  };
  ["log", "warn", "error", "info"].forEach(function (level) {
    var original = console[level];
    console[level] = function () { send(level === "info" ? "log" : level, arguments); original.apply(console, arguments); };
  });
  window.onerror = function (message) { send("error", [message]); };
})();
</script>`;

/**
 * Wraps an HTML snippet for a sandboxed iframe. The frame gets `allow-scripts`
 * and nothing else — no same-origin, no forms, no navigation — so a snippet can
 * run but cannot reach the app around it. Console output is forwarded to the
 * parent so the Output panel reads the same for both languages.
 */
export function htmlPreviewDocument(source: string): string {
  const head = source.trimStart().slice(0, 200).toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) {
    // A complete document is left intact; the bridge goes in at the first tag.
    return source.replace(/<head[^>]*>/i, (match) => match + CONSOLE_BRIDGE);
  }
  return (
    `<!doctype html><html><head><meta charset="utf-8">${CONSOLE_BRIDGE}` +
    `<style>body{margin:0;font-family:system-ui,sans-serif;background:#fff;color:#111}</style>` +
    `</head><body>${source}</body></html>`
  );
}

/** The message an HTML preview posts for each console call it intercepts. */
export interface PreviewMessage {
  __loom: "console";
  level: "log" | "warn" | "error";
  text: string;
}

export function isPreviewMessage(data: unknown): data is PreviewMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as PreviewMessage).__loom === "console" &&
    typeof (data as PreviewMessage).text === "string"
  );
}
