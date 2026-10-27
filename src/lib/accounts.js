// Regras de contas de usuário (funções puras, compartilhadas pela tela, pelo adaptador e pelos testes).
// Espelham as validações das funções admin_* de supabase/schema.sql: o banco é quem decide de verdade.

// O Supabase Auth só entende e-mail. O app mostra "usuário", e por baixo usa usuario@patrimonio.invalid
// (".invalid" é um domínio reservado: nunca recebe mensagens).
export const LOGIN_DOMAIN = 'patrimonio.invalid';

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // limite do bcrypt

// Mensagem exibida quando uma conta desativada tenta entrar.
export const INACTIVE_MESSAGE = 'Sua conta está inativa. Entre em contato com o administrador.';

export const normalizeUsername = (v) => String(v ?? '').trim().toLowerCase();

// Quem digita um e-mail (conta antiga) continua entrando; o resto vira usuario@dominio-interno.
export function loginEmail(input) {
  const u = normalizeUsername(input);
  return u.includes('@') ? u : `${u}@${LOGIN_DOMAIN}`;
}

export function usernameFromEmail(email) {
  const e = String(email ?? '').toLowerCase();
  return e.endsWith(`@${LOGIN_DOMAIN}`) ? e.slice(0, -(LOGIN_DOMAIN.length + 1)) : e;
}

export function validateUsername(v) {
  const u = normalizeUsername(v);
  if (!u) return 'Informe o nome de usuário.';
  if (!USERNAME_RE.test(u)) return 'Use de 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado (sem espaços ou acentos).';
  return '';
}

export function validatePassword(p) {
  const s = String(p ?? '');
  if (s.length < PASSWORD_MIN) return `A senha deve ter pelo menos ${PASSWORD_MIN} caracteres.`;
  if (s.length > PASSWORD_MAX) return `A senha deve ter no máximo ${PASSWORD_MAX} caracteres.`;
  return '';
}

// Senha aleatória sem caracteres que se confundem (0/O, 1/l/I) para o administrador ditar ou copiar.
export function generatePassword(length = 12, rand = defaultRandom) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) out += chars[rand(chars.length)];
  return out;
}

function defaultRandom(n) {
  const buf = new Uint32Array(1);
  // descarta valores que enviesariam o sorteio (viés do módulo)
  const limit = Math.floor(0x100000000 / n) * n;
  do globalThis.crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % n;
}
