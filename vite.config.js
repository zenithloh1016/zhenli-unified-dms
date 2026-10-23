import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: false,
    rollupOptions: { input: { main:resolve('index.html'),sign:resolve('sign/index.html'),taskHub:resolve('task-hub-cloud/index.html') } }
  }
});
