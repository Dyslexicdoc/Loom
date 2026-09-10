/**
 * Renders a flowchart to standalone SVG.
 *
 * The React Flow view in `components/diagrams` is the interactive one; this is
 * the portable one. It has no DOM and no CSS-variable dependencies, so the same
 * function serves file export, slide rendering, and print — and because it
 * shares `layoutDiagram`, all three agree on where every box sits.
 */

import {
  layoutDiagram,
  measureNode,
  NODE_FONT_PX,
  type DiagramSpec,
  type NodeShape,
  type PlacedNode,
} from "./diagram";

export interface SvgTheme {
  background: string;
  text: string;
  muted: string;
  /** Node fill, behind the outline. */
  surface: string;
  /** Per-role outline colours; see `accentFor`. */
  step: string;
  terminal: string;
  decision: string;
  data: string;
  call: string;
}

export const SVG_THEMES: Record<"neon" | "slate" | "paper", SvgTheme> = {
  neon: {
    background: "#0b0b12",
    text: "#e8e8f0",
    muted: "#9aa0b4",
    surface: "#14141f",
    step: "#00f0ff",
    terminal: "#00ff9f",
    decision: "#ffe600",
    data: "#7b2ff7",
    call: "#ff2e97",
  },
  slate: {
    background: "#111827",
    text: "#f1f5f9",
    muted: "#94a3b8",
    surface: "#1e293b",
    step: "#38bdf8",
    terminal: "#34d399",
    decision: "#fbbf24",
    data: "#a78bfa",
    call: "#f472b6",
  },
  paper: {
    background: "#ffffff",
    text: "#111827",
    muted: "#6b7280",
    surface: "#f8fafc",
    step: "#0369a1",
    terminal: "#047857",
    decision: "#b45309",
    data: "#6d28d9",
    call: "#be185d",
  },
};

function accentFor(shape: NodeShape, theme: SvgTheme): string {
  switch (shape) {
    case "rounded":
    case "stadium":
    case "circle":
      return theme.terminal;
    case "decision":
    case "hexagon":
      return theme.decision;
    case "database":
    case "io":
    case "io-alt":
      return theme.data;
    case "subroutine":
    case "flag":
      return theme.call;
    default:
      return theme.step;
  }
}

const SKEW = 16;
const FONT =
  "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const LINE_HEIGHT = 18;
/** How far a loop-back edge stands off from the boxes it routes around. */
const LANE_GAP = 28;
const CORNER = 8;

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The outline path for one node, as an SVG element string. */
function shapeElement(node: PlacedNode, theme: SvgTheme): string {
  const { x, y, width: w, height: h, shape } = node;
  const stroke = accentFor(shape, theme);
  const attrs = `fill="${theme.surface}" stroke="${stroke}" stroke-width="1.5"`;

  switch (shape) {
    case "rounded":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" ${attrs}/>`;
    case "stadium":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" ${attrs}/>`;
    case "circle":
      return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${attrs}/>`;
    case "decision":
      return `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" ${attrs}/>`;
    case "hexagon":
      return `<polygon points="${x + SKEW},${y} ${x + w - SKEW},${y} ${x + w},${y + h / 2} ${x + w - SKEW},${y + h} ${x + SKEW},${y + h} ${x},${y + h / 2}" ${attrs}/>`;
    case "io":
      return `<polygon points="${x + SKEW},${y} ${x + w},${y} ${x + w - SKEW},${y + h} ${x},${y + h}" ${attrs}/>`;
    case "io-alt":
      return `<polygon points="${x},${y} ${x + w - SKEW},${y} ${x + w},${y + h} ${x + SKEW},${y + h}" ${attrs}/>`;
    case "flag":
      return `<polygon points="${x},${y} ${x + w - SKEW},${y} ${x + w},${y + h / 2} ${x + w - SKEW},${y + h} ${x},${y + h}" ${attrs}/>`;
    case "subroutine":
      return (
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" ${attrs}/>` +
        `<line x1="${x + 9}" y1="${y}" x2="${x + 9}" y2="${y + h}" stroke="${stroke}" stroke-width="1.2"/>` +
        `<line x1="${x + w - 9}" y1="${y}" x2="${x + w - 9}" y2="${y + h}" stroke="${stroke}" stroke-width="1.2"/>`
      );
    case "database": {
      const lip = 9;
      return (
        `<path d="M ${x} ${y + lip} a ${w / 2} ${lip} 0 0 1 ${w} 0 v ${h - lip * 2} a ${w / 2} ${lip} 0 0 1 ${-w} 0 z" ${attrs}/>` +
        `<path d="M ${x} ${y + lip} a ${w / 2} ${lip} 0 0 0 ${w} 0" fill="none" stroke="${stroke}" stroke-width="1.2"/>`
      );
    }
    default:
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" ${attrs}/>`;
  }
}

