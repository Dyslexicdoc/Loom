"use client";

import { useRef } from "react";
import { PrismAsync as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

import { Markdown } from "@/components/markdown";
import { RunPanel, type RunPanelHandle } from "@/components/code/run-panel";
import { LANGUAGE_LABELS, type CodeLanguage, type TestCase } from "@/lib/code";

/**
 * The presenting view of a snippet: the code at a readable size, the walkthrough
 * beside it, and a live run underneath — so a demo shows the code working
 * rather than asking the room to take it on faith.
 */
export function CodePresent({
  title,
  language,
  source,
  tests,
  notes,
}: {
  title: string;
  language: CodeLanguage;
  source: string;
  tests: TestCase[];
  notes: string | null;
}) {
  const runner = useRef<RunPanelHandle | null>(null);

  return (
    <div className="bg-background flex h-dvh flex-col">
      <header className="flex shrink-0 items-baseline gap-3 border-b px-8 py-5">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <span className="text-muted-foreground text-xs tracking-wide uppercase">
          {LANGUAGE_LABELS[language]}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 flex-1 overflow-auto px-8 py-6">
          <SyntaxHighlighter
            language={language === "html" ? "markup" : "javascript"}
            style={oneDark}
            // No `showLineNumbers`: its gutter serializes inline styles in a
            // different order on the server than the client, which React
            // reports as a hydration mismatch it will not patch up.
            customStyle={{ margin: 0, background: "transparent", fontSize: "0.95rem" }}
            codeTagProps={{ style: { fontFamily: "var(--font-geist-mono, monospace)" } }}
          >
            {source}
          </SyntaxHighlighter>
        </div>

        <aside className="flex min-h-0 w-full shrink-0 flex-col border-t lg:w-[30rem] lg:border-t-0 lg:border-l">
          {notes ? (
            <div className="max-h-64 shrink-0 overflow-y-auto border-b px-5 py-4">
              <Markdown>{notes}</Markdown>
            </div>
          ) : null}
          <RunPanel
            ref={runner}
            source={source}
            language={language}
            tests={tests}
            autoRun
            className="flex-1"
          />
        </aside>
      </div>
    </div>
  );
}
