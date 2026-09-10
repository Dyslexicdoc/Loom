/**
 * Decks, from Markdown.
 *
 * A deck's source of truth is a Markdown outline, the same way a diagram's is
 * Mermaid: models write it well, a person can edit it without learning a schema,
 * and it stays useful outside Loom. Slides are separated by `---`, and the
 * layout of each is inferred from what the slide actually contains rather than
 * declared — a slide that is only a table is a table slide, a slide that is only
 * a fenced block of Mermaid is a diagram.
 *
 * Pure and client-safe: the renderer, the present view, and the PowerPoint
 * exporter all parse through here, so none of them can disagree about a deck.
 */

export type SlideLayout =
  | "title"
  | "section"
  | "bullets"
  | "columns"
  | "quote"
  | "code"
  | "diagram"
  | "table"
  | "stats";

export interface Bullet {
  text: string;
  /** Nesting depth, 0 for a top-level point. */
  level: number;
}

export interface Stat {
  value: string;
  label: string;
}

export interface Column {
  heading?: string;
  bullets: Bullet[];
}

interface SlideCommon {
  /** Stable across re-parses of an unchanged deck, so React keys hold. */
  id: string;
  title?: string;
  /** Speaker notes — shown in the present view, exported as PowerPoint notes. */
  notes?: string;
}

export type Slide = SlideCommon &
  (
    | { layout: "title"; subtitle?: string }
    | { layout: "section"; subtitle?: string }
    | { layout: "bullets"; bullets: Bullet[] }
    | { layout: "columns"; columns: [Column, Column] }
    | { layout: "quote"; text: string; attribution?: string }
    | { layout: "code"; language: string; code: string; runnable: boolean }
    | { layout: "diagram"; mermaid: string }
    | { layout: "table"; columns: string[]; rows: string[][] }
    | { layout: "stats"; stats: Stat[] }
  );

export interface Deck {
  title: string;
  slides: Slide[];
}

export const DECK_THEMES = ["neon", "slate", "paper"] as const;
export type DeckTheme = (typeof DECK_THEMES)[number];

export function isTheme(value: string): value is DeckTheme {
  return (DECK_THEMES as readonly string[]).includes(value);
}

const MAX_SLIDES = 60;
const MAX_BULLETS = 10;
const MAX_ROWS = 12;
const MAX_STATS = 4;

/** `**42%** — conversion rate`: the one shape that makes a slide a stats slide. */
const STAT_RE = /^\*\*(.+?)\*\*\s*(?:[—–:-]\s*)?(.*)$/;
const NOTES_RE = /^(?:notes?|speaker notes?)\s*:/i;

interface Block {
  kind: "heading" | "subheading" | "bullet" | "quote" | "code" | "table" | "text";
  text: string;
  level: number;
  /** Code blocks only: the fence's info string, e.g. "js run". */
  info?: string;
}

/**
 * Splits Markdown into slides on `---`, ignoring separators inside fenced code
 * (a Mermaid block can contain them) and the front-matter-looking first line.
 */
function splitSlides(markdown: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;

  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0].repeat(3);
      else if (line.trimStart().startsWith(fence)) fence = null;
      current.push(line);
      continue;
    }
    if (!fence && /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push(current.join("\n"));
      current = [];
      continue;
    }
    current.push(line);
  }
  out.push(current.join("\n"));

  return out.map((slide) => slide.trim()).filter(Boolean);
}

/** Reads one slide's Markdown into a flat list of blocks. */
function readBlocks(markdown: string): { blocks: Block[]; notes?: string } {
  const blocks: Block[] = [];
  const notes: string[] = [];
  const lines = markdown.split(/\r?\n/);
  let inNotes = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inNotes) {
      notes.push(line);
      continue;
    }
    if (NOTES_RE.test(line.trim())) {
      inNotes = true;
      const rest = line.trim().replace(NOTES_RE, "").trim();
      if (rest) notes.push(rest);
      continue;
    }

    const fence = /^\s*(?:```+|~~~+)\s*(.*)$/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*(?:```+|~~~+)\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      blocks.push({
        kind: "code",
        text: body.join("\n"),
        level: 0,
        info: fence[1].trim(),
      });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        kind: heading[1].length <= 2 ? "heading" : "subheading",
        text: heading[2].trim(),
        level: heading[1].length,
      });
      continue;
    }

    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      blocks.push({
        kind: "bullet",
        text: bullet[2].trim(),
        level: Math.min(2, Math.floor(bullet[1].replace(/\t/g, "  ").length / 2)),
      });
      continue;
    }

    const numbered = /^(\s*)\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      blocks.push({
        kind: "bullet",
        text: numbered[2].trim(),
        level: Math.min(2, Math.floor(numbered[1].replace(/\t/g, "  ").length / 2)),
      });
      continue;
    }

    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      blocks.push({ kind: "quote", text: quote[1].trim(), level: 0 });
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      blocks.push({ kind: "table", text: line.trim(), level: 0 });
      continue;
    }

    if (line.trim()) {
      blocks.push({ kind: "text", text: line.trim(), level: 0 });
    }
  }

  return { blocks, notes: notes.join("\n").trim() || undefined };
}

