/** @type {import('next').NextConfig} */

import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  // webpack(config, { isServer }) {
  //   if (isServer) {
  //     config.externals = [...(config.externals ?? []), 'three', 'react-globe.gl']
  //   }
  //   return config
  // },

  turbopack: {
    root: path.resolve(__dirname),
  },
}

export default nextConfig
