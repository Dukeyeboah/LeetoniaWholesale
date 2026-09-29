/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Serves Firebase's sign-in handler from our own domain so the Google popup shows
  // it (requires NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=www.leetoniawholesale.com on Vercel).
  async rewrites() {
    return [
      {
        source: '/__/auth/:path*',
        destination: 'https://leetonia-43222.firebaseapp.com/__/auth/:path*',
      },
      {
        source: '/__/firebase/:path*',
        destination: 'https://leetonia-43222.firebaseapp.com/__/firebase/:path*',
      },
    ];
  },
  async headers() {
    return [
      {
        // Firebase's proxied /__/ auth pages must not get COOP, or the popup loses its
        // link back to the app and sign-in times out as "popup closed".
        source: '/((?!__/).*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
}

export default nextConfig
