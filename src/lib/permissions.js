// Matriz de permissões por papel — espelha as políticas RLS de supabase/schema.sql.
// O banco é quem protege os dados; isto só esconde botões que dariam erro.
export const ROLES = {
  admin: 'Administrador',
  tecnico: 'Técnico',
  enfermagem: 'Enfermagem',
  consulta: 'Consulta',
};

const MATRIX = {
  'asset.create': ['admin', 'tecnico'],
  'asset.edit': ['admin', 'tecnico'],
  'asset.delete': ['admin'],
  movement: ['admin', 'tecnico', 'enfermagem'], // retirada / devolução
  maintenance: ['admin', 'tecnico'], // enviar, concluir, baixar
  'sector.manage': ['admin'],
  'data.admin': ['admin'], // importar / restaurar demo / apagar tudo
};

export const can = (role, action) => (MATRIX[action] ?? []).includes(role);
