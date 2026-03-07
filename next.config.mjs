/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config, { isServer }) {
    if (isServer) {
      config.externals = [...(config.externals ?? []), 'three', 'react-globe.gl']
    }
    return config
  },
}

export default nextConfig
