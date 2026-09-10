"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Braces, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CODE_LANGUAGES,
  isLanguage,
  LANGUAGE_LABELS,
  type CodeLanguage,
} from "@/lib/code";
import {
  createBlankSnippetAction,
  createSnippetFromPromptAction,
} from "@/app/code/actions";

const EXAMPLES = [
  "A function that parses a duration like '1h 30m' into seconds",
  "Debounce, written from scratch, with a cancel method",
  "A page with three cards that flip over when clicked",
];

export function CodeCreate() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState<CodeLanguage>("javascript");
  const [withTests, setWithTests] = useState(true);

  function open(
    action: () => Promise<{ id: string; warning?: string } | { error: string }>,
  ) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if (result.warning) {
        toast.warning(`Code is ready, but tests failed: ${result.warning}`);
      }
      router.push(`/code?s=${result.id}`);
    });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="animate-fade-in-up mx-auto flex max-w-3xl flex-col gap-5 px-6 py-10">
        <div className="space-y-3 text-center">
          <Braces className="text-neon-green mx-auto size-9 drop-shadow-[0_0_10px_var(--neon-green)]" />
          <p className="font-pixel text-glow-magenta text-primary text-sm leading-relaxed">
            WRITE → RUN → PROVE
            <span className="bg-neon-cyan animate-blink ml-1 inline-block h-3 w-2 align-middle" />
          </p>
          <p className="text-muted-foreground text-sm">
            Ask for a snippet, run it in a sandboxed worker, and hold it to test cases the
            model writes from the code. Nothing leaves this machine.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="code-prompt">What should it do?</Label>
          <Textarea
            id="code-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A function that groups an array of objects by a key…"
            disabled={isPending}
            className="min-h-32"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              disabled={isPending}
              className="border-border/70 text-muted-foreground hover:border-neon-green/50 hover:text-foreground rounded-full border px-3 py-1 text-xs transition-colors"
            >
              {example.length > 48 ? `${example.slice(0, 48)}…` : example}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={language}
            onValueChange={(value) => value && isLanguage(value) && setLanguage(value)}
            disabled={isPending}
          >
            <SelectTrigger className="w-40" aria-label="Language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CODE_LANGUAGES.map((option) => (
                <SelectItem key={option} value={option}>
                  {LANGUAGE_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {language === "javascript" ? (
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={withTests}
                onChange={(e) => setWithTests(e.target.checked)}
                disabled={isPending}
                className="accent-primary size-4"
              />
              Write tests too
            </label>
          ) : null}

          <div className="flex-1" />
          <Button
            variant="outline"
            onClick={() => open(() => createBlankSnippetAction(language))}
            disabled={isPending}
          >
            Start blank
          </Button>
          <Button
            onClick={() =>
              open(() => createSnippetFromPromptAction({ prompt, language, withTests }))
            }
            disabled={isPending || !prompt.trim()}
            className="gap-2"
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {isPending ? "Writing…" : "Write it"}
          </Button>
        </div>
      </div>
    </div>
  );
}