function labelElement(node: PlacedNode, theme: SvgTheme): string {
  const { lines } = measureNode(node);
  const cx = node.x + node.width / 2;
  const top = node.y + node.height / 2 - ((lines.length - 1) * LINE_HEIGHT) / 2;
  const tspans = lines
    .map((line, i) => `<tspan x="${cx}" y="${top + i * LINE_HEIGHT}">${esc(line)}</tspan>`)
    .join("");
  return (
    `<text text-anchor="middle" dominant-baseline="central" font-family="${FONT}" ` +
    `font-size="${NODE_FONT_PX}" font-weight="500" fill="${theme.text}">${tspans}</text>`
  );
}

interface Point {
  x: number;
  y: number;
}

/** Joins waypoints into a path with rounded corners. */
function roundedPath(points: Point[]): string {
  if (points.length < 2) return "";
  const parts = [`M ${r(points[0].x)} ${r(points[0].y)}`];
  for (let i = 1; i < points.length - 1; i++) {
    const [prev, corner, next] = [points[i - 1], points[i], points[i + 1]];
    const inLen = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const outLen = Math.hypot(next.x - corner.x, next.y - corner.y);
    const radius = Math.min(CORNER, inLen / 2, outLen / 2);
    if (radius < 1) {
      parts.push(`L ${r(corner.x)} ${r(corner.y)}`);
      continue;
    }
    const before = {
      x: corner.x + ((prev.x - corner.x) / inLen) * radius,
      y: corner.y + ((prev.y - corner.y) / inLen) * radius,
    };
    const after = {
      x: corner.x + ((next.x - corner.x) / outLen) * radius,
      y: corner.y + ((next.y - corner.y) / outLen) * radius,
    };
    parts.push(
      `L ${r(before.x)} ${r(before.y)}`,
      `Q ${r(corner.x)} ${r(corner.y)} ${r(after.x)} ${r(after.y)}`,
    );
  }
  const last = points[points.length - 1];
  parts.push(`L ${r(last.x)} ${r(last.y)}`);
  return parts.join(" ");
}

/** Rounds to a tenth of a pixel — enough precision, far less noise in the file. */
function r(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Spreads each node's edges across the side they share, ordered by `position` so
 * the lines fan out without crossing. Returns edge id → fraction of that side.
 */
function slotsBy<T extends { edge: { id: string } }>(
  items: T[],
  keyOf: (item: T) => string,
  position: (item: T) => number,
): Map<string, number> {
  const byNode = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = byNode.get(key);
    if (list) list.push(item);
    else byNode.set(key, [item]);
  }
  const out = new Map<string, number>();
  for (const list of byNode.values()) {
    const ordered = [...list].sort((a, b) => position(a) - position(b));
    for (const [index, item] of ordered.entries()) {
      out.set(item.edge.id, (index + 1) / (ordered.length + 1));
    }
  }
  return out;
}

/**
 * Routes one edge orthogonally. Forward edges take the short way between the
 * facing sides; an edge running back against the flow gets its own lane clear of
 * both boxes, the way a hand-drawn flowchart loops back.
 *
 * `exit` and `entry` spread the attachment points across each side, so the three
 * branches out of a decision leave from three places rather than piling onto one.
 */
