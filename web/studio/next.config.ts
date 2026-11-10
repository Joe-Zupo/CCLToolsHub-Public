import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/ui"],
  // Both load files from their own package folders at run time.
  serverExternalPackages: ["ffmpeg-static", "@electric-sql/pglite"],
};

export default nextConfig;
