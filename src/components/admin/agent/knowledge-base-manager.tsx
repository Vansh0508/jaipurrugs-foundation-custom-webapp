"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpFromLine, Pencil, Plus, Sparkles, TrashBin } from "@gravity-ui/icons";
import { AlertDialog, Button, Chip, SearchField, toast } from "@heroui/react";
import { deleteKbArticle, importKbMarkdown, seedSampleKbArticles } from "@/lib/actions/kb";
import { kbCategoryLabel } from "@/lib/mastra/kb-categories";
import type { Json } from "@/lib/types/supabase";
import { KbArticleModal } from "./kb-article-modal";

export interface KbArticle {
  id: string;
  title: string;
  category: string;
  content: string;
  tags: string[];
  metadata: Json;
  updated_at: string;
}

function isSample(article: KbArticle) {
  const metadata = article.metadata;
  return typeof metadata === "object" && metadata !== null && !Array.isArray(metadata) && metadata.sample === true;
}

export function KnowledgeBaseManager({ articles }: { articles: KbArticle[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<KbArticle | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<KbArticle | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter((a) =>
      [a.title, a.content, a.category, ...a.tags].some((field) => field.toLowerCase().includes(q)),
    );
  }, [articles, query]);

  function openEditor(article: KbArticle | null) {
    setEditing(article);
    setIsEditorOpen(true);
  }

  async function handleSeed() {
    setIsSeeding(true);
    const result = await seedSampleKbArticles();
    setIsSeeding(false);
    if (result.error) {
      toast.danger(result.error);
      return;
    }
    toast.success(
      result.inserted ? `Added ${result.inserted} sample article(s).` : "Sample articles are already present.",
    );
    router.refresh();
  }

  async function handleImport(file: File | undefined) {
    if (!file) return;
    setIsImporting(true);
    try {
      const result = await importKbMarkdown(await file.text());
      if (result.error) {
        toast.danger(result.error);
      } else {
        const skipped = result.errors?.length ?? 0;
        toast.success(
          `Imported ${result.created ?? 0} new and updated ${result.updated ?? 0} article(s)` +
            (skipped ? ` — ${skipped} skipped.` : "."),
        );
        router.refresh();
      }
      for (const issue of [...(result.errors ?? []), ...(result.warnings ?? [])].slice(0, 5)) {
        toast.warning(`${issue.title}: ${issue.message}`);
      }
    } finally {
      setIsImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    const result = await deleteKbArticle(pendingDelete.id);
    setIsDeleting(false);
    if (result.error) {
      toast.danger(result.error);
      return;
    }
    setPendingDelete(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField aria-label="Search articles" className="w-72" value={query} onChange={setQuery}>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search articles…" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <div className="ml-auto flex gap-2">
          <input
            ref={fileInput}
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            className="hidden"
            type="file"
            onChange={(e) => handleImport(e.target.files?.[0])}
          />
          <Button isPending={isImporting} variant="secondary" onPress={() => fileInput.current?.click()}>
            <ArrowUpFromLine className="size-4" />
            Import file
          </Button>
          <Button isPending={isSeeding} variant="secondary" onPress={handleSeed}>
            <Sparkles className="size-4" />
            Add sample FAQs
          </Button>
          <Button onPress={() => openEditor(null)}>
            <Plus className="size-4" />
            New article
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted">
        Import a Markdown file: one <code>## Title</code> heading per article, with optional{" "}
        <code>category:</code> and <code>tags:</code> lines under it. Articles whose title already exists are updated.
      </p>

      {articles.some(isSample) ? (
        <p className="rounded-xl bg-warning/10 px-3 py-2 text-xs text-neutral-700">
          Sample articles are placeholders for testing. The agent answers artisans from this content, so
          replace them with verified foundation information before connecting real WhatsApp traffic.
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border p-16 text-center">
          <p className="text-sm font-medium">{articles.length === 0 ? "No articles yet" : "No matches"}</p>
          <p className="text-sm text-muted">
            {articles.length === 0
              ? "Add FAQs, scheme details and guidelines for the agent to answer from."
              : "Try a different search."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60 rounded-2xl border border-border/70">
          {filtered.map((article) => (
            <li key={article.id} className="flex items-start gap-4 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{article.title}</span>
                  <Chip size="sm" variant="soft">
                    {kbCategoryLabel(article.category)}
                  </Chip>
                  {isSample(article) ? (
                    <Chip color="warning" size="sm" variant="soft">
                      Sample
                    </Chip>
                  ) : null}
                </div>
                <p className="line-clamp-2 text-sm text-muted">{article.content}</p>
                {article.tags.length > 0 ? (
                  <p className="text-xs text-muted">{article.tags.map((t) => `#${t}`).join(" ")}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button isIconOnly aria-label="Edit article" size="sm" variant="ghost" onPress={() => openEditor(article)}>
                  <Pencil className="size-4" />
                </Button>
                <Button
                  isIconOnly
                  aria-label="Delete article"
                  size="sm"
                  variant="ghost"
                  onPress={() => setPendingDelete(article)}
                >
                  <TrashBin className="size-4 text-danger" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <KbArticleModal
        article={editing}
        isOpen={isEditorOpen}
        onOpenChange={setIsEditorOpen}
        onSaved={() => {
          setIsEditorOpen(false);
          router.refresh();
        }}
      />

      <AlertDialog isOpen={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[400px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>Delete &ldquo;{pendingDelete?.title}&rdquo;?</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>The agent will stop using this article immediately. This cannot be undone.</p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">
                  Cancel
                </Button>
                <Button isPending={isDeleting} variant="danger" onPress={handleDelete}>
                  Delete
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}
