import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  // The managed virtualenv lives outside the project, but keep the trace
  // honest if a developer does create a local .venv.
  outputFileTracingExcludes: {
    "*": [".venv/**", "**/.venv/**", "node_modules/.cache/**"],
  },
  experimental: {
    // KaTeX + Monaco are heavy client bundles; keep them off the server path.
    optimizePackageImports: ["katex"],
  },
};

export default nextConfig;
