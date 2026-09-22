import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No reason to advertise the framework in every response.
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Posters from phones can be several MB; raise the Server Action
      // body limit so createShow/updateShow can receive the upload.
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  // Baseline security headers on every response. None of this app's
  // pages are meant to be framed by another site (admin panel
  // especially — this is exactly what stops a clickjacking overlay
  // trick against /admin), and nothing here needs MIME-sniffing.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
