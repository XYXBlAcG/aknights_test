import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/aknights_test/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor.html'),
        customEditor: resolve(__dirname, 'custom-editor.html')
      }
    }
  }
});
