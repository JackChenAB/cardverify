import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// During `vite dev` the backend runs separately; proxy API calls to it.
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/admin': { target: 'http://localhost:3000', changeOrigin: true },
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
