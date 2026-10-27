import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' faz o build funcionar em qualquer subcaminho do GitHub Pages
// (https://usuario.github.io/nome-do-repo/) sem precisar editar nada.
//
// O build vai para dist/ (não vai para o Git). O fluxo .github/workflows/deploy.yml compila e
// publica no GitHub Pages sozinho a cada upload — não é preciso rodar o build à mão.
//
// Carregamento: o código é dividido em pedaços (chunks). As bibliotecas ficam em arquivos próprios,
// que quase nunca mudam e continuam em cache entre as publicações; o Supabase só é baixado
// no modo online (import dinâmico em src/services/index.js).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('html5-qrcode')) return 'qr-scanner'; // só baixa ao abrir o leitor de QR
          return undefined;
        },
      },
    },
  },
});
