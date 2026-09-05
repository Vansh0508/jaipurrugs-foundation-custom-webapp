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

  if (!targetImageUrl) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const upstream = await fetch(targetImageUrl);
    if (!upstream.ok) {
      return new NextResponse(null, { status: upstream.status });
    }

    const contentType = upstream.headers.get("content-type") || "image/png";
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        // Explicitly allows social media crawlers (WhatsApp, Facebook, etc.) to index and display
        "X-Robots-Tag": "all",
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
