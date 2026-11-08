import { defineConfig } from 'vite';

// base './' damit der Build auch in einem Unterordner (z. B. GitHub Pages) läuft
export default defineConfig({ base: './', server: { port: 5198, host: true } });
