import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getPublicFormBySlug } from "@/lib/actions/submissions";
import type { FormSettings } from "@/lib/forms/field-types";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const result = await getPublicFormBySlug(slug);

  const form = result?.form;
  const settings = (form?.settings as FormSettings | null) ?? {};
  const coverUrl = settings.cover_image_url;
  const title = form?.title || "Jaipur Rugs Foundation";

  if (coverUrl) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            backgroundColor: "#f8fafc",
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
        width: 1200,
        height: 630,
      }
    );
  }

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
      width: 1200,
      height: 630,
    }
  );
}
