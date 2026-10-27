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

// "1 setor" / "3 setores": concordância correta em contadores.
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Remove acentos (NFD + descarta marcas combinantes).
export const stripAccents = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Normaliza para buscas sem acento/caixa.
export const fold = (s) => stripAccents(s).toLowerCase();

// "Centro Cirúrgico" -> "centro-cirurgico" (usado como id de setor)
export const slugify = (s) =>
  fold(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'setor';

// Limites de um período escolhido em dois campos de data ('AAAA-MM-DD', dia inteiro no horário local).
// Devolve ISO UTC ou '' para o lado em branco; início e fim invertidos são trocados.
export function dayRange(from, to) {
  const parse = (v, endOfDay) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? ''));
    if (!m) return null;
    const d = endOfDay ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999) : new Date(+m[1], +m[2] - 1, +m[3]);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  let a = parse(from, false);
  let b = parse(to, true);
  if (a && b && a > b) {
    // usuário digitou "fim" antes de "início": usa os dois dias, na ordem certa
    const first = parse(to, false);
    const last = parse(from, true);
    a = first;
    b = last;
  }
  return { start: a ? a.toISOString() : '', end: b ? b.toISOString() : '' };
}

export const fmtActive = (active) => (active ? 'Ativo' : 'Inativo');
