/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server.js that runs inside Lambda (see scripts/build-lambda.sh).
  output: 'standalone',
  experimental: {
    serverActions: {
      // CloudFront forwards requests to the Lambda with a different Host header.
      // Allow forms posted from the CloudFront domain (and a custom domain, if you add one).
      allowedOrigins: ['*.cloudfront.net', ...(process.env.APP_DOMAIN ? [process.env.APP_DOMAIN] : [])],
    },
  },
};
export default nextConfig;
