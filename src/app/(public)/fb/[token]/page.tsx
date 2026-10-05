import type { Metadata } from "next";
import { PublicFormRenderer } from "@/components/public-form/public-form-renderer";
import { getFeedbackPage } from "@/lib/actions/feedback";
import { formatDate } from "@/lib/visits/time";

// A guest's personal feedback link. The token is the only credential, so the page is
// never indexed or cached, and it doesn't leak the URL (and token) in a Referer header.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your feedback | Jaipur Rugs Foundation",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Unavailable() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <div className="max-w-md rounded-2xl border border-border bg-white p-8 shadow-xs">
        <h1 className="mb-2 text-xl font-bold text-foreground">This link isn&apos;t available</h1>
        <p className="text-sm text-muted">
          The feedback link may have expired or been replaced. If you&apos;d still like to share your feedback,
          just reply to our WhatsApp message and our team will help.
        </p>
      </div>
    </div>
  );
}

export default async function FeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await getFeedbackPage(token);
  if (!result) return <Unavailable />;

  const { session, form, fields } = result;
  const greeting = session.guest_first_name ? `Hi ${session.guest_first_name}` : "Hello";
  const visit = session.visit_type
    ? `your ${session.visit_type}${session.visit_date ? ` on ${formatDate(session.visit_date)}` : ""}`
    : "your visit";

  return (
    <>
      {session.completed ? null : (
        <div className="bg-white px-6 pt-6 text-center text-sm text-muted">
          {greeting} — thank you for joining us. We&apos;d love to hear how {visit} went.
        </div>
      )}
      <PublicFormRenderer
        feedback={{ token, initialAnswers: session.answers, completed: session.completed }}
        fields={fields}
        form={form}
      />
    </>
  );
}
