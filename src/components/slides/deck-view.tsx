"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Code2,
  Download,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SlideStage } from "@/components/slides/slide-view";
import { DECK_THEMES, isTheme, parseDeck, slideLabel, type DeckTheme } from "@/lib/deck";
import { regenerateDeckAction, saveDeckAction } from "@/app/slides/actions";

export interface DeckSummary {
  id: string;
  title: string;
  source: string;
  theme: DeckTheme;
  model: string | null;
  error: string | null;
}

const THEME_LABELS: Record<DeckTheme, string> = {
  neon: "Neon",
  slate: "Slate",
  paper: "Paper",
};

export function DeckView({ deck: row }: { deck: DeckSummary }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [source, setSource] = useState(row.source);
  const [theme, setTheme] = useState<DeckTheme>(row.theme);
  const [instructions, setInstructions] = useState("");
  const [showSource, setShowSource] = useState(true);
  const [current, setCurrent] = useState(0);

  const deck = useMemo(() => parseDeck(source), [source]);
  const dirty = source !== row.source || theme !== row.theme;
  const slide = deck.slides[Math.min(current, Math.max(0, deck.slides.length - 1))];

  function handleSave() {
    startTransition(async () => {
      const result = await saveDeckAction(row.id, { source, theme });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Deck saved.");
      router.refresh();
    });
  }

  function handleRegenerate() {
    startTransition(async () => {
      const result = await regenerateDeckAction(row.id, instructions);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setInstructions("");
      toast.success("Deck rewritten.");
      router.refresh();
    });
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <h1 className="truncate text-sm font-semibold">{row.title}</h1>
        <span className="text-muted-foreground shrink-0 text-xs">
          {deck.slides.length} slides{row.model ? ` · ${row.model}` : ""}
        </span>
        <div className="flex-1" />
        <Select
          value={theme}
          onValueChange={(value) => value && isTheme(value) && setTheme(value)}
        >
          <SelectTrigger className="h-8 w-28" aria-label="Theme">
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowSource((value) => !value)}
          className="gap-2"
        >
          <Code2 className="size-4" />
          {showSource ? "Hide outline" : "Show outline"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          render={
            <a
              href={`/api/slides/${row.id}/pptx`}
              download
              // A fresh save must be on disk before the server can export it.
              onClick={(event) => {
                if (dirty) {
                  event.preventDefault();
                  toast.warning("Save the deck first — the export reads what is stored.");
                }
              }}
            />
          }
          className="gap-2"
        >
          <Download className="size-4" />
          PowerPoint
        </Button>
        <Button
          size="sm"
          render={
            <a
              href={`/slides/present/${row.id}`}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
          className="gap-2"
        >
          <Play className="size-4" />
          Present
        </Button>
      </header>

      {row.error ? (
        <p className="text-neon-yellow border-neon-yellow/40 bg-neon-yellow/5 flex items-center gap-2 border-b px-4 py-2 text-xs">
          <AlertTriangle className="size-4 shrink-0" />
          {row.error}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {slide ? (
            <SlideStage
              slide={slide}
              theme={theme}
              framed
              className="min-h-0 flex-1 bg-black/50 p-6"
            />
          ) : (
            <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
              No slides yet — separate them with <code className="mx-1">---</code>.
            </div>
          )}

          <div className="flex shrink-0 gap-2 overflow-x-auto border-t p-2">
            {deck.slides.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrent(index)}
                title={slideLabel(item)}
                className={cn(
                  "shrink-0 overflow-hidden rounded border transition-colors",
                  index === current
                    ? "border-primary shadow-[0_0_10px_var(--neon-magenta)]"
                    : "border-border hover:border-neon-cyan/50",
                )}
              >
                <SlideStage slide={item} theme={theme} className="h-[72px] w-32" />
              </button>
            ))}
          </div>
        </div>

        {showSource ? (
          <aside className="flex w-96 shrink-0 flex-col gap-3 border-l p-3">
            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              <label
                htmlFor="deck-source"
                className="text-muted-foreground text-xs font-medium"
              >
                Markdown outline — <code>---</code> starts a new slide
              </label>
              <Textarea
                id="deck-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                spellCheck={false}
                className="min-h-0 flex-1 font-mono text-xs"
              />
            </div>

            <Button
              variant={dirty ? "default" : "outline"}
              onClick={handleSave}
              disabled={!dirty || isPending}
              className="gap-2"
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {dirty ? "Save deck" : "Saved"}
            </Button>

            <div className="space-y-2 border-t pt-3">
              <label
                htmlFor="deck-instructions"
                className="text-muted-foreground text-xs font-medium"
              >
                Ask the model to change it
              </label>
              <Input
                id="deck-instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && instructions.trim()) handleRegenerate();
                }}
                placeholder="Add a slide comparing the two approaches…"
                disabled={isPending}
              />
              <Button
                variant="outline"
                onClick={handleRegenerate}
                disabled={isPending}
                className="w-full gap-2"
              >
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : instructions.trim() ? (
                  <Sparkles className="size-4" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                {instructions.trim() ? "Apply change" : "Rewrite from prompt"}
              </Button>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
