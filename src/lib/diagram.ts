/**
 * Flowcharts, from Mermaid text.
 *
 * The source of truth for a diagram is Mermaid `flowchart` source: models write
 * it well, humans can edit it, and it survives outside Loom. This module turns
 * that text into a typed graph and lays the graph out with dagre.
 *
 * Both halves are pure and dependency-light on purpose. The React Flow renderer
 * and the PowerPoint exporter call the *same* parse + layout, so an exported
 * deck matches what was on screen instead of merely resembling it.
 */

import dagre from "dagre";

/** Node outlines Mermaid can express, and that we know how to draw. */
export type NodeShape =
  | "process" // [text]      rectangle
  | "rounded" // (text)      rounded rectangle / terminator
  | "stadium" // ([text])    pill
  | "subroutine" // [[text]] framed rectangle
  | "database" // [(text)]   cylinder
  | "circle" // ((text))     circle
  | "decision" // {text}     diamond
  | "hexagon" // {{text}}    hexagon
  | "io" // [/text/]         parallelogram
  | "io-alt" // [\text\]     reverse parallelogram
  | "flag"; // >text]        asymmetric

/** How an edge is drawn between two nodes. */
export type EdgeStyle = "solid" | "thick" | "dotted";

export type Direction = "TB" | "BT" | "LR" | "RL";

export interface DiagramNode {
  id: string;
  label: string;
  shape: NodeShape;
  /** Innermost subgraph this node was declared in, if any. */
  group?: string;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  style: EdgeStyle;
  /** False for the `---` family, which draws a plain line with no arrowhead. */
  arrow: boolean;
}

export interface DiagramGroup {
  id: string;
  label: string;
}

export interface DiagramSpec {
  title?: string;
  direction: Direction;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
}

export interface ParseWarning {
  line: number;
  message: string;
}

export interface ParseResult {
  spec: DiagramSpec;
  warnings: ParseWarning[];
}

const MAX_NODES = 200;
const MAX_EDGES = 400;
const LABEL_MAX = 160;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Opening delimiter → [closing delimiter, shape]. Longest opener wins, so order matters. */
const SHAPES: [string, string, NodeShape][] = [
  ["([", "])", "stadium"],
  ["[[", "]]", "subroutine"],
  ["[(", ")]", "database"],
  ["[/", "/]", "io"],
  ["[\\", "\\]", "io-alt"],
  ["((", "))", "circle"],
  ["{{", "}}", "hexagon"],
  ["[", "]", "process"],
  ["(", ")", "rounded"],
  ["{", "}", "decision"],
  [">", "]", "flag"],
];

/** Link forms, tried in order — labelled variants must precede their bare forms. */
const LINKS: { re: RegExp; style: EdgeStyle; arrow: boolean; labelled: boolean }[] = [
  { re: /^-{2,}\s*([^->|][^-]*?)\s*-{2,}>/, style: "solid", arrow: true, labelled: true },
  {
    re: /^-{2,}\s*([^->|][^-]*?)\s*-{2,}(?!-)/,
    style: "solid",
    arrow: false,
    labelled: true,
  },
  { re: /^-\.\s*([^.]*?)\s*\.-+>/, style: "dotted", arrow: true, labelled: true },
  { re: /^={2,}\s*([^=>|][^=]*?)\s*={2,}>/, style: "thick", arrow: true, labelled: true },
  { re: /^-\.-*>/, style: "dotted", arrow: true, labelled: false },
  { re: /^-\.-+/, style: "dotted", arrow: false, labelled: false },
  { re: /^={2,}>/, style: "thick", arrow: true, labelled: false },
  { re: /^={2,}/, style: "thick", arrow: false, labelled: false },
  { re: /^-{2,}>/, style: "solid", arrow: true, labelled: false },
  { re: /^-{3,}/, style: "solid", arrow: false, labelled: false },
];

/** Statements that carry styling or config we render our own way, and so skip. */
const IGNORED =
  /^(classDef|class|style|linkStyle|click|%%|direction\b|accTitle|accDescr)/;

const ID_CHARS = /[A-Za-z0-9_.-]/;

