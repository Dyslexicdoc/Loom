"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, NotebookPen, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { SlideStage } from "@/components/slides/slide-view";
import type { Deck, DeckTheme } from "@/lib/deck";

/**
 * Presenting: one slide, full bleed, keyboard-driven. Arrow keys and space move,
 * `n` toggles the notes, `f` goes full screen, Escape leaves. Code slides marked
 * `run` execute here, so a demo shows the code working live.
 */
export function DeckPresent({
  deck,
  theme,
  startIndex = 0,
}: {
  deck: Deck;
  theme: DeckTheme;
  /** Opens on this slide, so a deck can be linked to at the right place. */
  startIndex?: number;
}) {
  const [index, setIndex] = useState(startIndex);
  const [showNotes, setShowNotes] = useState(false);
  const total = deck.slides.length;

  const go = useCallback(
    (delta: number) =>
      setIndex((current) => Math.min(total - 1, Math.max(0, current + delta))),
    [total],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowRight":
        case "PageDown":
        case " ":
          event.preventDefault();
          go(1);
          break;
        case "ArrowLeft":
        case "PageUp":
          event.preventDefault();
          go(-1);
          break;
        case "Home":
          setIndex(0);
          break;
        case "End":
          setIndex(total - 1);
          break;
        case "n":
          setShowNotes((current) => !current);
          break;
        case "f":
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen();
          break;
        case "Escape":
          if (!document.fullscreenElement) window.close();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, total]);

  if (total === 0) {
    return (
      <div className="bg-background flex h-dvh items-center justify-center">
        <p className="text-muted-foreground text-sm">
          This deck has no slides yet. Separate slides with <code>---</code>.
        </p>
      </div>
    );
  }

  const slide = deck.slides[index];

  return (
    <div className="flex h-dvh flex-col bg-black">
      <SlideStage
        key={slide.id}
        slide={slide}
        theme={theme}
        interactive
        className="min-h-0 flex-1"
      />

      {showNotes && slide.notes ? (
        <aside className="bg-background max-h-48 shrink-0 overflow-y-auto border-t px-8 py-4">
          <p className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-wide uppercase">
            Speaker notes
          </p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{slide.notes}</p>
        </aside>
      ) : null}

      <footer className="bg-background flex shrink-0 items-center gap-3 border-t px-4 py-2">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          aria-label="Previous slide"
          className="hover:bg-accent rounded p-1.5 disabled:opacity-30"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={index === total - 1}
          aria-label="Next slide"
          className="hover:bg-accent rounded p-1.5 disabled:opacity-30"
        >
          <ChevronRight className="size-4" />
        </button>
        <span className="text-muted-foreground text-xs tabular-nums">
          {index + 1} / {total}
        </span>
        <div className="bg-muted h-1 flex-1 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full transition-[width] duration-200"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowNotes((current) => !current)}
          aria-label="Toggle speaker notes"
          className={cn(
            "hover:bg-accent rounded p-1.5",
            showNotes ? "text-primary" : "text-muted-foreground",
            slide.notes ? "" : "opacity-30",
          )}
        >
          <NotebookPen className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          aria-label="Close"
          className="hover:bg-accent text-muted-foreground rounded p-1.5"
        >
          <X className="size-4" />
        </button>
      </footer>
    </div>
  );
}
