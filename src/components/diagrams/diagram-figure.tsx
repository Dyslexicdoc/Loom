"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { diagramToSvg, SVG_THEMES, type SvgTheme } from "@/lib/diagram-svg";
import type { DiagramSpec } from "@/lib/diagram";

/**
 * A rendered flowchart, scaled to fit its box. The SVG carries a viewBox, so
 * fitting is the browser's job — this component only sets the frame. Slides,
 * print, and the editor preview all draw through here.
 */
export function DiagramFigure({
  spec,
  theme = SVG_THEMES.neon,
  transparent = true,
  className,
}: {
  spec: DiagramSpec;
  theme?: SvgTheme;
  transparent?: boolean;
  className?: string;
}) {
  const svg = useMemo(
    () => diagramToSvg(spec, { theme, paintBackground: !transparent }),
    [spec, theme, transparent],
  );
  return (
    <div
      className={cn("[&>svg]:h-full [&>svg]:w-full", className)}
      // The SVG is built from parsed Mermaid by `diagramToSvg`, which escapes
      // every label it writes — no author-supplied markup reaches the DOM.
      dangerouslySetInnerHTML={{ __html: withFit(svg) }}
    />
  );
}

/** Lets the SVG scale to its container instead of its intrinsic size. */
function withFit(svg: string): string {
  return svg.replace("<svg ", '<svg preserveAspectRatio="xMidYMid meet" ');
}

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 4;

/** The same figure, with wheel zoom and drag panning for the editor. */
export function DiagramPanZoom({
  spec,
  theme = SVG_THEMES.neon,
  className,
}: {
  spec: DiagramSpec;
  theme?: SvgTheme;
  className?: string;
}) {
  const frame = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  const svg = useMemo(() => diagramToSvg(spec, { theme, paintBackground: false }), [spec, theme]);
  const size = useMemo(() => {
    const match = /width="([\d.]+)" height="([\d.]+)"/.exec(svg);
    return { width: Number(match?.[1] ?? 400), height: Number(match?.[2] ?? 300) };
  }, [svg]);

  const fit = useCallback(() => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || size.width === 0 || size.height === 0) return;
    const zoom = Math.min((box.width - 48) / size.width, (box.height - 48) / size.height, 1.6);
    const next = Math.max(MIN_ZOOM, zoom);
    setView({
      zoom: next,
      x: (box.width - size.width * next) / 2,
      y: (box.height - size.height * next) / 2,
    });
  }, [size]);

  // Re-fit whenever the diagram itself changes shape, not on every keystroke.
  useEffect(() => {
    fit();
  }, [fit]);

  const zoomBy = (factor: number) => {
    const box = frame.current?.getBoundingClientRect();
    setView((current) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * factor));
      const cx = (box?.width ?? 0) / 2;
      const cy = (box?.height ?? 0) / 2;
      const scale = zoom / current.zoom;
      return { zoom, x: cx - (cx - current.x) * scale, y: cy - (cy - current.y) * scale };
    });
  };

  return (
    <div
      ref={frame}
      className={cn("relative cursor-grab overflow-hidden active:cursor-grabbing", className)}
      onPointerDown={(e) => {
        drag.current = { x: view.x, y: view.y, startX: e.clientX, startY: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const start = drag.current;
        if (!start) return;
        setView((current) => ({
          ...current,
          x: start.x + (e.clientX - start.startX),
          y: start.y + (e.clientY - start.startY),
        }));
      }}
      onPointerUp={(e) => {
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onWheel={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - box.left;
        const py = e.clientY - box.top;
        setView((current) => {
          const zoom = Math.min(
            MAX_ZOOM,
            Math.max(MIN_ZOOM, current.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)),
          );
          const scale = zoom / current.zoom;
          return { zoom, x: px - (px - current.x) * scale, y: py - (py - current.y) * scale };
        });
      }}
      style={{ touchAction: "none" }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="absolute right-3 bottom-3 flex gap-1">
        <Button size="icon" variant="outline" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">
          <Minus className="size-4" />
        </Button>
        <Button size="icon" variant="outline" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
          <Plus className="size-4" />
        </Button>
        <Button size="icon" variant="outline" onClick={fit} aria-label="Fit to view">
          <Maximize2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
