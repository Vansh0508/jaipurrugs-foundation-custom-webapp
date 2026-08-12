import type { Tables } from "@/lib/types/supabase";

export type FormPage = {
  pageIndex: number;
  sectionField: Tables<"form_fields"> | null;
  fields: Tables<"form_fields">[];
};

/**
 * Groups a form's fields into pages based on section boundaries and questions_per_page.
 * Any `section` field forces a new page boundary.
 */
export function groupFieldsIntoPages(
  fields: Tables<"form_fields">[],
  questionsPerPage?: number,
): FormPage[] {
  const pages: FormPage[] = [];
  const limit = questionsPerPage && questionsPerPage > 0 ? questionsPerPage : Infinity;

  let currentPageSection: Tables<"form_fields"> | null = null;
  let currentFields: Tables<"form_fields">[] = [];

  for (const field of fields) {
    if (field.type === "section") {
      if (currentFields.length > 0 || currentPageSection !== null) {
        pages.push({
          pageIndex: pages.length,
          sectionField: currentPageSection,
          fields: currentFields,
        });
        currentFields = [];
      }
      currentPageSection = field;
    } else {
      currentFields.push(field);
      if (currentFields.length >= limit) {
        pages.push({
          pageIndex: pages.length,
          sectionField: currentPageSection,
          fields: currentFields,
        });
        currentFields = [];
      }
    }
  }

  if (currentFields.length > 0 || currentPageSection !== null || pages.length === 0) {
    pages.push({
      pageIndex: pages.length,
      sectionField: currentPageSection,
      fields: currentFields,
    });
  }

  return pages;
}
