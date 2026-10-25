// Colunas dos CSVs — definidas uma única vez (usadas na lista de ativos e em Relatórios).
import { CATEGORIES, STATUS } from './status.js';

export function assetColumns(sectorName, { withCreatedAt = false } = {}) {
  const cols = [
    { label: 'Patrimônio', value: (a) => a.tag },
    { label: 'Nome', value: (a) => a.name },
    { label: 'Categoria', value: (a) => CATEGORIES[a.category] },
    { label: 'Nº de série', value: (a) => a.serial },
    { label: 'Setor de origem', value: (a) => sectorName(a.sectorId) },
    { label: 'Status', value: (a) => STATUS[a.status].label },
    { label: 'Responsável', value: (a) => a.assignedTo?.user ?? '' },
    { label: 'Setor atual', value: (a) => (a.assignedTo ? sectorName(a.assignedTo.sectorId) : sectorName(a.sectorId)) },
  ];
  if (withCreatedAt) cols.push({ label: 'Cadastrado em', value: (a) => a.createdAt });
  return cols;
}

// Tipos de evento em português (o banco guarda códigos em inglês; o CSV deve sair legível).
export const EVENT_TYPE_LABELS = {
  created: 'Cadastro',
  edited: 'Edição',
  checkout: 'Retirada',
  checkin: 'Devolução',
  maintenance: 'Manutenção',
  sterilization: 'Esterilização',
  restored: 'Liberação',
  retired: 'Baixa',
};

export function eventColumns({ sectorName, getAsset, describeEvent }) {
  return [
    { label: 'Data/hora', value: (e) => e.at },
    { label: 'Patrimônio', value: (e) => e.tag },
    { label: 'Ativo', value: (e) => getAsset(e.tag)?.name ?? '' },
    { label: 'Tipo', value: (e) => EVENT_TYPE_LABELS[e.type] ?? e.type },
    { label: 'Descrição', value: (e) => describeEvent(e, e.sectorId ? sectorName(e.sectorId) : '') },
    { label: 'Responsável', value: (e) => e.user ?? '' },
    { label: 'Setor', value: (e) => (e.sectorId ? sectorName(e.sectorId) : '') },
    { label: 'Observação', value: (e) => e.note ?? '' },
  ];
}
