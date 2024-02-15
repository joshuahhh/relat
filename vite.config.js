import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    // proxy: {
    //   '^.*\?t=.*': {
    //     target: 'http://localhost:5173/',
    //     rewrite: (path) => {
    //       const newPath = path.replace(/\?.*/, '');
    //       console.log(`rewriting ${path} to ${newPath}`);
    //       return newPath;
    //     },
    //   },
    // }
  }
});
