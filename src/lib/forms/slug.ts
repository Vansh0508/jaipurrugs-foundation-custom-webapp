// Shared URL slug sanitization utility.
export function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // remove non-alphanumeric except whitespace and hyphens
    .replace(/[\s_-]+/g, "-") // collapse whitespace, underscore, hyphens into single hyphen
    .replace(/^-+|-+$/g, ""); // trim leading and trailing hyphens
}
