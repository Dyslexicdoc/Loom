"use client";

import { useTransition } from "react";
import { Loader2, Plus, Sparkles, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cryptoId, type RunResult, type TestCase } from "@/lib/code";
import { fixSnippetAction, generateTestsAction } from "@/app/code/actions";

/**
 * The assertions for a snippet. Each case is a pair of JavaScript expressions
 * evaluated in the snippet's own scope, so a test can call anything the code
 * declares without the code having to export it.
 */
export function TestsPanel({
  snippetId,
  tests,
  onChange,
  lastRun,
  onFixed,
}: {
  snippetId: string;
  tests: TestCase[];
  onChange: (next: TestCase[]) => void;
  /** The most recent run, so "Fix failures" can describe what actually broke. */
  lastRun: RunResult | null;
  onFixed: (source: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const failures = (lastRun?.tests ?? []).filter((outcome) => !outcome.passed);
  const canFix = failures.length > 0 || Boolean(lastRun?.error);

  function update(id: string, patch: Partial<TestCase>) {
    onChange(tests.map((test) => (test.id === id ? { ...test, ...patch } : test)));
  }

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateTestsAction(snippetId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      onChange(result.tests);
      toast.success(`Wrote ${result.tests.length} test cases.`);
    });
  }

  function handleFix() {
    startTransition(async () => {
      const result = await fixSnippetAction(
        snippetId,
        failures.map((outcome) => ({
          name: outcome.name,
          expression: tests.find((t) => t.id === outcome.id)?.expression ?? outcome.name,
          expected: outcome.expected,
          detail: outcome.error ?? `got ${outcome.actual ?? "nothing"}`,
        })),
        lastRun?.error,
      );
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      onFixed(result.source);
      toast.success("Rewrote the snippet — run it again.");
    });
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleGenerate}
          disabled={isPending}
          className="gap-2"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Write tests
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleFix}
          disabled={isPending || !canFix}
          className="gap-2"
        >
          <Wrench className="size-4" />
          Fix failures
        </Button>
        <div className="flex-1" />
        <Button
          size="icon"
          variant="ghost"
          aria-label="Add test case"
          onClick={() =>
            onChange([...tests, { id: cryptoId(), name: "New case", expression: "", expected: "" }])
          }
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {tests.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-xs">
            No tests yet. Write some by hand, or let the model propose a set from the code.
          </p>
        ) : null}

        {tests.map((test) => (
          <div key={test.id} className="space-y-1.5 rounded-md border p-2.5">
            <div className="flex items-center gap-2">
              <Input
                value={test.name}
                onChange={(e) => update(test.id, { name: e.target.value })}
                placeholder="What this proves"
                className="h-7 border-0 px-1 text-xs font-medium shadow-none focus-visible:ring-0"
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remove test case"
                onClick={() => onChange(tests.filter((t) => t.id !== test.id))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <Input
              value={test.expression}
              onChange={(e) => update(test.id, { expression: e.target.value })}
              placeholder="slugify('Hello World')"
              className="h-8 font-mono text-xs"
            />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground shrink-0 text-xs">should equal</span>
              <Input
                value={test.expected}
                onChange={(e) => update(test.id, { expected: e.target.value })}
                placeholder="'hello-world'"
                className="h-8 font-mono text-xs"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
