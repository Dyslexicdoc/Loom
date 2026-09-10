"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Loader2, Presentation, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Markdown } from "@/components/markdown";
import { CodeEditor } from "@/components/code/code-editor";
import { RunPanel, type RunPanelHandle } from "@/components/code/run-panel";
import { TestsPanel } from "@/components/code/tests-panel";
import {
  CODE_LANGUAGES,
  isLanguage,
  LANGUAGE_LABELS,
  type CodeLanguage,
  type RunResult,
  type TestCase,
} from "@/lib/code";
import { explainSnippetAction, saveSnippetAction } from "@/app/code/actions";

export interface SnippetSummary {
  id: string;
  title: string;
  language: CodeLanguage;
  source: string;
  tests: TestCase[];
  notes: string | null;
}

export function CodeView({ snippet }: { snippet: SnippetSummary }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [source, setSource] = useState(snippet.source);
  const [tests, setTests] = useState(snippet.tests);
  const [language, setLanguage] = useState<CodeLanguage>(snippet.language);
  const [notes, setNotes] = useState(snippet.notes);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);
  const runner = useRef<RunPanelHandle | null>(null);

  const dirty =
    source !== snippet.source ||
    language !== snippet.language ||
    JSON.stringify(tests) !== JSON.stringify(snippet.tests);

  function handleSave() {
    startTransition(async () => {
      const result = await saveSnippetAction(snippet.id, { source, tests, language });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Saved.");
      router.refresh();
    });
  }

  function handleExplain() {
    startTransition(async () => {
      const result = await explainSnippetAction(snippet.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setNotes(result.notes);
      toast.success("Walkthrough written.");
    });
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <h1 className="truncate text-sm font-semibold">{snippet.title}</h1>
        <div className="flex-1" />
        <Select
          value={language}
          onValueChange={(value) => value && isLanguage(value) && setLanguage(value)}
        >
          <SelectTrigger className="h-8 w-36" aria-label="Language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CODE_LANGUAGES.map((option) => (
              <SelectItem key={option} value={option}>
                {LANGUAGE_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          render={
            <a
              href={`/code/present/${snippet.id}`}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
          className="gap-2"
        >
          <Presentation className="size-4" />
          Present
        </Button>
        <Button
          size="sm"
          variant={dirty ? "default" : "outline"}
          onClick={handleSave}
          disabled={!dirty || isPending}
          className="gap-2"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {dirty ? "Save" : "Saved"}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <CodeEditor
          value={source}
          onChange={setSource}
          onRun={() => runner.current?.run()}
          className="min-w-0 flex-1"
        />

        <aside className="flex w-[26rem] shrink-0 flex-col border-l">
          <Tabs defaultValue="output" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="shrink-0">
              <TabsTab value="output">{language === "html" ? "Preview" : "Output"}</TabsTab>
              {language === "javascript" ? (
                <TabsTab value="tests">Tests{tests.length > 0 ? ` (${tests.length})` : ""}</TabsTab>
              ) : null}
              <TabsTab value="notes">Walkthrough</TabsTab>
            </TabsList>

            <TabsPanel value="output" className="flex min-h-0 flex-1 flex-col">
              <RunPanel
                ref={runner}
                source={source}
                language={language}
                tests={tests}
                onResult={setLastRun}
                className="flex-1"
              />
            </TabsPanel>

            {language === "javascript" ? (
              <TabsPanel value="tests" className="flex min-h-0 flex-1 flex-col">
                <TestsPanel
                  snippetId={snippet.id}
                  tests={tests}
                  onChange={setTests}
                  lastRun={lastRun}
                  onFixed={(next) => {
                    setSource(next);
                    router.refresh();
                  }}
                />
              </TabsPanel>
            ) : null}

            <TabsPanel value="notes" className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 border-b px-3 py-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExplain}
                  disabled={isPending}
                  className="gap-2"
                >
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {notes ? "Rewrite walkthrough" : "Explain this code"}
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {notes ? (
                  <Markdown>{notes}</Markdown>
                ) : (
                  <p className="text-muted-foreground flex items-center gap-2 py-6 text-xs">
                    <BookOpen className="size-4" />
                    No walkthrough yet — ask the model for one before you present.
                  </p>
                )}
              </div>
            </TabsPanel>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
