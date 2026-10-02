import { ImageResponse } from "next/og";
import { NextRequest, NextResponse } from "next/server";
import { getPublicFormBySlug } from "@/lib/actions/submissions";
import type { FormSettings } from "@/lib/forms/field-types";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const result = await getPublicFormBySlug(slug);

  const form = result?.form;
  const settings = (form?.settings as FormSettings | null) ?? {};
  const targetImageUrl = settings.cover_image_url || settings.logo_url;
  const title = form?.title?.trim() || "Jaipur Rugs Foundation";

  if (targetImageUrl) {
    try {
      const upstream = await fetch(targetImageUrl);
      if (upstream.ok) {
        const contentType =
          upstream.headers.get("content-type") || "image/png";
        const buffer = await upstream.arrayBuffer();

        return new NextResponse(buffer, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
            // Explicitly allows social media crawlers (WhatsApp, Facebook, etc.) to index and display
            "X-Robots-Tag": "all",
          },
        });
      }
    } catch {
      // Fall through to branded fallback banner
    }
  }

  // Branded fallback banner if no cover/logo image exists or upstream fetch fails
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
