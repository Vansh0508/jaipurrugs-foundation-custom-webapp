import { notFound } from "next/navigation";
import { getPublicFormByShareToken } from "@/lib/actions/submissions";
import { PublicFormRenderer } from "@/components/public-form/public-form-renderer";

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;
  const result = await getPublicFormByShareToken(shareToken);

  if (!result) {
    notFound();
  }

  if (result.isNotPublished) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="rounded-2xl border border-border bg-white p-8 shadow-xs max-w-md">
          <h1 className="text-xl font-bold text-foreground mb-2">Form Not Available</h1>
          <p className="text-sm text-muted">
            This form is currently in draft mode and is not accepting public submissions.
          </p>
        </div>
      </div>
    );
  }

  return <PublicFormRenderer fields={result.fields} form={result.form} />;
}
