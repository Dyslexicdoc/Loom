"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { PrismAsync as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

import { cn } from "@/lib/utils";
import { DiagramFigure } from "@/components/diagrams/diagram-figure";
import { RunPanel } from "@/components/code/run-panel";
import { parseDiagram } from "@/lib/diagram";
import { SVG_THEMES } from "@/lib/diagram-svg";
import { STAGE_HEIGHT, STAGE_WIDTH, type DeckTheme, type Slide } from "@/lib/deck";

/**
 * Slides are laid out on a fixed 1280x720 stage and scaled with a transform,
 * so type sizes are chosen once and hold at any size — thumbnail, editor
 * preview, or full screen. It is also what the PowerPoint exporter assumes.
 */
export function SlideStage({
  slide,
  theme,
  interactive = false,
  framed = false,
  className,
}: {
  slide: Slide;
  theme: DeckTheme;
  /** Allow code slides to run. Off for thumbnails, on when presenting. */
  interactive?: boolean;
  /** Outline the slide, so it reads as a slide against a dark app background. */
  framed?: boolean;
  className?: string;
}) {
  const frame = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;

    // Measured up front as well as observed: a ResizeObserver's first callback
    // is asynchronous, and a slide that renders at the wrong size for a frame
    // is very visible when it is the whole screen.
    const fit = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      setScale(Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT));
    };
    const box = element.getBoundingClientRect();
    fit(box.width, box.height);

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      fit(width, height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frame} className={cn("relative overflow-hidden", className)}>
      <div
        className={cn(
          "absolute top-1/2 left-1/2 origin-center",
          framed && "ring-border ring-1",
        )}
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          transform: `translate(-50%, -50%) scale(${scale})`,
          visibility: scale > 0 ? "visible" : "hidden",
          boxShadow: framed
            ? "0 0 0 1px rgba(255,255,255,0.08), 0 24px 60px rgba(0,0,0,0.5)"
            : undefined,
        }}
      >
        <SlideBody slide={slide} theme={theme} interactive={interactive} />
      </div>
    </div>
  );
}

const PALETTE: Record<
  DeckTheme,
  { bg: string; text: string; muted: string; accent: string; surface: string }
> = Object.fromEntries(
  (Object.keys(SVG_THEMES) as DeckTheme[]).map((name) => {
    const theme = SVG_THEMES[name];
    return [
      name,
      {
        bg: theme.background,
        text: theme.text,
        muted: theme.muted,
        accent: theme.step,
        surface: theme.surface,
      },
    ];
  }),
) as Record<
  DeckTheme,
  { bg: string; text: string; muted: string; accent: string; surface: string }
>;

const PAD = 64;

/** The slide itself, always drawn at stage size. */
function SlideBody({
  slide,
  theme,
  interactive,
}: {
  slide: Slide;
  theme: DeckTheme;
  interactive: boolean;
}) {
  const colours = PALETTE[theme];

  return (
    <div
      className="flex h-full w-full flex-col"
      style={{
        background: colours.bg,
        color: colours.text,
        padding: PAD,
        fontFamily: "var(--font-geist-sans, ui-sans-serif, system-ui, sans-serif)",
      }}
    >
      {slide.layout === "title" || slide.layout === "section" ? (
        <div className="flex h-full flex-col justify-center">
          <div
            style={{
              width: slide.layout === "title" ? 120 : 96,
              height: 6,
              background: colours.accent,
              marginBottom: 28,
            }}
          />
          <h1
            style={{
              fontSize: slide.layout === "title" ? 68 : 52,
              fontWeight: 700,
              lineHeight: 1.1,
            }}
          >
            {slide.title}
          </h1>
          {slide.subtitle ? (
            <p style={{ fontSize: 26, color: colours.muted, marginTop: 20 }}>
              {slide.subtitle}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          {slide.title ? (
            <header style={{ marginBottom: 34 }}>
              <h2 style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.15 }}>
                {slide.title}
              </h2>
              <div
                style={{
                  width: 74,
                  height: 5,
                  background: colours.accent,
                  marginTop: 14,
                }}
              />
            </header>
          ) : null}
          <div className="min-h-0 flex-1">
            <SlideContent slide={slide} theme={theme} interactive={interactive} />
          </div>
        </>
      )}
    </div>
  );
}

