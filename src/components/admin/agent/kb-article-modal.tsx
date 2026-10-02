"use client";

import { useState } from "react";
import {
  Button,
  Description,
  Input,
  Label,
  ListBox,
  Modal,
  Select,
  TextArea,
  TextField,
} from "@heroui/react";
import { createKbArticle, updateKbArticle } from "@/lib/actions/kb";
import { KB_CATEGORIES } from "@/lib/mastra/kb-categories";
import type { KbArticle } from "./knowledge-base-manager";

function parseTags(raw: string) {
  return [...new Set(raw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

function ArticleForm({ article, onSaved }: { article: KbArticle | null; onSaved: () => void }) {
  const [title, setTitle] = useState(article?.title ?? "");
  const [category, setCategory] = useState<string>(article?.category ?? "faqs");
  const [content, setContent] = useState(article?.content ?? "");
  const [tags, setTags] = useState(article?.tags.join(", ") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    const input = { title, category, content, tags: parseTags(tags) };
    const result = article ? await updateKbArticle(article.id, input) : await createKbArticle(input);
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <TextField isRequired value={title} onChange={setTitle}>
        <Label>Title</Label>
        <Input placeholder="e.g. How do I apply for the loom scheme?" />
      </TextField>

      <Select value={category} onChange={(key) => key && setCategory(String(key))}>
        <Label>Category</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {KB_CATEGORIES.map((c) => (
              <ListBox.Item key={c.id} id={c.id} textValue={c.label}>
                {c.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      <TextField isRequired value={content} onChange={setContent}>
        <Label>Content</Label>
        <TextArea placeholder="The full answer, in plain language." rows={10} />
        <Description>The agent quotes from this text, so keep it accurate and current.</Description>
      </TextField>

      <TextField value={tags} onChange={setTags}>
        <Label>Tags</Label>
        <Input placeholder="loom, subsidy, application" />
        <Description>Comma-separated. Tags boost search matches.</Description>
      </TextField>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button fullWidth isPending={isPending} type="submit">
        {article ? "Save changes" : "Add article"}
      </Button>
    </form>
  );
}

export function KbArticleModal({
  article,
  isOpen,
  onOpenChange,
  onSaved,
}: {
  article: KbArticle | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-xl">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{article ? "Edit article" : "New article"}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            {/* Keyed so switching articles resets the form fields. */}
            <ArticleForm key={article?.id ?? "new"} article={article} onSaved={onSaved} />
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
