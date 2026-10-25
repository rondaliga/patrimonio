// Conversão entre linhas do banco (snake_case) e objetos do app (camelCase),
// e tradução de erros do PostgreSQL/Supabase em ValidationError. Funções puras.
import { ValidationError } from './rules.js';

// Colunas lidas do banco (menos tráfego que select('*'): ex.: a coluna `actor` do histórico não é usada).
export const ASSET_COLUMNS =
  'tag,name,category,serial,sector_id,notes,status,assigned_user,assigned_sector_id,assigned_since,assigned_note,maint_kind,maint_reason,maint_since,retired_reason,retired_at,created_at';
export const EVENT_COLUMNS = 'id,tag,type,at,user_name,sector_id,kind,condition,reason,note';

const iso = (v) => (v ? new Date(v).toISOString() : null);

export function rowToAsset(r) {
  return {
    tag: r.tag,
    name: r.name,
    category: r.category,
    serial: r.serial ?? '',
    sectorId: r.sector_id,
    notes: r.notes ?? '',
    status: r.status,
    assignedTo:
      r.status === 'in_use'
        ? { user: r.assigned_user, sectorId: r.assigned_sector_id, since: iso(r.assigned_since), note: r.assigned_note ?? '' }
        : null,
    maintenance:
      r.status === 'maintenance' ? { kind: r.maint_kind, reason: r.maint_reason, since: iso(r.maint_since) } : null,
    retired: r.status === 'retired' ? { reason: r.retired_reason, at: iso(r.retired_at) } : null,
    createdAt: iso(r.created_at),
  };
}

export function rowToEvent(r) {
  const e = { id: r.id, tag: r.tag, type: r.type, at: iso(r.at) };
  if (r.user_name != null) e.user = r.user_name;
  if (r.sector_id != null) e.sectorId = r.sector_id;
  for (const k of ['kind', 'condition', 'reason', 'note']) if (r[k] != null) e[k] = r[k];
  return e;
}

// Mensagens levantadas pelas funções RPC -> campo do formulário.
const FIELD_HINTS = [
  [/quem está retirando/i, 'user'],
  [/setor de destino/i, 'sectorId'],
  [/motivo/i, 'reason'],
  [/condição inválida/i, 'condition'],
  [/manutenção ou esterilização/i, 'kind'],
];

export function toValidationError(error) {
  if (error instanceof ValidationError) return error;
  const msg = String(error?.message || 'Erro desconhecido.');
  const code = error?.code;
  if (code === '42501' || /row-level security|permission denied|Sem permissão/i.test(msg)) {
    return new ValidationError('Sem permissão para esta operação.');
  }
  if (code === '23505') {
    if (/assets_pkey|tag/.test(msg)) return new ValidationError('Já existe um ativo com este patrimônio.', { tag: 'Já existe um ativo com este patrimônio.' });
    return new ValidationError('Já existe um setor com este nome.', { name: 'Já existe um setor com este nome.' });
  }
  if (code === '23503') {
    return new ValidationError('Este registro possui vínculos (ativos ou histórico). Mova-os antes de excluir.');
  }
  if (/JWT|expired|not authenticated/i.test(msg)) {
    return new ValidationError('Sessão expirada. Entre novamente.');
  }
  if (/failed to fetch|network|fetch failed/i.test(msg)) {
    return new ValidationError('Sem conexão com o servidor. Verifique a internet e tente de novo.');
  }
  const fields = {};
  for (const [re, field] of FIELD_HINTS) {
    if (re.test(msg)) {
      fields[field] = msg;
      break;
    }
  }
  return new ValidationError(msg, fields);
}

export const assetToInsert = (v) => ({
  tag: v.tag,
  name: v.name,
  category: v.category,
  serial: v.serial,
  sector_id: v.sectorId,
  notes: v.notes,
});