function toBullets(blocks: Block[]): Bullet[] {
  return blocks
    .filter((block) => block.kind === "bullet")
    .slice(0, MAX_BULLETS)
    .map((block) => ({ text: block.text, level: block.level }));
}

/** Reads a GitHub-style Markdown table, dropping its alignment row. */
function toTable(rows: Block[]): { columns: string[]; rows: string[][] } {
  const cells = rows.map((row) =>
    row.text
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim()),
  );
  const body = cells.filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell)));
  return { columns: body[0] ?? [], rows: body.slice(1, MAX_ROWS + 1) };
}

function parseSlide(markdown: string, index: number): Slide | null {
  const { blocks, notes } = readBlocks(markdown);
  if (blocks.length === 0) return null;

  const id = `s${index}`;
  const headings = blocks.filter((block) => block.kind === "heading");
  const title = headings[0]?.text;
  const body = blocks.filter((block) => block !== headings[0]);
  const common = { id, title, notes };

  const code = body.find((block) => block.kind === "code");
  if (code) {
    const info = (code.info ?? "").split(/\s+/).filter(Boolean);
    const language = info[0] ?? "text";
    if (language.toLowerCase() === "mermaid") {
      return { ...common, layout: "diagram", mermaid: code.text };
    }
    return {
      ...common,
      layout: "code",
      language,
      code: code.text,
      // ```js run — the deck can execute this slide while presenting.
      runnable: info.slice(1).includes("run"),
    };
  }

  const tableRows = body.filter((block) => block.kind === "table");
  if (tableRows.length >= 2) {
    return { ...common, layout: "table", ...toTable(tableRows) };
  }

  const quotes = body.filter((block) => block.kind === "quote");
  if (quotes.length > 0 && toBullets(body).length === 0) {
    const attribution = body.find(
      (block) => block.kind === "text" && block.text.startsWith("—"),
    );
    return {
      ...common,
      layout: "quote",
      text: quotes
        .map((q) => q.text)
        .join(" ")
        .trim(),
      attribution: attribution?.text.replace(/^—\s*/, ""),
    };
  }

  // Two `###` headings, each with its own points, is a comparison slide.
  const subheadings = body.filter((block) => block.kind === "subheading");
  if (subheadings.length === 2) {
    const columns = subheadings.map((heading) => {
      const start = body.indexOf(heading);
      const next = body.findIndex((block, i) => i > start && block.kind === "subheading");
      return {
        heading: heading.text,
        bullets: toBullets(body.slice(start + 1, next === -1 ? undefined : next)),
      };
    });
    return { ...common, layout: "columns", columns: [columns[0], columns[1]] };
  }

  const bullets = toBullets(body);
  const stats = bullets.flatMap((bullet) => {
    const match = STAT_RE.exec(bullet.text);
    return match ? [{ value: match[1].trim(), label: match[2].trim() }] : [];
  });
  if (stats.length > 0 && stats.length === bullets.length && stats.length <= MAX_STATS) {
    return { ...common, layout: "stats", stats };
  }

  if (bullets.length > 0) {
    return { ...common, layout: "bullets", bullets };
  }

  // No body at all: a heading on its own is a section divider (or the opener).
  const subtitle = body.find((block) => block.kind === "text")?.text;
  if (!title) return null;
  return {
    ...common,
    layout: index === 0 ? "title" : "section",
    subtitle,
  };
}

/**
 * Parses a Markdown outline into a deck. Never throws: a slide it cannot make
 * sense of is dropped, and an empty result is a deck with no slides, which the
 * UI reports as such.
 */
export function parseDeck(markdown: string): Deck {
  const chunks = splitSlides(markdown).slice(0, MAX_SLIDES);
  const slides = chunks.flatMap((chunk, index) => parseSlide(chunk, index) ?? []);

  // The opener names the deck; failing that, the first slide with a title does.
  const first = slides[0];
  const title =
    (first?.layout === "title" && first.title) ||
    slides.find((s) => s.title)?.title ||
    "Untitled deck";

  return { title, slides };
}

/** A one-line summary of a slide, for the outline rail. */
export function slideLabel(slide: Slide): string {
  if (slide.title) return slide.title;
  switch (slide.layout) {
    case "quote":
      return `“${slide.text.slice(0, 40)}…”`;
    case "code":
      return `${slide.language} snippet`;
    case "diagram":
      return "Diagram";
    case "table":
      return "Table";
    default:
      return "Slide";
  }
}

/** Slides are laid out on a fixed 16:9 stage and scaled to fit their frame. */
export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 720;
