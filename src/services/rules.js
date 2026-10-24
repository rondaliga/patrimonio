// Regras de negócio puras (sem React, sem storage, sem rede).
// Tudo aqui recebe dados e devolve dados novos — por isso serve igual para o
// adaptador local (localStorage) e para um backend futuro (Supabase/API).
import { CATEGORIES, CATEGORY_PREFIX, MAINTENANCE_KINDS, STATUS } from '../lib/status.js';

export class ValidationError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

const clean = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');

export const TAG_RE = /^[A-Z0-9][A-Z0-9-]{2,19}$/;
export const normalizeTag = (v) => String(v ?? '').trim().toUpperCase();

// Ciclo de vida permitido. "Baixado" é definitivo.
export const TRANSITIONS = {
  available: ['in_use', 'maintenance', 'retired'],
  in_use: ['available', 'maintenance'],
  maintenance: ['available', 'retired'],
  retired: [],
};
export const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);

const label = (status) => STATUS[status]?.label ?? status;

function assertStatus(asset, allowed, action, hint = '') {
  if (!allowed.includes(asset.status)) {
    throw new ValidationError(
      `Não é possível ${action}: ${asset.tag} está "${label(asset.status)}".${hint ? ' ' + hint : ''}`
    );
  }
}

function assertText(value, min, field, message) {
  if (clean(value).length < min) throw new ValidationError(message, { [field]: message });
}

// ---------- Cadastro ----------

