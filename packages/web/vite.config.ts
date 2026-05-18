import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/validate': 'http://localhost:3000',
      '/calculate': 'http://localhost:3000',
      '/countries': 'http://localhost:3000',
      '/admin': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      '/metrics': 'http://localhost:3000',
    },
  },
});
