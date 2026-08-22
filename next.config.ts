import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright launches a real browser and resolves its own binaries at runtime;
  // bundling it breaks that. hai-agents is left external for the same reason.
  serverExternalPackages: ["playwright", "hai-agents"],
};

export default nextConfig;
