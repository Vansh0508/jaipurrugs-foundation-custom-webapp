import "server-only";
import type { KbCategory } from "@/lib/mastra/kb-categories";

// Placeholder articles for exercising the agent in the workbench. They are
// deliberately generic and flagged `metadata.sample = true` + a "Sample:"
// title, because the agent answers artisans from whatever is in the KB —
// staff must replace these with verified foundation content before any real
// WhatsApp traffic is pointed at the agent.
export const SAMPLE_KB_ARTICLES: {
  title: string;
  category: KbCategory;
  tags: string[];
  content: string;
}[] = [
  {
    title: "Sample: How do I check the status of a form I submitted?",
    category: "faqs",
    tags: ["form", "status", "submission"],
    content:
      "You can ask this assistant about any form submitted with your WhatsApp number. It will tell you which forms were received, the date, and whether each one is complete or still in progress. If a form shows as in progress, open the same link again on the same phone to continue where you left off.",
  },
  {
    title: "Sample: Who do I contact for help with a scheme application?",
    category: "artisan_schemes",
    tags: ["scheme", "application", "help", "coordinator"],
    content:
      "Your field coordinator is the first point of contact for any scheme application. They can explain eligibility, help collect documents and submit the application on your behalf. (Placeholder — replace with the foundation's real scheme list and process.)",
  },
  {
    title: "Sample: What happens during a field visit?",
    category: "field_visits",
    tags: ["visit", "field", "coordinator", "survey"],
    content:
      "During a field visit, a coordinator meets artisans at their home or loom, checks on ongoing work, records any issues, and may fill in a short survey form on their phone. Visits are usually arranged in advance by the coordinator. (Placeholder — replace with the foundation's actual visit process.)",
  },
  {
    title: "Sample: Can I see other people's submissions?",
    category: "faqs",
    tags: ["privacy", "submissions", "data"],
    content:
      "No. For privacy, this assistant only shares records linked to the phone number you are messaging from. To ask about someone else's records, they need to message from their own number, or speak to a field coordinator.",
  },
  {
    title: "Sample: About Jaipur Rugs Foundation",
    category: "foundation_info",
    tags: ["foundation", "about", "artisans"],
    content:
      "Jaipur Rugs Foundation works with rural artisan communities. (Placeholder — replace with the foundation's approved description, programmes and official contact details before going live.)",
  },
];