function routeEdge(
  source: PlacedNode,
  target: PlacedNode,
  vertical: boolean,
  reversed: boolean,
  forward: boolean,
  exit: number,
  entry: number,
): Point[] {
  const sMid = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const tMid = { x: target.x + target.width / 2, y: target.y + target.height / 2 };

  if (vertical) {
    if (forward) {
      const sx = source.x + source.width * exit;
      const tx = target.x + target.width * entry;
      const sy = reversed ? source.y : source.y + source.height;
      const ty = reversed ? target.y + target.height : target.y;
      if (Math.abs(sx - tx) < 2) {
        return [
          { x: sx, y: sy },
          { x: sx, y: ty },
        ];
      }
      const mid = (sy + ty) / 2;
      return [
        { x: sx, y: sy },
        { x: sx, y: mid },
        { x: tx, y: mid },
        { x: tx, y: ty },
      ];
    }
    const lane = Math.max(source.x + source.width, target.x + target.width) + LANE_GAP;
    return [
      { x: source.x + source.width, y: sMid.y },
      { x: lane, y: sMid.y },
      { x: lane, y: tMid.y },
      { x: target.x + target.width, y: tMid.y },
    ];
  }

  if (forward) {
    const sy = source.y + source.height * exit;
    const ty = target.y + target.height * entry;
    const sx = reversed ? source.x : source.x + source.width;
    const tx = reversed ? target.x + target.width : target.x;
    if (Math.abs(sy - ty) < 2) {
      return [
        { x: sx, y: sy },
        { x: tx, y: ty },
      ];
    }
    const mid = (sx + tx) / 2;
    return [
      { x: sx, y: sy },
      { x: mid, y: sy },
      { x: mid, y: ty },
      { x: tx, y: ty },
    ];
  }
  const lane = Math.max(source.y + source.height, target.y + target.height) + LANE_GAP;
  return [
    { x: sMid.x, y: source.y + source.height },
    { x: sMid.x, y: lane },
    { x: tMid.x, y: lane },
    { x: tMid.x, y: target.y + target.height },
  ];
}

/**
 * Anchors an edge label near where the edge leaves its source, which is where a
 * reader looks to tell two branches apart. Falls back to the path midpoint when
 * the first segment is too short to hold it.
 */
function labelPoint(points: Point[]): Point {
  const [first, second] = points;
  if (points.length > 2 && Math.hypot(second.x - first.x, second.y - first.y) >= 26) {
    return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  }
  const mid = points[Math.floor(points.length / 2)];
  const prev = points[Math.max(0, Math.floor(points.length / 2) - 1)];
  return { x: (mid.x + prev.x) / 2, y: (mid.y + prev.y) / 2 };
}

/** A text box with the page colour behind it, so lines never run through words. */
function chip(text: string, at: Point, theme: SvgTheme): string {
  const width = text.length * 6.2 + 10;
  return (
    `<rect x="${r(at.x - width / 2)}" y="${r(at.y - 8.5)}" width="${r(width)}" height="17" rx="3" ` +
    `fill="${theme.background}" opacity="0.94"/>` +
    `<text x="${r(at.x)}" y="${r(at.y)}" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="${FONT}" font-size="11" font-weight="500" fill="${theme.muted}">${esc(text)}</text>`
  );
}

export interface SvgOptions {
  theme?: SvgTheme;
  /** Drawn as a heading above the chart. */
  title?: string;
  /** Painted behind everything; pass false for a transparent background. */
  paintBackground?: boolean;
  padding?: number;
}

