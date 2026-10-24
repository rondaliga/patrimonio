const dtf = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const df = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const fmtDateTime = (iso) => (iso ? dtf.format(new Date(iso)) : '—');
export const fmtDate = (iso) => (iso ? df.format(new Date(iso)) : '—');

export function hoursSince(iso, now = new Date()) {
  return (new Date(now).getTime() - new Date(iso).getTime()) / 3600000;
}

// "35 min", "14 h", "3 d"
export function fmtDuration(iso, now = new Date()) {
  const min = Math.max(0, Math.round(hoursSince(iso, now) * 60));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

// Remove acentos (NFD + descarta marcas combinantes).
export const stripAccents = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Normaliza para buscas sem acento/caixa.
export const fold = (s) => stripAccents(s).toLowerCase();

// "Centro Cirúrgico" -> "centro-cirurgico" (usado como id de setor)
export const slugify = (s) =>
  fold(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'setor';
