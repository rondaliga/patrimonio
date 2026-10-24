// Cálculos do dashboard e relatórios — funções puras sobre os dados em memória.
import { STATUS_ORDER } from '../lib/status.js';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const zero = () => Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]));

export function computeStats({ assets, events, sectors, now = new Date() }) {
  const nowDate = new Date(now);
  const statusTotals = zero();
  const bySectorMap = new Map(sectors.map((s) => [s.id, { id: s.id, sector: s.name, byStatus: zero(), total: 0 }]));

  for (const a of assets) {
    statusTotals[a.status] += 1;
    const row = bySectorMap.get(a.sectorId);
    if (row) {
      row.byStatus[a.status] += 1;
      row.total += 1;
    }
  }

  const sectorName = (id) => sectors.find((s) => s.id === id)?.name ?? '—';
  const activeLoans = assets
    .filter((a) => a.status === 'in_use' && a.assignedTo)
    .map((a) => ({
      tag: a.tag,
      asset: a.name,
      category: a.category,
      user: a.assignedTo.user,
      sector: sectorName(a.assignedTo.sectorId),
      since: a.assignedTo.since,
    }))
    .sort((x, y) => x.since.localeCompare(y.since));

  const today = startOfDay(nowDate);
  const weekly = [];
  for (let i = 6; i >= 0; i--) {
    const from = new Date(today);
    from.setDate(from.getDate() - i);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    const value = events.filter((e) => e.type === 'checkout' && new Date(e.at) >= from && new Date(e.at) < to).length;
    weekly.push({ day: WEEKDAYS[from.getDay()], value });
  }

  const recent = events
    .filter((e) => e.type !== 'created' && e.type !== 'edited')
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);

  return {
    total: assets.length,
    statusTotals,
    bySector: [...bySectorMap.values()],
    activeLoans,
    weekly,
    recent,
    radiosLoaned: activeLoans.filter((l) => l.category === 'radio').length,
    chairsLoaned: activeLoans.filter((l) => l.category === 'wheelchair').length,
  };
}

// Pareia cada check-out com o check-in seguinte do mesmo ativo.
export function loanDurations(events) {
  const open = new Map();
  const out = [];
  for (const e of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
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
