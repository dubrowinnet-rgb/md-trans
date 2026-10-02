/** @type {import('next').NextConfig} */
const nextConfig = {
  // Кабинет целиком работает в браузере (данные и вход — напрямую в
  // Supabase), своего сервера ему не нужно. `next build` собирает обычные
  // файлы в папку out/, их можно выложить на любой хостинг.
  output: 'export',
  trailingSlash: true,
  experimental: {
    optimizePackageImports: ['@mantine/core', '@mantine/dates', '@tabler/icons-react'],
  },
};

export default nextConfig;
