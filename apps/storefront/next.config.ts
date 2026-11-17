import path from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

function apiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:4000";
  }
}

const api = apiOrigin();
const wsApi = api.replace(/^http/, "ws");

// Extra image hosts can be supplied as a comma-separated list.
const extraImageHosts = (process.env.NEXT_PUBLIC_IMAGE_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

const imageHostnames = [
  "loremflickr.com",
  "images.unsplash.com",
  "picsum.photos",
  ...extraImageHosts,
];

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${api} ${wsApi} https://checkout.razorpay.com`,
  "frame-src https://checkout.razorpay.com https://meet.jit.si",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

// Container builds (docker/storefront.Dockerfile) set NEXT_OUTPUT=standalone to emit a
// minimal self-contained server. Off by default so local builds are unchanged.
const standalone = process.env.NEXT_OUTPUT === "standalone";

const nextConfig: NextConfig = {
  ...(standalone
    ? { output: "standalone" as const, outputFileTracingRoot: path.join(process.cwd(), "../..") }
    : {}),
  images: {
    remotePatterns: imageHostnames.map((hostname) => ({
      protocol: "https" as const,
      hostname,
    })),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