function clean(text: string): string {
  const unquoted = text
    .trim()
    .replace(/^"([\s\S]*)"$/, "$1")
    .replace(/^'([\s\S]*)'$/, "$1");
  // Mermaid writes hard breaks as <br>; keep them as real newlines for layout.
  return unquoted
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .trim()
    .slice(0, LABEL_MAX);
}

/** Splits a line into statements on `;`, respecting bracket and quote nesting. */
function splitStatements(line: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if ("[({".includes(ch)) {
      depth++;
    } else if ("])}".includes(ch)) {
      depth = Math.max(0, depth - 1);
    } else if (ch === ";" && depth === 0) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

interface NodeRef {
  ids: string[];
  end: number;
}

/**
 * Reads one side of a link: an id with an optional shape, or several joined by
 * `&`. Declares any node it has not seen before. Returns null when the text at
 * `start` is not a node reference at all.
 */
function readNodeRefs(
  text: string,
  start: number,
  declare: (id: string, label: string | null, shape: NodeShape | null) => void,
): NodeRef | null {
  const ids: string[] = [];
  let i = start;

  for (;;) {
    while (i < text.length && text[i] === " ") i++;
    const idStart = i;
    while (i < text.length && ID_CHARS.test(text[i])) i++;
    const id = text.slice(idStart, i);
    if (!id) {
      return ids.length > 0 ? { ids, end: i } : null;
    }

    let label: string | null = null;
    let shape: NodeShape | null = null;
    for (const [open, close, kind] of SHAPES) {
      if (!text.startsWith(open, i)) continue;
      const closeAt = text.indexOf(close, i + open.length);
      if (closeAt === -1) continue;
      label = clean(text.slice(i + open.length, closeAt));
      shape = kind;
      i = closeAt + close.length;
      break;
    }
    declare(id, label, shape);
    ids.push(id);

    while (i < text.length && text[i] === " ") i++;
    if (text[i] === "&") {
      i++;
      continue;
    }
    return { ids, end: i };
  }
}

function parseDirection(value: string): Direction | null {
  const upper = value.trim().toUpperCase();
  if (upper === "TD" || upper === "TB") return "TB";
  if (upper === "BT" || upper === "LR" || upper === "RL") return upper;
  return null;
}

/**
 * Parses Mermaid `flowchart` / `graph` source into a spec. Unparseable lines are
 * reported as warnings rather than thrown — a diagram that is 90% right is far
 * more useful than an error, especially when a local model wrote the source.
 */
export function parseDiagram(source: string): ParseResult {
  const spec: DiagramSpec = { direction: "TB", nodes: [], edges: [], groups: [] };
  const warnings: ParseWarning[] = [];
  const byId = new Map<string, DiagramNode>();
  const groupStack: string[] = [];
  const seenGroups = new Set<string>();
  let edgeSeq = 0;

  const declare = (id: string, label: string | null, shape: NodeShape | null) => {
    const existing = byId.get(id);
    if (existing) {
      // A later mention with a shape wins: `A --> B` then `B[Real label]`.
      if (label !== null) existing.label = label;
      if (shape !== null) existing.shape = shape;
      return;
    }
    if (byId.size >= MAX_NODES) return;
    const node: DiagramNode = {
      id,
      label: label ?? id,
      shape: shape ?? "process",
      group: groupStack[groupStack.length - 1],
    };
    byId.set(id, node);
    spec.nodes.push(node);
  };

  const lines = source.split(/\r?\n/);
  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    const raw = lines[lineNo];
    const stripped = raw.replace(/%%.*$/, "").trim();
    if (!stripped) continue;

    for (const statement of splitStatements(stripped)) {
      const header = /^(?:flowchart|graph)\s+([A-Za-z]{2})?/i.exec(statement);
      if (header) {
        const dir = header[1] ? parseDirection(header[1]) : null;
        if (dir) spec.direction = dir;
        continue;
      }
      if (/^end$/i.test(statement)) {
        groupStack.pop();
        continue;
      }
      const sub = /^subgraph\s+(.+)$/i.exec(statement);
      if (sub) {
        // `subgraph id[Label]` or plain `subgraph Label`.
        const withLabel = /^([A-Za-z0-9_.-]+)\s*[[("]/.exec(sub[1]);
        let id = sub[1].trim();
        let label = id;
        if (withLabel) {
          id = withLabel[1];
          const inner = /[[("]+(.*?)[\])"]+\s*$/.exec(sub[1]);
          label = inner ? clean(inner[1]) : id;
        } else {
          label = clean(id);
          id = label.replace(/\s+/g, "_");
        }
        if (!seenGroups.has(id)) {
          seenGroups.add(id);
          spec.groups.push({ id, label });
        }
        groupStack.push(id);
        continue;
      }
      if (IGNORED.test(statement)) continue;

      parseStatement(statement, lineNo + 1);
    }
  }

  function parseStatement(statement: string, lineNo: number) {
    let cursor = 0;
    let left = readNodeRefs(statement, cursor, declare);
    if (!left) {
      warnings.push({
        line: lineNo,
        message: `Could not read "${statement.slice(0, 60)}".`,
      });
      return;
    }
    cursor = left.end;

    // A bare node declaration (`A[Start]`) is complete once it has been declared.
    let linked = false;
    for (;;) {
      const rest = statement.slice(cursor);
      const trimmed = rest.trimStart();
      if (!trimmed) break;
      const lead = rest.length - trimmed.length;

      const link = LINKS.map((l) => ({ l, m: l.re.exec(trimmed) })).find((x) => x.m);
      if (!link || !link.m) {
        if (!linked) {
          warnings.push({
            line: lineNo,
            message: `Unrecognized link in "${statement.slice(0, 60)}".`,
          });
        }
        return;
      }

      cursor += lead + link.m[0].length;
      let label = link.l.labelled ? clean(link.m[1] ?? "") : "";

      // `-->|Yes|` — the pipe form attaches its label after the arrow.
      const pipe = /^\s*\|([^|]*)\|/.exec(statement.slice(cursor));
      if (pipe) {
        label = clean(pipe[1]);
        cursor += pipe[0].length;
      }

      const right = readNodeRefs(statement, cursor, declare);
      if (!right) {
        warnings.push({
          line: lineNo,
          message: `Link with no target in "${statement.slice(0, 60)}".`,
        });
        return;
      }
      cursor = right.end;

      for (const source of left.ids) {
        for (const target of right.ids) {
          if (spec.edges.length >= MAX_EDGES) break;
          if (!byId.has(source) || !byId.has(target)) continue;
          spec.edges.push({
            id: `e${edgeSeq++}`,
            source,
            target,
            label: label || undefined,
            style: link.l.style,
            arrow: link.l.arrow,
          });
        }
      }
      linked = true;
      left = right;
    }
  }

  // Drop subgraphs whose members all vanished, so nothing renders an empty box.
  const usedGroups = new Set(spec.nodes.map((n) => n.group).filter(Boolean));
  spec.groups = spec.groups.filter((g) => usedGroups.has(g.id));

  return { spec, warnings };
}

// ---------------------------------------------------------------------------
// Serializing
// ---------------------------------------------------------------------------

const SHAPE_WRAP: Record<NodeShape, [string, string]> = {
  process: ["[", "]"],
  rounded: ["(", ")"],
  stadium: ["([", "])"],
  subroutine: ["[[", "]]"],
  database: ["[(", ")]"],
  circle: ["((", "))"],
  decision: ["{", "}"],
  hexagon: ["{{", "}}"],
  io: ["[/", "/]"],
  "io-alt": ["[\\", "\\]"],
  flag: [">", "]"],
};

function quoteLabel(label: string): string {
  return `"${label.replace(/"/g, "&quot;").replace(/\n/g, "<br>")}"`;
}

/** Renders a spec back to Mermaid source — the inverse of `parseDiagram`. */
export function serializeDiagram(spec: DiagramSpec): string {
  const lines = [`flowchart ${spec.direction}`];
  const emitted = new Set<string>();

  const emitNode = (node: DiagramNode, indent: string) => {
    const [open, close] = SHAPE_WRAP[node.shape];
    lines.push(`${indent}${node.id}${open}${quoteLabel(node.label)}${close}`);
    emitted.add(node.id);
  };

  for (const group of spec.groups) {
    const members = spec.nodes.filter((n) => n.group === group.id);
    if (members.length === 0) continue;
    lines.push(`  subgraph ${group.id}[${quoteLabel(group.label)}]`);
    for (const node of members) emitNode(node, "    ");
    lines.push("  end");
  }
  for (const node of spec.nodes) {
    if (!emitted.has(node.id)) emitNode(node, "  ");
  }

  for (const edge of spec.edges) {
    const arrow =
      edge.style === "dotted" ? "-.->" : edge.style === "thick" ? "==>" : "-->";
    const open = edge.arrow ? arrow : arrow.replace(">", "-");
    const label = edge.label ? `|${edge.label.replace(/\|/g, "/")}|` : "";
    lines.push(`  ${edge.source} ${open}${label} ${edge.target}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface PlacedNode extends DiagramNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacedGroup extends DiagramGroup {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiagramLayout {
  nodes: PlacedNode[];
  groups: PlacedGroup[];
  width: number;
  height: number;
}

/** Font metrics the size estimate assumes; the renderer must match these. */
export const NODE_FONT_PX = 13;
const CHAR_WIDTH = NODE_FONT_PX * 0.58;
const LINE_HEIGHT = 18;
const MIN_WIDTH = 108;
const MAX_WIDTH = 260;
const PAD_X = 28;
const PAD_Y = 22;
const GROUP_PAD = 22;
const GROUP_HEADER = 20;

/** Greedily wraps a label to the widest line the box allows. */
export function wrapLabel(label: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const paragraph of label.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (!line) {
        line = word;
      } else if (line.length + word.length + 1 <= maxChars) {
        line += ` ${word}`;
      } else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out.length > 0 ? out : [""];
}

/**
 * Estimates a node's box from its label. Server and client both call this, so a
 * diagram exported to PowerPoint keeps the proportions it had on screen.
 */
export function measureNode(node: DiagramNode): {
  width: number;
  height: number;
  lines: string[];
} {
  const maxChars = Math.floor((MAX_WIDTH - PAD_X) / CHAR_WIDTH);
  const lines = wrapLabel(node.label, maxChars);
  const longest = Math.max(...lines.map((l) => l.length), 1);

  let width = Math.min(
    MAX_WIDTH,
    Math.max(MIN_WIDTH, Math.round(longest * CHAR_WIDTH) + PAD_X),
  );
  let height = lines.length * LINE_HEIGHT + PAD_Y;

  // Diamonds and circles waste their corners, so they need room around the text.
  if (node.shape === "decision") {
    width = Math.round(width * 1.45);
    height = Math.round(height * 1.7);
  } else if (node.shape === "circle") {
    const side = Math.max(width, height) + 16;
    width = side;
    height = side;
  } else if (node.shape === "hexagon" || node.shape === "io" || node.shape === "io-alt") {
    width += 26;
  } else if (node.shape === "database") {
    height += 14;
  }
  return { width, height, lines };
}

/**
 * Places nodes with dagre and derives a bounding box for each subgraph from the
 * members it ended up containing. Groups are drawn, not enforced — dagre keeps
 * connected nodes together, which is what real flowchart subgraphs look like.
 */
export function layoutDiagram(spec: DiagramSpec): DiagramLayout {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  const horizontal = spec.direction === "LR" || spec.direction === "RL";
  g.setGraph({
    rankdir: spec.direction,
    nodesep: horizontal ? 44 : 56,
    ranksep: horizontal ? 90 : 66,
    marginx: 24,
    marginy: 24,
  });

  const sizes = new Map<string, { width: number; height: number }>();
  for (const node of spec.nodes) {
    const { width, height } = measureNode(node);
    sizes.set(node.id, { width, height });
    g.setNode(node.id, { width, height });
  }
  for (const edge of spec.edges) {
    if (!sizes.has(edge.source) || !sizes.has(edge.target)) continue;
    // Labelled edges need a longer span so the text does not sit on a node.
    g.setEdge(edge.source, edge.target, {
      minlen: edge.label ? 1 : 1,
      width: 0,
      height: 0,
    });
  }
  dagre.layout(g);

  const nodes: PlacedNode[] = spec.nodes.map((node) => {
    const placed = g.node(node.id);
    const size = sizes.get(node.id) ?? { width: MIN_WIDTH, height: 40 };
    return {
      ...node,
      width: size.width,
      height: size.height,
      x: (placed?.x ?? 0) - size.width / 2,
      y: (placed?.y ?? 0) - size.height / 2,
    };
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const groups: PlacedGroup[] = [];
  for (const group of spec.groups) {
    const members = spec.nodes
      .filter((n) => n.group === group.id)
      .flatMap((n) => byId.get(n.id) ?? []);
    if (members.length === 0) continue;
    const x = Math.min(...members.map((m) => m.x)) - GROUP_PAD;
    const y = Math.min(...members.map((m) => m.y)) - GROUP_PAD - GROUP_HEADER;
    const right = Math.max(...members.map((m) => m.x + m.width)) + GROUP_PAD;
    const bottom = Math.max(...members.map((m) => m.y + m.height)) + GROUP_PAD;
    groups.push({ ...group, x, y, width: right - x, height: bottom - y });
  }

  // Groups can reach above or left of the nodes, so normalize to a (0,0) origin.
  // Positions round to whole pixels: dagre's halves buy nothing and every
  // consumer (SVG, PowerPoint, the DOM) reads cleaner without them.
  const boxes = [...nodes, ...groups];
  const minX = boxes.length > 0 ? Math.min(...boxes.map((b) => b.x)) : 0;
  const minY = boxes.length > 0 ? Math.min(...boxes.map((b) => b.y)) : 0;
  for (const box of boxes) {
    box.x = Math.round(box.x - minX);
    box.y = Math.round(box.y - minY);
  }

  return {
    nodes,
    groups,
    width: boxes.length > 0 ? Math.max(...boxes.map((b) => b.x + b.width)) : 0,
    height: boxes.length > 0 ? Math.max(...boxes.map((b) => b.y + b.height)) : 0,
  };
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

export interface RoutedEdge extends DiagramEdge {
  /** Orthogonal waypoints from the source's border to the target's. */
  points: Point[];
  /** Where the edge's label sits, when it has one. */
  labelAt?: Point;
}

export interface RoutedDiagram extends DiagramLayout {
  edges: RoutedEdge[];
}

/** How far a loop-back edge stands off from the boxes it routes around. */
const LANE_GAP = 28;

/**
 * Spreads each node's edges across the side they share, ordered by `position`
 * so the lines fan out without crossing. Returns edge id → fraction of the side.
 */
function slotsBy<T extends { edge: DiagramEdge }>(
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

export type Side = "top" | "bottom" | "left" | "right";

/**
 * The point on a node's *outline* — not its bounding box — where an edge should
 * attach, `fraction` of the way along `side`.
 *
 * This matters for the shapes that narrow. A decision's bounding box is much
 * wider than the diamond at the height where a second branch leaves it, so
 * attaching to the box leaves the line visibly floating in space next to the
 * shape. Diamonds and ellipses are solved exactly; the shapes with a chamfer
 * (hexagon, the parallelograms, the flag) just keep their attachment inside the
 * flat part of the side.
 */
export function attachPoint(node: PlacedNode, side: Side, fraction: number): Point {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const halfW = node.width / 2;
  const halfH = node.height / 2;
  const vertical = side === "top" || side === "bottom";
  const sign = side === "bottom" || side === "right" ? 1 : -1;

  // How far in from the corners the outline is still flat, as a fraction.
  const chamfer = chamferOf(node.shape, vertical ? node.width : node.height);
  const clamped = Math.min(1 - chamfer, Math.max(chamfer, fraction));

  if (vertical) {
    const x = node.x + node.width * clamped;
    const inset = taper(node.shape, Math.abs(x - cx) / halfW);
    return { x, y: cy + sign * halfH * inset };
  }
  const y = node.y + node.height * clamped;
  const inset = taper(node.shape, Math.abs(y - cy) / halfH);
  return { x: cx + sign * halfW * inset, y };
}

/**
 * How far out the outline still reaches, as a fraction of the half-extent, at
 * `offset` (0 at the centre line, 1 at the corner of the bounding box).
 */
function taper(shape: NodeShape, offset: number): number {
  const clamped = Math.min(1, Math.max(0, offset));
  if (shape === "decision") return 1 - clamped;
  if (shape === "circle") return Math.sqrt(Math.max(0, 1 - clamped * clamped));
  return 1;
}

/** The fraction of a side lost to a chamfer, so attachments stay on the flat. */
function chamferOf(shape: NodeShape, extent: number): number {
  if (shape === "hexagon" || shape === "io" || shape === "io-alt" || shape === "flag") {
    return Math.min(0.4, 20 / Math.max(1, extent));
  }
  if (shape === "stadium" || shape === "rounded") {
    return 0.12;
  }
  return 0.02;
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
  if (!forward) {
    // Against the flow: out one side of both boxes and back in, clear of them.
    const side: Side = vertical ? "right" : "bottom";
    const from = attachPoint(source, side, 0.5);
    const to = attachPoint(target, side, 0.5);
    const lane = vertical
      ? Math.max(source.x + source.width, target.x + target.width) + LANE_GAP
      : Math.max(source.y + source.height, target.y + target.height) + LANE_GAP;
    return vertical
      ? [from, { x: lane, y: from.y }, { x: lane, y: to.y }, to]
      : [from, { x: from.x, y: lane }, { x: to.x, y: lane }, to];
  }

  const exitSide: Side = vertical
    ? reversed
      ? "top"
      : "bottom"
    : reversed
      ? "left"
      : "right";
  const entrySide: Side = vertical
    ? reversed
      ? "bottom"
      : "top"
    : reversed
      ? "right"
      : "left";
  const from = attachPoint(source, exitSide, exit);
  const to = attachPoint(target, entrySide, entry);

  if (vertical) {
    if (Math.abs(from.x - to.x) < 2) {
      return [from, { x: from.x, y: to.y }];
    }
    // The dog-leg turns halfway between the two boxes, not between the two
    // attachment points, so a tapered shape does not drag the corner inwards.
    const mid = reversed
      ? (source.y + (target.y + target.height)) / 2
      : (source.y + source.height + target.y) / 2;
    return [from, { x: from.x, y: mid }, { x: to.x, y: mid }, to];
  }

  if (Math.abs(from.y - to.y) < 2) {
    return [from, { x: to.x, y: from.y }];
  }
  const mid = reversed
    ? (source.x + (target.x + target.width)) / 2
    : (source.x + source.width + target.x) / 2;
  return [from, { x: mid, y: from.y }, { x: mid, y: to.y }, to];
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
  const index = Math.floor(points.length / 2);
  const mid = points[index];
  const prev = points[Math.max(0, index - 1)];
  return { x: (mid.x + prev.x) / 2, y: (mid.y + prev.y) / 2 };
}

/**
 * Lays a diagram out and routes every edge. This is the one place that decides
 * where anything goes: the SVG renderer and the PowerPoint exporter both draw
 * from this result, so an exported deck matches the screen rather than
 * approximating it.
 */
export function routeDiagram(spec: DiagramSpec): RoutedDiagram {
  const layout = layoutDiagram(spec);
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));
  const vertical = spec.direction === "TB" || spec.direction === "BT";
  const reversed = spec.direction === "BT" || spec.direction === "RL";

  // Direction is decided first: only forward edges take a slot on a facing side.
  const routable = spec.edges.flatMap((edge) => {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target || source === target) return [];
    const along = vertical
      ? target.y + target.height / 2 - (source.y + source.height / 2)
      : target.x + target.width / 2 - (source.x + source.width / 2);
    return [{ edge, source, target, forward: reversed ? along < 0 : along > 0 }];
  });

  const across = (node: PlacedNode) =>
    vertical ? node.x + node.width / 2 : node.y + node.height / 2;
  const forwards = routable.filter((item) => item.forward);
  const exits = slotsBy(
    forwards,
    (item) => item.edge.source,
    (item) => across(item.target),
  );
  const entries = slotsBy(
    forwards,
    (item) => item.edge.target,
    (item) => across(item.source),
  );

  const edges: RoutedEdge[] = routable.map(({ edge, source, target, forward }) => {
    const points = routeEdge(
      source,
      target,
      vertical,
      reversed,
      forward,
      exits.get(edge.id) ?? 0.5,
      entries.get(edge.id) ?? 0.5,
    );
    return { ...edge, points, labelAt: edge.label ? labelPoint(points) : undefined };
  });

  return { ...layout, edges };
}

/** True when the source has at least one node — i.e. something worth rendering. */
export function hasContent(spec: DiagramSpec): boolean {
  return spec.nodes.length > 0;
}
