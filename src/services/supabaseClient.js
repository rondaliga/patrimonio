// Cria o cliente do Supabase a partir das variáveis do Vite (.env.local).
// A anon key é pública por desenho; quem protege os dados é o login + RLS.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env?.VITE_SUPABASE_URL;
const key = import.meta.env?.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && key);
export const supabase = supabaseConfigured ? createClient(url, key) : null;
