export const KB_CATEGORIES = [
  { id: "faqs", label: "FAQs" },
  { id: "artisan_schemes", label: "Artisan schemes" },
  { id: "field_visits", label: "Field visits" },
  { id: "foundation_info", label: "Foundation info" },
  { id: "general", label: "General" },
] as const;

export type KbCategory = (typeof KB_CATEGORIES)[number]["id"];

export function kbCategoryLabel(id: string) {
  return KB_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}
