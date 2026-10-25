// Ponto único de troca do backend — carregado sob demanda.
//   - Com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY definidas: banco online (Fase 2).
//   - Sem elas: dados no localStorage do navegador (Fase 1).
//
// Os adaptadores são importados dinamicamente: no modo local o @supabase/supabase-js
// nem é baixado, e no modo online o código do localStorage/seed não entra no caminho crítico.
export async function loadApi() {
  const url = import.meta.env?.VITE_SUPABASE_URL;
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY;
  if (url && key) {
    const [{ createSupabaseAdapter }, { supabase }] = await Promise.all([
      import('./supabaseAdapter.js'),
      import('./supabaseClient.js'),
    ]);
    return createSupabaseAdapter(supabase);
  }
  const { createLocalAdapter } = await import('./localAdapter.js');
  return createLocalAdapter();
}

export { ValidationError } from './rules.js';