export function nextTag(category, assets) {
  const prefix = CATEGORY_PREFIX[category] || 'ATV';
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const a of assets) {
    const m = re.exec(a.tag);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

// Valida e normaliza os dados do formulário de ativo. Lança ValidationError com `fields`.
export function normalizeAssetInput(input, { sectors, assets, isNew, currentTag }) {
  const errors = {};
  const value = {
    tag: normalizeTag(isNew ? input.tag : currentTag),
    name: clean(input.name),
    category: input.category,
    serial: clean(input.serial),
    sectorId: input.sectorId,
    notes: String(input.notes ?? '').trim(),
  };

  if (isNew) {
    if (!TAG_RE.test(value.tag)) {
      errors.tag = 'Use 3 a 20 caracteres: letras maiúsculas, números e hífen (ex.: RAD-0042).';
    } else if (assets.some((a) => a.tag === value.tag)) {
      errors.tag = 'Já existe um ativo com este patrimônio.';
    }
  }
  if (value.name.length < 2) errors.name = 'Informe o nome do ativo.';
  if (!CATEGORIES[value.category]) errors.category = 'Escolha uma categoria.';
  if (!sectors.some((s) => s.id === value.sectorId)) errors.sectorId = 'Escolha o setor.';

  if (Object.keys(errors).length) {
    throw new ValidationError('Corrija os campos destacados.', errors);
  }
  return value;
}

export function canDelete(asset, events) {
  if (asset.status === 'in_use') return false;
  return !events.some((e) => e.tag === asset.tag && !['created', 'edited'].includes(e.type));
}

// ---------- Movimentações ----------
// Cada função devolve { asset, events } — o chamador persiste.

export function applyCheckOut(asset, { user, sectorId, note, at }, sectors) {
  assertStatus(asset, ['available'], 'fazer check-out', 'Só ativos disponíveis podem ser retirados.');
  const errors = {};
  if (clean(user).length < 2) errors.user = 'Informe quem está retirando.';
  if (!sectors.some((s) => s.id === sectorId)) errors.sectorId = 'Escolha o setor de destino.';
  if (Object.keys(errors).length) throw new ValidationError('Corrija os campos destacados.', errors);

  const who = clean(user);
  return {
    asset: {
      ...asset,
      status: 'in_use',
      assignedTo: { user: who, sectorId, since: at, note: clean(note) },
    },
    events: [{ tag: asset.tag, type: 'checkout', at, user: who, sectorId, note: clean(note) }],
  };
}

export function applyCheckIn(asset, { condition = 'ok', note, at }) {
  assertStatus(asset, ['in_use'], 'fazer check-in', 'Só ativos em uso podem ser devolvidos.');
  if (!['ok', ...Object.keys(MAINTENANCE_KINDS)].includes(condition)) {
    throw new ValidationError('Condição inválida.', { condition: 'Escolha a condição do ativo.' });
  }
  const user = asset.assignedTo?.user ?? '';
  const events = [
    { tag: asset.tag, type: 'checkin', at, user, sectorId: asset.sectorId, condition, note: clean(note) },
  ];
  if (condition === 'ok') {
    return { asset: { ...asset, status: 'available', assignedTo: null }, events };
  }
  const reason = clean(note) || `Devolvido com necessidade de ${MAINTENANCE_KINDS[condition].toLowerCase()}`;
  events.push({ tag: asset.tag, type: condition, at, kind: condition, reason });
  return {
    asset: {
      ...asset,
      status: 'maintenance',
      assignedTo: null,
      maintenance: { kind: condition, reason, since: at },
    },
    events,
  };
}

export function applySendToMaintenance(asset, { kind, reason, at }) {
  assertStatus(asset, ['available'], 'enviar para manutenção', 'Se estiver em uso, faça o check-in primeiro.');
  if (!MAINTENANCE_KINDS[kind]) {
    throw new ValidationError('Escolha o tipo.', { kind: 'Escolha manutenção ou esterilização.' });
  }
  assertText(reason, 3, 'reason', 'Descreva o motivo.');
  const why = clean(reason);
  return {
    asset: { ...asset, status: 'maintenance', maintenance: { kind, reason: why, since: at } },
    events: [{ tag: asset.tag, type: kind, at, kind, reason: why }],
  };
}

export function applyCompleteMaintenance(asset, { note, at }) {
  assertStatus(asset, ['maintenance'], 'concluir a manutenção');
  return {
    asset: { ...asset, status: 'available', maintenance: null },
    events: [
      { tag: asset.tag, type: 'restored', at, kind: asset.maintenance?.kind ?? 'maintenance', note: clean(note) },
    ],
  };
}

export function applyRetire(asset, { reason, at }) {
  assertStatus(asset, ['available', 'maintenance'], 'dar baixa', 'Se estiver em uso, faça o check-in primeiro.');
  assertText(reason, 3, 'reason', 'Informe o motivo da baixa.');
  const why = clean(reason);
  return {
    asset: { ...asset, status: 'retired', maintenance: null, retired: { reason: why, at } },
    events: [{ tag: asset.tag, type: 'retired', at, reason: why }],
  };
}

// ---------- Texto do histórico ----------

export function describeEvent(ev, sectorName = '') {
  const kindLabel = (MAINTENANCE_KINDS[ev.kind] || 'Manutenção').toLowerCase();
  switch (ev.type) {
    case 'created':
      return 'Ativo cadastrado';
    case 'edited':
      return 'Cadastro atualizado';
    case 'checkout':
      return `Retirado por ${ev.user}${sectorName ? ` para ${sectorName}` : ''}`;
    case 'checkin': {
      const extra =
        ev.condition && ev.condition !== 'ok'
          ? ` — precisa de ${(MAINTENANCE_KINDS[ev.condition] || '').toLowerCase()}`
          : '';
      return `Devolvido${ev.user ? ` por ${ev.user}` : ''}${extra}`;
    }
    case 'maintenance':
      return `Enviado para manutenção: ${ev.reason}`;
    case 'sterilization':
      return `Enviado para esterilização: ${ev.reason}`;
    case 'restored':
      return `${kindLabel[0].toUpperCase()}${kindLabel.slice(1)} concluída — disponível`;
    case 'retired':
      return `Baixado: ${ev.reason}`;
    default:
      return ev.type;
  }
}
