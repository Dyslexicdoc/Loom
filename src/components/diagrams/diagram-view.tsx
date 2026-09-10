"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Code2,
  Download,
  ImageDown,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DiagramPanZoom } from "@/components/diagrams/diagram-figure";
import { parseDiagram } from "@/lib/diagram";
import { diagramToSvg, SVG_THEMES } from "@/lib/diagram-svg";
import { downloadText, slugify, svgToPng } from "@/lib/download";
import { regenerateDiagramAction, saveDiagramSourceAction } from "@/app/diagrams/actions";

export interface DiagramSummary {
  id: string;
  title: string;
  source: string;
  generatedBy: "model" | "manual";
  model: string | null;
  error: string | null;
}

export function DiagramView({ diagram }: { diagram: DiagramSummary }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [source, setSource] = useState(diagram.source);
  const [instructions, setInstructions] = useState("");
  const [showSource, setShowSource] = useState(true);

  const { spec, warnings } = useMemo(() => parseDiagram(source), [source]);
  const dirty = source !== diagram.source;

  function handleSave() {
    startTransition(async () => {
      const result = await saveDiagramSourceAction(diagram.id, source);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Source saved.");
      router.refresh();
    });
  }

  function handleRegenerate() {
    startTransition(async () => {
      const result = await regenerateDiagramAction(diagram.id, instructions);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setInstructions("");
      toast.success("Diagram redrawn.");
      router.refresh();
    });
  }

  async function handleExport(format: "svg" | "png" | "mermaid") {
    const name = slugify(diagram.title, "diagram");
    if (format === "mermaid") {
      downloadText(`${name}.mmd`, source, "text/vnd.mermaid");
      return;
    }
    const svg = diagramToSvg(spec, { theme: SVG_THEMES.neon, title: diagram.title });
    if (format === "svg") {
      downloadText(`${name}.svg`, svg, "image/svg+xml");
      return;
    }
    try {
      const blob = await svgToPng(svg, 2, SVG_THEMES.neon.background);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PNG export failed.");
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <h1 className="truncate text-sm font-semibold">{diagram.title}</h1>
        <span className="text-muted-foreground shrink-0 text-xs">
          {spec.nodes.length} nodes · {spec.edges.length} edges
          {diagram.generatedBy === "model" && diagram.model ? ` · ${diagram.model}` : ""}
        </span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowSource((current) => !current)}
          className="gap-2"
        >
          <Code2 className="size-4" />
          {showSource ? "Hide source" : "Show source"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="size-4" />
                Export
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void handleExport("png")}>
              <ImageDown className="size-4" />
              PNG image
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleExport("svg")}>
              <ImageDown className="size-4" />
              SVG vector
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleExport("mermaid")}>
              <Code2 className="size-4" />
              Mermaid source
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {diagram.error ? (
        <p className="text-neon-yellow border-neon-yellow/40 bg-neon-yellow/5 flex items-center gap-2 border-b px-4 py-2 text-xs">
          <AlertTriangle className="size-4 shrink-0" />
          {diagram.error}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <DiagramPanZoom spec={spec} className="min-w-0 flex-1" />

        {showSource ? (
          <aside className="flex w-96 shrink-0 flex-col gap-3 border-l p-3">
            <div className="space-y-1.5">
              <label
                htmlFor="diagram-source"
                className="text-muted-foreground text-xs font-medium"
              >
                Mermaid source — edits preview live
              </label>
              <Textarea
                id="diagram-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                spellCheck={false}
                className="min-h-64 flex-1 font-mono text-xs"
              />
            </div>

            {warnings.length > 0 ? (
              <ul className="text-neon-yellow space-y-1 text-xs">
                {warnings.slice(0, 4).map((warning) => (
                  <li key={`${warning.line}-${warning.message}`}>
                    Line {warning.line}: {warning.message}
                  </li>
                ))}
              </ul>
            ) : null}

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
              {dirty ? "Save source" : "Saved"}
            </Button>

            <div className="mt-auto space-y-2 border-t pt-3">
              <label
                htmlFor="diagram-instructions"
                className="text-muted-foreground text-xs font-medium"
              >
                Ask the model to change it
              </label>
              <Input
                id="diagram-instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && instructions.trim()) handleRegenerate();
                }}
                placeholder="Add an error path from validation…"
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
                {instructions.trim() ? "Apply change" : "Redraw from prompt"}
              </Button>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
