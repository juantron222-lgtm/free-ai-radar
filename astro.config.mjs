import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://free-ai-radar-git-main-nada-de-pro.vercel.app',
  vite: {
    plugins: [tailwindcss()],
  },
});
