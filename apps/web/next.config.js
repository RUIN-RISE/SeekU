/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@seeku/db', '@seeku/shared', '@seeku/search']
};

export default nextConfig;