import "server-only";

import PptxGenJS from "pptxgenjs";

import {
  measureNode,
  routeDiagram,
  type NodeShape,
  type Point,
  type RoutedDiagram,
} from "./diagram";
import { accentFor, edgeColour, SVG_THEMES, type SvgTheme } from "./diagram-svg";
import { parseDiagram } from "./diagram";
import type { Bullet, Deck, DeckTheme, Slide } from "./deck";

/**
 * Real PowerPoint, not a picture of one.
 *
 * Every slide is built from native shapes and text frames, so the deck opens in
 * PowerPoint or Keynote as something a person can keep editing. Diagram slides
 * are the point of pride: they use PowerPoint's own flowchart shapes, positioned
 * by the same `routeDiagram` the on-screen renderer uses, so a box the presenter
 * drags in PowerPoint is the box Loom drew.
 */

/** 16:9 at PowerPoint's default widescreen size, in inches. */
const SLIDE_W = 10;
const SLIDE_H = 5.625;
const MARGIN = 0.62;
const CONTENT_W = SLIDE_W - MARGIN * 2;
const TITLE_Y = 0.46;
const BODY_Y = 1.45;
const BODY_H = SLIDE_H - BODY_Y - 0.5;

const SANS = "Segoe UI";
const MONO = "Consolas";

/** pptxgenjs wants bare hex; the shared themes carry CSS colours. */
function hex(colour: string): string {
  return colour.replace("#", "").toUpperCase();
}

interface Palette {
  theme: SvgTheme;
  background: string;
  text: string;
  muted: string;
  accent: string;
  surface: string;
}

function palette(theme: DeckTheme): Palette {
  const source = SVG_THEMES[theme];
  return {
    theme: source,
    background: hex(source.background),
    text: hex(source.text),
    muted: hex(source.muted),
    accent: hex(source.step),
    surface: hex(source.surface),
  };
}

// ---------------------------------------------------------------------------
// Slide layouts
// ---------------------------------------------------------------------------

type PptxSlide = ReturnType<PptxGenJS["addSlide"]>;

function addTitle(slide: PptxSlide, text: string, colours: Palette): void {
  slide.addText(text, {
    x: MARGIN,
    y: TITLE_Y,
    w: CONTENT_W,
    h: 0.7,
    fontFace: SANS,
    fontSize: 30,
    bold: true,
    color: colours.text,
    valign: "middle",
  });
  slide.addShape("rect", {
    x: MARGIN,
    y: TITLE_Y + 0.78,
    w: 0.9,
    h: 0.045,
    fill: { color: colours.accent },
    line: { width: 0 },
  });
}

function bulletText(bullets: Bullet[], colours: Palette) {
  return bullets.map((bullet) => ({
    text: bullet.text,
    options: {
      bullet: { indent: 18 },
      indentLevel: bullet.level,
      fontSize: bullet.level > 0 ? 15 : 18,
      color: bullet.level > 0 ? colours.muted : colours.text,
      breakLine: true,
      paraSpaceAfter: 8,
    },
  }));
}

