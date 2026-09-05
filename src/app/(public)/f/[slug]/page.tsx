import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicFormBySlug } from "@/lib/actions/submissions";
import { PublicFormRenderer } from "@/components/public-form/public-form-renderer";
import type { FormSettings } from "@/lib/forms/field-types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicFormBySlug(slug);

  if (!result || !result.form) {
    return {
      title: "Form Not Found | Jaipur Rugs Foundation",
    };
  }

  const { form } = result;
  const settings = (form.settings as FormSettings | null) ?? {};
  const coverUrl = settings.cover_image_url || null;
  const logoUrl = settings.logo_url || null;

  const title = form.title?.trim() || "Untitled Form";
  const description =
    form.description?.trim() || "Fill out this form by Jaipur Rugs Foundation.";

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://survey.jaipurrugs.org";
  const canonicalUrl = `${siteUrl}/f/${slug}`;

  // Dynamic social image: cover image prioritized, fallback to logo
  const socialImage = coverUrl || logoUrl;

  const imageExt = socialImage
    ? socialImage.split("?")[0].split(".").pop()?.toLowerCase()
    : null;
  const imageType =
    imageExt === "png"
      ? "image/png"
      : imageExt === "webp"
      ? "image/webp"
      : imageExt === "gif"
      ? "image/gif"
      : "image/jpeg";

  const socialImageUrl = `${siteUrl}/api/og/${slug}`;

  return {
    title: `${title} | Jaipur Rugs Foundation`,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${title} | Jaipur Rugs Foundation`,
      description,
      url: canonicalUrl,
      type: "website",
      siteName: "Jaipur Rugs Foundation",
      locale: "en_US",
      ...(socialImage
        ? {
            images: [
              {
                url: socialImageUrl,
                secureUrl: socialImageUrl,
                width: 1200,
                height: 630,
                type: imageType,
                alt: `${title} cover image`,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: socialImage ? "summary_large_image" : "summary",
      title: `${title} | Jaipur Rugs Foundation`,
      description,
      ...(socialImage ? { images: [socialImageUrl] } : {}),
    },
  };
}

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getPublicFormBySlug(slug);

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
