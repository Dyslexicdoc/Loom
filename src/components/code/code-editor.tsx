"use client";

import { useMemo, useRef } from "react";

import { cn } from "@/lib/utils";

const INDENT = "  ";

/**
 * A plain code editor: a textarea with a line-number gutter, Tab for indent,
 * and Ctrl+Enter to run. Deliberately not a full editor component — Loom runs
 * offline on a local machine, and a textarea has no bundle cost to pay for.
 */
export function CodeEditor({
  value,
  onChange,
  onRun,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  onRun?: () => void;
  className?: string;
}) {
  const area = useRef<HTMLTextAreaElement | null>(null);
  const gutter = useRef<HTMLDivElement | null>(null);
  const lineCount = useMemo(() => value.split("\n").length, [value]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onRun?.();
      return;
    }
    if (event.key !== "Tab") return;

    event.preventDefault();
    const element = event.currentTarget;
    const { selectionStart, selectionEnd } = element;
    const before = value.slice(0, selectionStart);
    const after = value.slice(selectionEnd);

    if (!event.shiftKey && selectionStart === selectionEnd) {
      onChange(`${before}${INDENT}${after}`);
      queueCaret(element, selectionStart + INDENT.length);
      return;
    }

    // With a selection (or Shift), indent or outdent every line it touches.
    const lineStart = before.lastIndexOf("\n") + 1;
    const block = value.slice(lineStart, selectionEnd);
    const shifted = event.shiftKey
      ? block.replace(new RegExp(`^${INDENT}`, "gm"), "")
      : block.replace(/^/gm, INDENT);
    onChange(value.slice(0, lineStart) + shifted + after);
    queueCaret(element, lineStart, lineStart + shifted.length);
  }

  return (
    <div className={cn("relative flex min-h-0 overflow-hidden", className)}>
      <div
        ref={gutter}
        aria-hidden
        className="text-muted-foreground/50 bg-muted/20 shrink-0 overflow-hidden border-r px-2 py-3 text-right font-mono text-xs leading-[1.6] select-none"
      >
        {Array.from({ length: lineCount }, (_, index) => (
          <div key={index}>{index + 1}</div>
        ))}
      </div>
      <textarea
        ref={area}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onScroll={(e) => {
          if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
        }}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="text-foreground min-h-0 flex-1 resize-none bg-transparent px-3 py-3 font-mono text-xs leading-[1.6] outline-none"
      />
    </div>
  );
}

/** Restores the caret after React re-renders with the new value. */
function queueCaret(element: HTMLTextAreaElement, start: number, end = start) {
  requestAnimationFrame(() => element.setSelectionRange(start, end));
}
