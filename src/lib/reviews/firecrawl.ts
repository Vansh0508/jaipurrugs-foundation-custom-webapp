import "server-only";

const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape";
const SCRAPE_TIMEOUT_MS = 120_000;
// A long reviews modal can be huge; the model only needs the reviews themselves.
// A TripAdvisor page is ~100k characters (the reviews come last), so leave generous room.
const MAX_MARKDOWN_CHARS = 160_000;

export function isFirecrawlConfigured() {
  return Boolean(process.env.FIRECRAWL_API_KEY?.trim());
}

// Airbnb lists reviews in a scrollable modal that loads more as you scroll. Scroll the
// biggest scrollable element inside the dialog to the bottom a few times. try/catch so a
// layout change can never fail the whole scrape — we'd just get fewer reviews.
const SCROLL_MODAL_SCRIPT = `try {
  const root = document.querySelector('[role="dialog"]') || document.body;
  const scrollable = [root, ...root.querySelectorAll('*')]
    .filter((el) => el.scrollHeight > el.clientHeight + 50)
    .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
  if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
} catch (e) {}`;

// 6 rounds loaded ~41 of the 56 reviews on the Airbnb listing, so scroll further.
const SCROLL_ROUNDS = 15;

// TripAdvisor cuts review text off behind a "Read more" button. Click only real <button>s: the
// same words on a link would navigate away from the page.
const EXPAND_READ_MORE_SCRIPT = `try {
  document.querySelectorAll('button, [role="button"]').forEach((el) => {
    if (el.textContent && el.textContent.trim() === 'Read more') el.click();
  });
} catch (e) {}`;

export type ScrapeOptions = { scrollModal?: boolean; expandReadMore?: boolean };

function pageActions({ scrollModal, expandReadMore }: ScrapeOptions) {
  const actions: Record<string, unknown>[] = [{ type: "wait", milliseconds: 3000 }];
  if (scrollModal) {
    for (let i = 0; i < SCROLL_ROUNDS; i++) {
      actions.push({ type: "executeJavascript", script: SCROLL_MODAL_SCRIPT }, { type: "wait", milliseconds: 1500 });
    }
  }
  if (expandReadMore) {
    actions.push({ type: "executeJavascript", script: EXPAND_READ_MORE_SCRIPT }, { type: "wait", milliseconds: 1000 });
  }
  return actions;
}

type ScrapeResponse = {
  success?: boolean;
  error?: string;
  data?: { markdown?: string; metadata?: { statusCode?: number; error?: string } };
};

async function scrape(url: string, options: ScrapeOptions, withActions: boolean) {
  const res = await fetch(FIRECRAWL_SCRAPE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY?.trim()}`,
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      // The reviews live in a modal, which "main content" extraction can drop.
      onlyMainContent: false,
      // Default is a 2-day cache; a sync must see today's reviews.
      maxAge: 0,
      timeout: SCRAPE_TIMEOUT_MS,
      location: { country: "IN", languages: ["en-IN"] },
      ...(withActions ? { actions: pageActions(options) } : { waitFor: 5000 }),
    }),
    signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS + 15_000),
  });

  const body = (await res.json().catch(() => ({}))) as ScrapeResponse;
  if (!res.ok || !body.success) {
    const reason =
      res.status === 401 ? "the Firecrawl API key was rejected"
      : res.status === 402 ? "the Firecrawl account is out of credits"
      : res.status === 429 ? "Firecrawl rate limit reached — try again in a minute"
      : body.error || `Firecrawl returned HTTP ${res.status}`;
    return { ok: false as const, reason };
  }
  const markdown = body.data?.markdown?.trim();
  if (!markdown) {
    return { ok: false as const, reason: body.data?.metadata?.error || "Firecrawl returned an empty page" };
  }
  return { ok: true as const, markdown };
}

export type ScrapeResult = { ok: true; markdown: string } | { ok: false; reason: string };

/** Fetches a reviews page as markdown (with reviewer photos as image links). */
export async function scrapeReviewsPage(url: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
  const needsActions = Boolean(options.scrollModal || options.expandReadMore);
  try {
    let result = await scrape(url, options, needsActions);
    // The page actions are the fragile part; if they make the scrape fail, still get the page as it loads.
    if (!result.ok && needsActions && !/key|credits|rate limit/i.test(result.reason)) {
      result = await scrape(url, options, false);
    }
    if (!result.ok) return result;
    return { ok: true, markdown: result.markdown.slice(0, MAX_MARKDOWN_CHARS) };
  } catch (err) {
    console.error("[reviews] firecrawl request failed", err);
    return { ok: false, reason: "Could not reach Firecrawl (network error or timeout)." };
  }
}
