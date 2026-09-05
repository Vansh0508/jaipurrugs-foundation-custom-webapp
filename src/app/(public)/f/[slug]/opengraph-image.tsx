import { ImageResponse } from "next/og";
import { getPublicFormBySlug } from "@/lib/actions/submissions";
import type { FormSettings } from "@/lib/forms/field-types";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getPublicFormBySlug(slug);

  const form = result?.form;
  const settings = (form?.settings as FormSettings | null) ?? {};
  const coverUrl = settings.cover_image_url || null;
  const title = form?.title?.trim() || "Jaipur Rugs Foundation";

  if (coverUrl) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            backgroundColor: "#f8fafc",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt={title}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </div>
      ),
      {
        ...size,
      }
    );
  }

  // Branded fallback banner if form has no cover image
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          backgroundColor: "#8B2323",
          color: "#ffffff",
          padding: "60px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 52,
            fontWeight: 700,
            lineHeight: 1.2,
            marginBottom: 24,
            maxWidth: "900px",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 26,
            opacity: 0.9,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          Jaipur Rugs Foundation
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
