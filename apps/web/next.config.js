import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@seeku/db", "@seeku/shared", "@seeku/search"],
  turbopack: {
    root: path.join(__dirname, "../..")
  }
};

export default nextConfig;
