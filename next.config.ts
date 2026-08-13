import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB, too small for logo/cover/section-background image
      // uploads (uploadFormAsset in lib/actions/forms.ts).
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