function renderSlide(pptx: PptxGenJS, slide: Slide, colours: Palette): void {
  const page = pptx.addSlide();
  page.background = { color: colours.background };
  if (slide.notes) {
    page.addNotes(slide.notes);
  }

  switch (slide.layout) {
    case "title":
    case "section": {
      const centred = slide.layout === "title";
      page.addShape("rect", {
        x: MARGIN,
        y: centred ? 1.9 : 2.3,
        w: 1.2,
        h: 0.06,
        fill: { color: colours.accent },
        line: { width: 0 },
      });
      page.addText(slide.title ?? "", {
        x: MARGIN,
        y: centred ? 2.15 : 2.5,
        w: CONTENT_W,
        h: 1,
        fontFace: SANS,
        fontSize: centred ? 44 : 34,
        bold: true,
        color: colours.text,
      });
      if (slide.subtitle) {
        page.addText(slide.subtitle, {
          x: MARGIN,
          y: centred ? 3.15 : 3.4,
          w: CONTENT_W,
          h: 0.5,
          fontFace: SANS,
          fontSize: 17,
          color: colours.muted,
        });
      }
      return;
    }

    case "bullets": {
      if (slide.title) addTitle(page, slide.title, colours);
      page.addText(bulletText(slide.bullets, colours), {
        x: MARGIN,
        y: BODY_Y,
        w: CONTENT_W,
        h: BODY_H,
        fontFace: SANS,
        valign: "top",
      });
      return;
    }

    case "columns": {
      if (slide.title) addTitle(page, slide.title, colours);
      const columnW = (CONTENT_W - 0.4) / 2;
      slide.columns.forEach((column, index) => {
        const x = MARGIN + index * (columnW + 0.4);
        page.addShape("rect", {
          x,
          y: BODY_Y - 0.12,
          w: columnW,
          h: BODY_H + 0.12,
          fill: { color: colours.surface },
          line: { color: colours.accent, width: 0.75 },
        });
        if (column.heading) {
          page.addText(column.heading, {
            x: x + 0.22,
            y: BODY_Y,
            w: columnW - 0.44,
            h: 0.4,
            fontFace: SANS,
            fontSize: 17,
            bold: true,
            color: colours.accent,
          });
        }
        page.addText(bulletText(column.bullets, colours), {
          x: x + 0.22,
          y: BODY_Y + 0.5,
          w: columnW - 0.44,
          h: BODY_H - 0.6,
          fontFace: SANS,
          valign: "top",
        });
      });
      return;
    }

    case "quote": {
      page.addText(`“${slide.text}”`, {
        x: MARGIN + 0.3,
        y: 1.5,
        w: CONTENT_W - 0.6,
        h: 2.2,
        fontFace: SANS,
        fontSize: 26,
        italic: true,
        color: colours.text,
        align: "center",
        valign: "middle",
      });
      if (slide.attribution) {
        page.addText(`— ${slide.attribution}`, {
          x: MARGIN,
          y: 3.9,
          w: CONTENT_W,
          h: 0.4,
          fontFace: SANS,
          fontSize: 15,
          color: colours.muted,
          align: "center",
        });
      }
      return;
    }

    case "code": {
      if (slide.title) addTitle(page, slide.title, colours);
      const top = slide.title ? BODY_Y : 0.9;
      const lines = slide.code.split("\n");
      page.addShape("roundRect", {
        x: MARGIN,
        y: top - 0.15,
        w: CONTENT_W,
        h: SLIDE_H - top - 0.35,
        rectRadius: 0.02,
        fill: { color: colours.surface },
        line: { color: colours.muted, width: 0.5 },
      });
      page.addText(slide.code, {
        x: MARGIN + 0.22,
        y: top,
        w: CONTENT_W - 0.44,
        h: SLIDE_H - top - 0.6,
        fontFace: MONO,
        // Long snippets step down a size rather than overflowing the slide.
        fontSize: lines.length > 18 ? 10 : lines.length > 12 ? 12 : 14,
        color: colours.text,
        valign: "top",
      });
      return;
    }

    case "table": {
      if (slide.title) addTitle(page, slide.title, colours);
      const header = slide.columns.map((column) => ({
        text: column,
        options: {
          bold: true,
          color: colours.background,
          fill: { color: colours.accent },
        },
      }));
      const body = slide.rows.map((row) =>
        row.map((cell) => ({ text: cell, options: { color: colours.text } })),
      );
      page.addTable([header, ...body], {
        x: MARGIN,
        y: BODY_Y,
        w: CONTENT_W,
        fontFace: SANS,
        fontSize: 13,
        border: { type: "solid", pt: 0.5, color: colours.muted },
        fill: { color: colours.surface },
        autoPage: false,
      });
      return;
    }

    case "stats": {
      if (slide.title) addTitle(page, slide.title, colours);
      const gap = 0.3;
      const boxW = (CONTENT_W - gap * (slide.stats.length - 1)) / slide.stats.length;
      slide.stats.forEach((stat, index) => {
        const x = MARGIN + index * (boxW + gap);
        page.addShape("roundRect", {
          x,
          y: BODY_Y + 0.15,
          w: boxW,
          h: 1.9,
          rectRadius: 0.04,
          fill: { color: colours.surface },
          line: { color: colours.accent, width: 0.75 },
        });
        page.addText(stat.value, {
          x,
          y: BODY_Y + 0.4,
          w: boxW,
          h: 0.9,
          fontFace: SANS,
          fontSize: 34,
          bold: true,
          color: colours.accent,
          align: "center",
        });
        page.addText(stat.label, {
          x: x + 0.15,
          y: BODY_Y + 1.3,
          w: boxW - 0.3,
          h: 0.6,
          fontFace: SANS,
          fontSize: 13,
          color: colours.muted,
          align: "center",
          valign: "top",
        });
      });
      return;
    }

    case "diagram": {
      if (slide.title) addTitle(page, slide.title, colours);
      const { spec } = parseDiagram(slide.mermaid);
      drawDiagram(page, routeDiagram(spec), colours, slide.title ? BODY_Y - 0.2 : 0.7);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Diagrams, as native PowerPoint shapes
// ---------------------------------------------------------------------------

/** Mermaid node shape → the PowerPoint shape that means the same thing. */
const PPTX_SHAPE: Record<NodeShape, { type: string; radius?: number }> = {
  process: { type: "rect" },
  rounded: { type: "roundRect", radius: 0.12 },
  stadium: { type: "roundRect", radius: 0.5 },
  circle: { type: "ellipse" },
  decision: { type: "flowChartDecision" },
  hexagon: { type: "hexagon" },
  database: { type: "flowChartMagneticDrum" },
  io: { type: "flowChartInputOutput" },
  "io-alt": { type: "flowChartInputOutput" },
  subroutine: { type: "flowChartPredefinedProcess" },
  flag: { type: "homePlate" },
};

/**
 * Draws a routed diagram into the slide's content area, scaled to fit. Every
 * box, line, and arrowhead is a real shape, so the presenter can move them.
 */
function drawDiagram(
  page: PptxSlide,
  layout: RoutedDiagram,
  colours: Palette,
  top: number,
): void {
  const areaH = SLIDE_H - top - 0.35;
  if (layout.width === 0 || layout.height === 0) return;

  const scale = Math.min(CONTENT_W / layout.width, areaH / layout.height);
  // Centre whatever the scale leaves over, so the diagram sits in the slide
  // rather than in the corner of its bounding box.
  const offsetX = MARGIN + (CONTENT_W - layout.width * scale) / 2;
  const offsetY = top + (areaH - layout.height * scale) / 2;
  const at = (point: Point) => ({
    x: offsetX + point.x * scale,
    y: offsetY + point.y * scale,
  });

  for (const group of layout.groups) {
    const origin = at(group);
    page.addShape("roundRect", {
      x: origin.x,
      y: origin.y,
      w: group.width * scale,
      h: group.height * scale,
      rectRadius: 0.03,
      fill: { type: "none" },
      line: { color: colours.muted, width: 0.75, dashType: "dash" },
    });
    page.addText(group.label.toUpperCase(), {
      x: origin.x + 0.06,
      y: origin.y + 0.03,
      w: group.width * scale - 0.12,
      h: 0.18,
      fontFace: SANS,
      fontSize: 8,
      bold: true,
      color: colours.muted,
    });
  }

  for (const edge of layout.edges) {
    const colour = hex(edgeColour(edge.style, colours.theme));
    for (let i = 0; i < edge.points.length - 1; i++) {
      const from = at(edge.points[i]);
      const to = at(edge.points[i + 1]);
      const last = i === edge.points.length - 2;
      page.addShape("line", {
        x: Math.min(from.x, to.x),
        y: Math.min(from.y, to.y),
        w: Math.abs(to.x - from.x),
        h: Math.abs(to.y - from.y),
        // A shape's width and height cannot be negative, so a segment that runs
        // right-to-left or bottom-to-top is drawn flipped instead.
        flipH: to.x < from.x,
        flipV: to.y < from.y,
        line: {
          color: colour,
          width: edge.style === "thick" ? 2 : 1.25,
          dashType: edge.style === "dotted" ? "dash" : "solid",
          ...(last && edge.arrow ? { endArrowType: "triangle" as const } : {}),
        },
      });
    }
    if (edge.label && edge.labelAt) {
      const at_ = at(edge.labelAt);
      const width = Math.max(0.4, edge.label.length * 0.075);
      page.addText(edge.label, {
        x: at_.x - width / 2,
        y: at_.y - 0.1,
        w: width,
        h: 0.2,
        fontFace: SANS,
        fontSize: 9,
        color: colours.muted,
        align: "center",
        valign: "middle",
        fill: { color: colours.background },
      });
    }
  }

  for (const node of layout.nodes) {
    const origin = at(node);
    const shape = PPTX_SHAPE[node.shape];
    const accent = hex(accentFor(node.shape, colours.theme));
    page.addShape(shape.type as Parameters<PptxSlide["addShape"]>[0], {
      x: origin.x,
      y: origin.y,
      w: node.width * scale,
      h: node.height * scale,
      ...(shape.radius !== undefined ? { rectRadius: shape.radius } : {}),
      fill: { color: colours.surface },
      line: { color: accent, width: 1.25 },
    });
    page.addText(measureNode(node).lines.join("\n"), {
      x: origin.x,
      y: origin.y,
      w: node.width * scale,
      h: node.height * scale,
      fontFace: SANS,
      fontSize: Math.max(7, Math.round(11 * scale * 1.6)),
      color: colours.text,
      align: "center",
      valign: "middle",
    });
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Builds a .pptx file for `deck` and returns it as a buffer. */
export async function deckToPptx(deck: Deck, theme: DeckTheme): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "LOOM_16x9", width: SLIDE_W, height: SLIDE_H });
  pptx.layout = "LOOM_16x9";
  pptx.title = deck.title;
  pptx.author = "Loom";

  const colours = palette(theme);
  for (const slide of deck.slides) {
    renderSlide(pptx, slide, colours);
  }

  const output = await pptx.write({ outputType: "nodebuffer" });
  return output as Buffer;
}
