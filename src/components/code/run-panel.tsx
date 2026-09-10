"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { CheckCircle2, CircleSlash, Loader2, Play, TriangleAlert, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { htmlPreviewDocument, isPreviewMessage, runJavaScript } from "@/lib/code-runner";
import { passCount, type CodeLanguage, type ConsoleLine, type RunResult, type TestCase } from "@/lib/code";

export interface RunPanelHandle {
  run: () => void;
}

const LEVEL_STYLE: Record<ConsoleLine["level"], string> = {
  log: "text-foreground",
  warn: "text-neon-yellow",
  error: "text-destructive",
};

/**
 * Runs a snippet and shows what happened: console output, assertion results,
 * and — for HTML — the page itself in a sandboxed frame.
 *
 * Used by the Code Lab, the present view, and code slides in a deck, so all
 * three run identically and none of them can disagree about a result.
 */
export function RunPanel({
  source,
  language,
  tests,
  autoRun = false,
  onResult,
  ref,
  className,
}: {
  source: string;
  language: CodeLanguage;
  tests: TestCase[];
  /** Run as soon as the panel mounts — used when presenting. */
  autoRun?: boolean;
  onResult?: (result: RunResult) => void;
  ref?: React.Ref<RunPanelHandle>;
  className?: string;
}) {
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewLines, setPreviewLines] = useState<ConsoleLine[]>([]);
  // Held in a ref so `run` stays stable: it must not be re-created on every
  // keystroke, or the auto-run effect would fire on each one.
  const latest = useRef({ source, tests, language });
  useEffect(() => {
    latest.current = { source, tests, language };
  }, [source, tests, language]);

  const run = useCallback(async () => {
    const current = latest.current;
    if (current.language === "html") {
      // Remounting the frame is the run: the browser re-executes the document.
      setPreviewLines([]);
      setPreviewKey((key) => key + 1);
      return;
    }
    setRunning(true);
    try {
      const next = await runJavaScript(current.source, current.tests);
      setResult(next);
      onResult?.(next);
    } finally {
      setRunning(false);
    }
  }, [onResult]);

  useImperativeHandle(ref, () => ({ run: () => void run() }), [run]);

  useEffect(() => {
    if (autoRun) void run();
  }, [autoRun, run]);

  // HTML previews report their console back through postMessage.
  useEffect(() => {
    if (language !== "html") return;
    const onMessage = (event: MessageEvent) => {
      if (!isPreviewMessage(event.data)) return;
      setPreviewLines((lines) => [...lines.slice(-99), { level: event.data.level, text: event.data.text }]);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [language]);

  const lines = language === "html" ? previewLines : (result?.console ?? []);
  const outcomes = result?.tests ?? [];
  const passed = passCount(outcomes);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Button size="sm" onClick={() => void run()} disabled={running} className="gap-2">
          {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          Run
        </Button>
        {outcomes.length > 0 ? (
          <span
            className={cn(
              "text-xs font-medium",
              passed === outcomes.length ? "text-neon-green" : "text-destructive",
            )}
          >
            {passed}/{outcomes.length} passing
          </span>
        ) : null}
        <div className="flex-1" />
        {result ? (
          <span className="text-muted-foreground text-xs">{result.durationMs} ms</span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {language === "html" ? (
          <iframe
            key={previewKey}
            // No same-origin: the snippet can run, but cannot touch the app.
            sandbox="allow-scripts"
            srcDoc={htmlPreviewDocument(source)}
            title="Snippet preview"
            className="h-96 w-full border-0 bg-white"
          />
        ) : null}

        {result?.error ? (
          <p className="text-destructive border-destructive/40 bg-destructive/5 m-3 flex items-start gap-2 rounded-md border px-3 py-2 font-mono text-xs">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {result.error}
          </p>
        ) : null}

        {lines.length > 0 ? (
          <pre className="px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {lines.map((line, index) => (
              <div key={index} className={LEVEL_STYLE[line.level]}>
                {line.text}
              </div>
            ))}
          </pre>
        ) : null}

        {outcomes.length > 0 ? (
          <ul className="space-y-1 px-3 pb-3">
            {outcomes.map((outcome) => (
              <li
                key={outcome.id}
                className={cn(
                  "rounded-md border px-2.5 py-2 text-xs",
                  outcome.passed
                    ? "border-neon-green/30 bg-neon-green/5"
                    : "border-destructive/40 bg-destructive/5",
                )}
              >
                <div className="flex items-center gap-2 font-medium">
                  {outcome.passed ? (
                    <CheckCircle2 className="text-neon-green size-3.5 shrink-0" />
                  ) : (
                    <XCircle className="text-destructive size-3.5 shrink-0" />
                  )}
                  <span className="truncate">{outcome.name}</span>
                </div>
                {outcome.passed ? null : (
                  <p className="text-muted-foreground mt-1 pl-5.5 font-mono break-all">
                    {outcome.error
                      ? outcome.error
                      : `expected ${outcome.expected}, got ${outcome.actual ?? "nothing"}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        {!result && language === "javascript" && lines.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 px-3 py-6 text-xs">
            <CircleSlash className="size-4" />
            Not run yet — press Run, or Ctrl+Enter in the editor.
          </p>
        ) : null}
      </div>
    </div>
  );
}
