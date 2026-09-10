"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PenLine, Sparkles, Workflow } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import {
  createBlankDiagramAction,
  createDiagramFromPromptAction,
  createDiagramFromSourceAction,
} from "@/app/diagrams/actions";

const EXAMPLES = [
  "How a pull request goes from opened to merged, including review and CI",
  "The OAuth authorization-code flow between a browser, an app, and an auth server",
  "What happens when a chat message arrives: retrieval, tool calls, and streaming",
];

export function DiagramCreate() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");

  function run(
    action: () => Promise<{ id: string } | { error: string }>,
    success: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      router.push(`/diagrams?d=${result.id}`);
    });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="animate-fade-in-up mx-auto flex max-w-3xl flex-col gap-5 px-6 py-10">
        <div className="space-y-3 text-center">
          <Workflow className="text-neon-cyan mx-auto size-9 drop-shadow-[0_0_10px_var(--neon-cyan)]" />
          <p className="font-pixel text-glow-magenta text-primary text-sm leading-relaxed">
            DESCRIBE → FLOWCHART
            <span className="bg-neon-cyan animate-blink ml-1 inline-block h-3 w-2 align-middle" />
          </p>
          <p className="text-muted-foreground text-sm">
            Describe a process and the model draws it as a flowchart — decisions,
            branches, datastores, and all. Diagrams are stored as Mermaid source you can
            edit by hand.
          </p>
        </div>

        <Tabs defaultValue="describe">
          <TabsList className="w-full">
            <TabsTab value="describe" className="flex-1 gap-2">
              <Sparkles className="size-4" />
              Describe it
            </TabsTab>
            <TabsTab value="mermaid" className="flex-1 gap-2">
              <PenLine className="size-4" />
              Paste Mermaid
            </TabsTab>
          </TabsList>

          <TabsPanel value="describe" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="diagram-prompt">What should it show?</Label>
              <Textarea
                id="diagram-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="The steps a support ticket goes through, from submitted to resolved…"
                disabled={isPending}
                className="min-h-32"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setPrompt(example)}
                  disabled={isPending}
                  className="border-border/70 text-muted-foreground hover:border-neon-cyan/50 hover:text-foreground rounded-full border px-3 py-1 text-xs transition-colors"
                >
                  {example.length > 52 ? `${example.slice(0, 52)}…` : example}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => run(() => createBlankDiagramAction(), "Diagram created.")}
                disabled={isPending}
              >
                Start from a template
              </Button>
              <div className="flex-1" />
              <Button
                onClick={() =>
                  run(
                    () => createDiagramFromPromptAction({ prompt, title }),
                    "Flowchart drawn.",
                  )
                }
                disabled={isPending || !prompt.trim()}
                className="gap-2"
              >
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {isPending ? "Drawing…" : "Draw flowchart"}
              </Button>
            </div>
          </TabsPanel>

          <TabsPanel value="mermaid" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="diagram-title">Title (optional)</Label>
              <Input
                id="diagram-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Deploy pipeline"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="diagram-source">Mermaid source</Label>
              <Textarea
                id="diagram-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder={
                  "flowchart TD\n  A([Start]) --> B{Ready?}\n  B -->|Yes| C[Ship]"
                }
                disabled={isPending}
                className="min-h-56 font-mono text-xs"
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() =>
                  run(
                    () => createDiagramFromSourceAction({ source, title }),
                    "Diagram created.",
                  )
                }
                disabled={isPending || !source.trim()}
              >
                Create diagram
              </Button>
            </div>
          </TabsPanel>
        </Tabs>
      </div>
    </div>
  );
}
