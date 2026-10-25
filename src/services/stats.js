// Cálculos do dashboard e relatórios — funções puras sobre os dados em memória.
import { STATUS_ORDER } from '../lib/status.js';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const zero = () => Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]));

const RECENT_LIMIT = 6;
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

// Uma única passada sobre ativos e eventos (antes eram várias, incluindo 7 varreduras
// dos eventos só para o gráfico semanal e uma ordenação completa para a atividade recente).
export function computeStats({ assets, events, sectors, now = new Date() }) {
  const nowDate = new Date(now);
  const statusTotals = zero();
  const bySectorMap = new Map(sectors.map((s) => [s.id, { id: s.id, sector: s.name, byStatus: zero(), total: 0 }]));
  const sectorNames = new Map(sectors.map((s) => [s.id, s.name]));
  const sectorName = (id) => sectorNames.get(id) ?? '—';

  const activeLoans = [];
  for (const a of assets) {
    statusTotals[a.status] += 1;
    const row = bySectorMap.get(a.sectorId);
    if (row) {
      row.byStatus[a.status] += 1;
      row.total += 1;
    }
    if (a.status === 'in_use' && a.assignedTo) {
      activeLoans.push({
        tag: a.tag,
        asset: a.name,
        category: a.category,
        user: a.assignedTo.user,
        sector: sectorName(a.assignedTo.sectorId),
        since: a.assignedTo.since,
      });
    }
  }
  activeLoans.sort((x, y) => x.since.localeCompare(y.since));

  // Últimos 7 dias (hoje por último): cada dia vira um "balde" identificado pela data local.
  const today = startOfDay(nowDate);
  const weekly = [];
  const bucket = new Map();
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const slot = { day: WEEKDAYS[day.getDay()], value: 0 };
    bucket.set(dayKey(day), slot);
    weekly.push(slot);
  }
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);
  const weekStartMs = weekStart.getTime();
  const weekEndMs = today.getTime() + 86400000 * 2; // folga p/ horário de verão; o balde decide

  // Os 6 eventos mais recentes (exceto cadastro/edição), mantidos numa lista pequena e ordenada.
  const recent = [];
  for (const e of events) {
    if (e.type === 'checkout') {
      const ms = Date.parse(e.at);
      if (ms >= weekStartMs && ms < weekEndMs) {
        const slot = bucket.get(dayKey(new Date(ms)));
        if (slot) slot.value += 1;
      }
    }
    if (e.type === 'created' || e.type === 'edited') continue;
    if (recent.length === RECENT_LIMIT && e.at <= recent[RECENT_LIMIT - 1].at) continue;
    let i = recent.length;
    while (i > 0 && recent[i - 1].at < e.at) i--;
    recent.splice(i, 0, e);
    if (recent.length > RECENT_LIMIT) recent.pop();
  }

  return {
    total: assets.length,
    statusTotals,
    bySector: [...bySectorMap.values()],
    activeLoans,
    weekly: weekly.map(({ day, value }) => ({ day, value })),
    recent,
    radiosLoaned: activeLoans.filter((l) => l.category === 'radio').length,
    chairsLoaned: activeLoans.filter((l) => l.category === 'wheelchair').length,
  };
}

// Pareia cada check-out com o check-in seguinte do mesmo ativo.
export function loanDurations(events) {
  const open = new Map();
  const out = [];
  let ordered = events;
  for (let i = 1; i < events.length; i++) {
    if (events[i - 1].at > events[i].at) {
      ordered = [...events].sort((a, b) => a.at.localeCompare(b.at));
      break;
    }
  }
  for (const e of ordered) {
    if (e.type === 'checkout') open.set(e.tag, e);
    else if (e.type === 'checkin' && open.has(e.tag)) {
      const start = open.get(e.tag);
      open.delete(e.tag);
      out.push({
        tag: e.tag,
        sectorId: start.sectorId,
        hours: (new Date(e.at) - new Date(start.at)) / 3600000,
        endedAt: e.at,
      });
    }
  }
  return out;
}
