import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  output: 'static',
  outDir: '../../dist',
  srcDir: './src',
  publicDir: './public',
  integrations: [tailwind()],
});
