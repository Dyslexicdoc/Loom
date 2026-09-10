"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Presentation, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DECK_THEMES, isTheme, type DeckTheme } from "@/lib/deck";
import {
  createBlankDeckAction,
  createDeckFromEditorDocAction,
  createDeckFromMarkdownAction,
  createDeckFromPromptAction,
} from "@/app/slides/actions";

const THEME_LABELS: Record<DeckTheme, string> = {
  neon: "Neon",
  slate: "Slate",
  paper: "Paper",
};

const EXAMPLES = [
  "A 10-minute talk on why local-first software is worth the trouble",
  "An internal update on migrating our search to hybrid retrieval",
  "How our request pipeline works, for a new engineer",
];

export function DeckCreate({
  editorDocs,
}: {
  editorDocs: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [prompt, setPrompt] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [theme, setTheme] = useState<DeckTheme>("neon");
  const fileInput = useRef<HTMLInputElement | null>(null);

  function run(
    action: () => Promise<{ id: string } | { error: string }>,
    success: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      router.push(`/slides?d=${result.id}`);
    });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="animate-fade-in-up mx-auto flex max-w-3xl flex-col gap-5 px-6 py-10">
        <div className="space-y-3 text-center">
          <Presentation className="text-neon-magenta mx-auto size-9 drop-shadow-[0_0_10px_var(--neon-magenta)]" />
          <p className="font-pixel text-glow-magenta text-primary text-sm leading-relaxed">
            OUTLINE → DECK → .PPTX
            <span className="bg-neon-cyan animate-blink ml-1 inline-block h-3 w-2 align-middle" />
          </p>
          <p className="text-muted-foreground text-sm">
            Describe a talk and the model writes the outline. Slides can hold flowcharts
            and code that runs while you present, and the whole deck exports as real
            PowerPoint.
          </p>
        </div>

        <Tabs defaultValue="describe">
          <TabsList className="w-full">
            <TabsTab value="describe" className="flex-1 gap-2">
              <Sparkles className="size-4" />
              Describe a talk
            </TabsTab>
            <TabsTab value="markdown" className="flex-1 gap-2">
              <FileUp className="size-4" />
              From a document
            </TabsTab>
          </TabsList>

          <TabsPanel value="describe" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="deck-prompt">What is the talk about?</Label>
              <Textarea
                id="deck-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A walkthrough of how our retrieval pipeline works, for the team…"
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
                  className="border-border/70 text-muted-foreground hover:border-neon-magenta/50 hover:text-foreground rounded-full border px-3 py-1 text-xs transition-colors"
                >
                  {example.length > 50 ? `${example.slice(0, 50)}…` : example}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ThemePicker theme={theme} onChange={setTheme} disabled={isPending} />
              <Button
                variant="outline"
                onClick={() => run(() => createBlankDeckAction(), "Deck created.")}
                disabled={isPending}
              >
                Start from a template
              </Button>
              <div className="flex-1" />
              <Button
                onClick={() =>
                  run(
                    () => createDeckFromPromptAction({ prompt, theme }),
                    "Deck written.",
                  )
                }
                disabled={isPending || !prompt.trim()}
                className="gap-2"
              >
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {isPending ? "Writing…" : "Build the deck"}
              </Button>
            </div>
          </TabsPanel>

          <TabsPanel value="markdown" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="deck-markdown">Markdown</Label>
              <Textarea
                id="deck-markdown"
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                placeholder={
                  "# Title\nSubtitle\n\n---\n\n## A slide\n- A point\n- Another point"
                }
                disabled={isPending}
                className="min-h-56 font-mono text-xs"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                accept=".md,.markdown,.txt"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) setMarkdown(await file.text());
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                onClick={() => fileInput.current?.click()}
                disabled={isPending}
                className="gap-2"
              >
                <FileUp className="size-4" />
                Upload .md
              </Button>
              {editorDocs.length > 0 ? (
                <Select
                  value={null}
                  onValueChange={(docId) =>
                    docId &&
                    run(() => createDeckFromEditorDocAction(docId, theme), "Deck built.")
                  }
                  disabled={isPending}
                >
                  <SelectTrigger className="w-52" aria-label="From an Editor document">
                    <SelectValue placeholder="From Editor document…" />
                  </SelectTrigger>
                  <SelectContent>
                    {editorDocs.map((doc) => (
                      <SelectItem key={doc.id} value={doc.id}>
                        {doc.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <ThemePicker theme={theme} onChange={setTheme} disabled={isPending} />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  run(
                    () =>
                      createDeckFromMarkdownAction({ markdown, theme, literal: true }),
                    "Deck created.",
                  )
                }
                disabled={isPending || !markdown.trim()}
              >
                Use as-is
              </Button>
              <Button
                onClick={() =>
                  run(
                    () => createDeckFromMarkdownAction({ markdown, theme }),
                    "Deck built.",
                  )
                }
                disabled={isPending || !markdown.trim()}
                className="gap-2"
              >
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Rewrite as slides
              </Button>
            </div>
          </TabsPanel>
        </Tabs>
      </div>
    </div>
  );
}

function ThemePicker({
  theme,
  onChange,
  disabled,
}: {
  theme: DeckTheme;
  onChange: (next: DeckTheme) => void;
  disabled: boolean;
}) {
  return (
    <Select
      value={theme}
      onValueChange={(value) => value && isTheme(value) && onChange(value)}
      disabled={disabled}
    >
      <SelectTrigger className="w-32" aria-label="Theme">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DECK_THEMES.map((option) => (
          <SelectItem key={option} value={option}>
            {THEME_LABELS[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