/** Renders `spec` as a complete, self-contained SVG document. */
export function diagramToSvg(spec: DiagramSpec, options: SvgOptions = {}): string {
  const theme = options.theme ?? SVG_THEMES.neon;
  const padding = options.padding ?? 24;
  const layout = layoutDiagram(spec);
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const vertical = spec.direction === "TB" || spec.direction === "BT";
  const reversed = spec.direction === "BT" || spec.direction === "RL";

  // Decide direction first: only forward edges take a slot on the facing side.
  const routable = spec.edges.flatMap((edge) => {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target || source === target) return [];
    const along = vertical
      ? target.y + target.height / 2 - (source.y + source.height / 2)
      : target.x + target.width / 2 - (source.x + source.width / 2);
    return [{ edge, source, target, forward: reversed ? along < 0 : along > 0 }];
  });

  // Attachment points are handed out in cross-axis order, not declaration order,
  // so the leftmost branch leaves from the leftmost slot and the lines never
  // cross each other on the way out of a decision.
  const across = (node: PlacedNode) =>
    vertical ? node.x + node.width / 2 : node.y + node.height / 2;
  const exits = slotsBy(
    routable.filter((item) => item.forward),
    (item) => item.edge.source,
    (item) => across(item.target),
  );
  const entries = slotsBy(
    routable.filter((item) => item.forward),
    (item) => item.edge.target,
    (item) => across(item.source),
  );

  const parts: string[] = [];
  if (options.paintBackground !== false) {
    parts.push(`<rect width="100%" height="100%" fill="${theme.background}"/>`);
  }
  if (options.title) {
    parts.push(
      `<text x="${padding}" y="26" font-family="${FONT}" font-size="17" font-weight="700" ` +
        `fill="${theme.text}">${esc(options.title)}</text>`,
    );
  }

  const titleHeight = options.title ? 40 : 0;
  const width = Math.max(layout.width + padding * 2, 200);
  const height = Math.max(layout.height + padding * 2 + titleHeight, 120);
  parts.push(`<g transform="translate(${padding} ${padding + titleHeight})">`);

  for (const group of layout.groups) {
    parts.push(
      `<rect x="${r(group.x)}" y="${r(group.y)}" width="${r(group.width)}" height="${r(group.height)}" ` +
        `rx="8" fill="none" stroke="${theme.muted}" stroke-width="1" stroke-dasharray="5 4" opacity="0.55"/>`,
    );
  }

  const markers = new Map<string, string>();
  for (const { edge, source, target, forward } of routable) {
    const colour =
      edge.style === "thick" ? theme.call : edge.style === "dotted" ? theme.data : theme.step;

    const points = routeEdge(
      source,
      target,
      vertical,
      reversed,
      forward,
      exits.get(edge.id) ?? 0.5,
      entries.get(edge.id) ?? 0.5,
    );
    const dash = edge.style === "dotted" ? ' stroke-dasharray="5 4"' : "";
    const strokeWidth = edge.style === "thick" ? 2.6 : 1.6;

    let marker = "";
    if (edge.arrow) {
      const id = `arrow-${colour.replace(/[^a-z0-9]/gi, "")}`;
      markers.set(
        id,
        `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" ` +
          `orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${colour}"/></marker>`,
      );
      marker = ` marker-end="url(#${id})"`;
    }
    parts.push(
      `<path d="${roundedPath(points)}" fill="none" stroke="${colour}" stroke-width="${strokeWidth}"${dash}${marker}/>`,
    );
    if (edge.label) {
      parts.push(chip(edge.label, labelPoint(points), theme));
    }
  }

  // Group titles sit on top of the lines that cross their box.
  for (const group of layout.groups) {
    const label = group.label.toUpperCase();
    parts.push(
      `<rect x="${r(group.x + 8)}" y="${r(group.y + 5)}" width="${r(label.length * 6.4 + 8)}" height="16" ` +
        `rx="3" fill="${theme.background}" opacity="0.94"/>`,
      `<text x="${r(group.x + 12)}" y="${r(group.y + 13)}" dominant-baseline="central" ` +
        `font-family="${FONT}" font-size="10" font-weight="700" letter-spacing="0.6" ` +
        `fill="${theme.muted}">${esc(label)}</text>`,
    );
  }

  for (const node of layout.nodes) {
    parts.push(shapeElement(node, theme), labelElement(node, theme));
  }
  parts.push("</g>");

  const defs = markers.size > 0 ? `<defs>${[...markers.values()].join("")}</defs>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${r(width)}" height="${r(height)}" ` +
    `viewBox="0 0 ${r(width)} ${r(height)}" role="img">${defs}${parts.join("")}</svg>`
  );
}