function SlideContent({
  slide,
  theme,
  interactive,
}: {
  slide: Slide;
  theme: DeckTheme;
  interactive: boolean;
}) {
  const colours = PALETTE[theme];

  switch (slide.layout) {
    case "bullets":
      return (
        <ul className="flex flex-col gap-4">
          {slide.bullets.map((bullet, index) => (
            <li
              key={index}
              className="flex gap-4"
              style={{
                marginLeft: bullet.level * 44,
                fontSize: bullet.level > 0 ? 24 : 29,
                color: bullet.level > 0 ? colours.muted : colours.text,
                lineHeight: 1.35,
              }}
            >
              <span style={{ color: colours.accent }}>
                {bullet.level > 0 ? "–" : "•"}
              </span>
              <span>{bullet.text}</span>
            </li>
          ))}
        </ul>
      );

    case "columns":
      return (
        <div className="grid h-full grid-cols-2 gap-8">
          {slide.columns.map((column, index) => (
            <div
              key={index}
              className="rounded-xl p-7"
              style={{
                background: colours.surface,
                border: `1px solid ${colours.accent}55`,
              }}
            >
              {column.heading ? (
                <h3
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    color: colours.accent,
                    marginBottom: 18,
                  }}
                >
                  {column.heading}
                </h3>
              ) : null}
              <ul className="flex flex-col gap-3">
                {column.bullets.map((bullet, i) => (
                  <li
                    key={i}
                    className="flex gap-3"
                    style={{
                      fontSize: 22,
                      marginLeft: bullet.level * 24,
                      lineHeight: 1.35,
                    }}
                  >
                    <span style={{ color: colours.accent }}>•</span>
                    <span>{bullet.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      );

    case "quote":
      return (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <p
            style={{ fontSize: 40, fontStyle: "italic", lineHeight: 1.35, maxWidth: 940 }}
          >
            “{slide.text}”
          </p>
          {slide.attribution ? (
            <p style={{ fontSize: 22, color: colours.muted, marginTop: 34 }}>
              — {slide.attribution}
            </p>
          ) : null}
        </div>
      );

    case "stats":
      return (
        <div
          className="grid h-full items-start gap-6"
          style={{ gridTemplateColumns: `repeat(${slide.stats.length}, minmax(0, 1fr))` }}
        >
          {slide.stats.map((stat, index) => (
            <div
              key={index}
              className="flex flex-col items-center justify-center rounded-xl px-6 py-10"
              style={{
                background: colours.surface,
                border: `1px solid ${colours.accent}55`,
              }}
            >
              <span
                style={{
                  fontSize: 62,
                  fontWeight: 700,
                  color: colours.accent,
                  lineHeight: 1,
                }}
              >
                {stat.value}
              </span>
              <span
                style={{
                  fontSize: 20,
                  color: colours.muted,
                  marginTop: 16,
                  textAlign: "center",
                }}
              >
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      );

    case "table":
      return (
        <table className="w-full border-collapse" style={{ fontSize: 21 }}>
          <thead>
            <tr>
              {slide.columns.map((column, index) => (
                <th
                  key={index}
                  className="px-4 py-3 text-left font-semibold"
                  style={{ background: colours.accent, color: colours.bg }}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slide.rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                style={{ background: rowIndex % 2 ? "transparent" : colours.surface }}
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="px-4 py-2.5"
                    style={{ borderBottom: `1px solid ${colours.muted}40` }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );

    case "diagram":
      return <DiagramSlide mermaid={slide.mermaid} theme={theme} />;

    case "code":
      return <CodeSlide slide={slide} theme={theme} interactive={interactive} />;

    default:
      return null;
  }
}

function DiagramSlide({ mermaid, theme }: { mermaid: string; theme: DeckTheme }) {
  const { spec } = useMemo(() => parseDiagram(mermaid), [mermaid]);
  return (
    <DiagramFigure spec={spec} theme={SVG_THEMES[theme]} className="h-full w-full" />
  );
}

function CodeSlide({
  slide,
  theme,
  interactive,
}: {
  slide: Extract<Slide, { layout: "code" }>;
  theme: DeckTheme;
  interactive: boolean;
}) {
  const colours = PALETTE[theme];
  // A runnable slide gives up its lower third to the output, so the demo and
  // the code it came from stay on screen together.
  const runnable = interactive && slide.runnable && slide.language !== "html";

  return (
    <div className="flex h-full flex-col gap-4">
      <div
        className="min-h-0 flex-1 overflow-hidden rounded-xl"
        style={{ background: colours.surface, border: `1px solid ${colours.muted}40` }}
      >
        <SyntaxHighlighter
          language={slide.language === "html" ? "markup" : slide.language}
          style={oneDark}
          customStyle={{
            margin: 0,
            padding: 24,
            background: "transparent",
            fontSize: slide.code.split("\n").length > 16 ? 16 : 20,
            lineHeight: 1.5,
          }}
          codeTagProps={{ style: { fontFamily: "var(--font-geist-mono, monospace)" } }}
        >
          {slide.code}
        </SyntaxHighlighter>
      </div>
      {runnable ? (
        <div
          className="h-52 shrink-0 overflow-hidden rounded-xl"
          style={{ background: colours.surface, border: `1px solid ${colours.accent}55` }}
        >
          <RunPanel
            source={slide.code}
            language="javascript"
            tests={[]}
            className="h-full"
          />
        </div>
      ) : null}
    </div>
  );
}
