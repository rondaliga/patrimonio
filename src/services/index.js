// Ponto único de troca do backend.
//   - Com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY definidas: banco online (Fase 2).
//   - Sem elas: dados no localStorage do navegador (Fase 1).
import { createLocalAdapter } from './localAdapter.js';
import { createSupabaseAdapter } from './supabaseAdapter.js';
import { supabase, supabaseConfigured } from './supabaseClient.js';

export const api = supabaseConfigured ? createSupabaseAdapter(supabase) : createLocalAdapter();
export { ValidationError } from './rules.js';
