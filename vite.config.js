import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' faz o build funcionar em qualquer subcaminho do GitHub Pages
// (https://usuario.github.io/nome-do-repo/) sem precisar editar nada.
//
// O build vai para dist/ (não vai para o Git). O fluxo .github/workflows/deploy.yml compila e
// publica no GitHub Pages sozinho a cada upload — não é preciso rodar o build à mão.
export default defineConfig({
  base: './',
  plugins: [react()],
});
