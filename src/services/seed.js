// Dados de demonstração gerados de forma determinística (mesma "semente" = mesmo resultado),
// com datas relativas a "agora" para o dashboard sempre parecer vivo.
import { CATEGORY_PREFIX, MODELS } from '../lib/status.js';

export const DEFAULT_SECTORS = [
  { id: 'uti', name: 'UTI' },
  { id: 'ps', name: 'Pronto-Socorro' },
  { id: 'cc', name: 'Centro Cirúrgico' },
  { id: 'ped', name: 'Pediatria' },
  { id: 'eng', name: 'Engenharia Clínica' },
  { id: 'ti', name: 'TI' },
];

// Quantidade de ativos por setor e categoria.
const PLAN = {
  uti: { monitor: 10, infusion_pump: 14, radio: 6, wheelchair: 2, computer: 3 },
  ps: { wheelchair: 12, stretcher: 14, radio: 8, monitor: 6, infusion_pump: 6, computer: 3 },
  cc: { monitor: 8, infusion_pump: 8, radio: 5, stretcher: 6, computer: 2 },
  ped: { wheelchair: 5, monitor: 4, infusion_pump: 6, radio: 3, collector: 2 },
  eng: { monitor: 3, infusion_pump: 4, radio: 2, wheelchair: 2, stretcher: 2 },
  ti: { computer: 14, printer: 8, collector: 6, radio: 4 },
};

const PEOPLE = [
  'Dra. Marina Souza',
  'Enf. Carlos Pereira',
  'Maqueiro João Lima',
  'Téc. Paula Ramos',
  'Farm. Ricardo Alves',
  'Maqueiro Tiago Reis',
  'Enf. Luciana Prado',
  'Dr. André Matos',
  'Téc. Bruno Alves',
  'Enf. Fernanda Lopes',
];

const MAINT_REASONS = {
  maintenance: ['Calibração preventiva', 'Bateria não segura carga', 'Falha no display', 'Ruído no motor', 'Troca de roda'],
  sterilization: ['Esterilização após uso no CC', 'Limpeza terminal', 'Desinfecção de alto nível'],
};
const RETIRE_REASONS = ['Fim de vida útil', 'Dano irreparável', 'Obsolescência tecnológica'];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSeed(now = new Date()) {
  const rand = rng(20261020);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const t0 = new Date(now).getTime();
  const H = 3600000;
  const D = 24 * H;
  const iso = (ms) => new Date(ms).toISOString();

  const sectors = DEFAULT_SECTORS.map((s) => ({ ...s }));
  const counters = {};
  const assets = [];
  const events = [];

  for (const sector of sectors) {
    for (const [category, n] of Object.entries(PLAN[sector.id] || {})) {
      for (let i = 0; i < n; i++) {
        const prefix = CATEGORY_PREFIX[category];
        counters[prefix] = (counters[prefix] || 0) + 1;
        const tag = `${prefix}-${String(counters[prefix]).padStart(4, '0')}`;
        const createdMs = t0 - (30 + rand() * 300) * D;
        const roll = rand();
        const status = roll < 0.3 ? 'available' : roll < 0.85 ? 'in_use' : roll < 0.95 ? 'maintenance' : 'retired';

        const asset = {
          tag,
          name: pick(MODELS[category]),
          category,
          serial: `SN${Math.floor(rand() * 9e8 + 1e8)}`,
          sectorId: sector.id,
          status,
          assignedTo: null,
          maintenance: null,
          retired: null,
          notes: '',
          createdAt: iso(createdMs),
        };
        events.push({ tag, type: 'created', at: iso(createdMs) });

        let limit = t0; // até quando posso inventar empréstimos passados
        if (status === 'in_use') {
          // distribuição enviesada: a maioria dos empréstimos é curta (poucas horas)
          const sinceMs = t0 - (0.3 + rand() ** 3 * 30) * H;
          const user = pick(PEOPLE);
          const destination = rand() < 0.7 ? sector.id : pick(sectors).id;
          asset.assignedTo = { user, sectorId: destination, since: iso(sinceMs), note: '' };
          events.push({ tag, type: 'checkout', at: iso(sinceMs), user, sectorId: destination, note: '' });
          limit = sinceMs;
        } else if (status === 'maintenance') {
          const kind = rand() < 0.35 ? 'sterilization' : 'maintenance';
          const sinceMs = t0 - (2 + rand() * 90) * H;
          const reason = pick(MAINT_REASONS[kind]);
          asset.maintenance = { kind, reason, since: iso(sinceMs) };
          events.push({ tag, type: kind, at: iso(sinceMs), kind, reason });
          limit = sinceMs;
        } else if (status === 'retired') {
          const atMs = t0 - (2 + rand() * 40) * D;
          const reason = pick(RETIRE_REASONS);
          asset.retired = { reason, at: iso(atMs) };
          events.push({ tag, type: 'retired', at: iso(atMs), reason });
          limit = atMs;
        }

        // Empréstimos já devolvidos nos últimos 7 dias (alimentam o gráfico semanal).
        const windowStart = t0 - 7 * D;
        if (status !== 'retired' && limit - windowStart > 14 * H && rand() < 0.6) {
          const pairs = 1 + Math.floor(rand() * 3);
          for (let k = 0; k < pairs; k++) {
            const out = windowStart + rand() * (limit - windowStart - 12 * H);
            const back = out + (1 + rand() * 8) * H;
            const user = pick(PEOPLE);
            const destination = rand() < 0.7 ? sector.id : pick(sectors).id;
            events.push({ tag, type: 'checkout', at: iso(out), user, sectorId: destination, note: '' });
            events.push({ tag, type: 'checkin', at: iso(back), user, sectorId: sector.id, condition: 'ok', note: '' });
          }
        }
        assets.push(asset);
      }
    }
  }

  events.sort((a, b) => a.at.localeCompare(b.at));
  assets.sort((a, b) => a.tag.localeCompare(b.tag));
  return { sectors, assets, events };
}
