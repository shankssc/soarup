// apps/web/next.config.mjs

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cloudflare Pages compatibility
  images: {
    unoptimized: true, // Cloudflare Pages handles image optimization
  },
  // Disable React strict mode in dev for better debugging
  reactStrictMode: process.env.NODE_ENV !== "development",
  // API rewrites for local dev (proxy to backend)
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
