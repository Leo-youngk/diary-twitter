/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = nextConfig;

if (process.env.NODE_ENV === 'development') {
  const { initOpenNextCloudflareForDev } = require('@opennextjs/cloudflare');
  initOpenNextCloudflareForDev();
}
