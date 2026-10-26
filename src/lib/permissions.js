// Matriz de permissões por papel — espelha as políticas RLS de supabase/schema.sql.
// O banco é quem protege os dados; isto só esconde botões que dariam erro.
export const ROLES = {
  admin: 'Administrador',
  tecnico: 'Técnico',
  enfermagem: 'Enfermagem',
  consulta: 'Visualizador',
};

// Explicação curta de cada perfil (tela de usuários).
export const ROLE_HINTS = {
  admin: 'Acesso total: cadastra, movimenta, apaga registros e gerencia usuários.',
  tecnico: 'Cadastra e edita ativos, movimenta e cuida de manutenção e baixa.',
  enfermagem: 'Registra retirada e devolução de ativos.',
  consulta: 'Só visualiza: painel, ativos, histórico e relatórios.',
};
export const ROLE_ORDER = ['admin', 'tecnico', 'enfermagem', 'consulta'];

const MATRIX = {
  'asset.create': ['admin', 'tecnico'],
  'asset.edit': ['admin', 'tecnico'],
  'asset.delete': ['admin'],
  movement: ['admin', 'tecnico', 'enfermagem'], // retirada / devolução
  maintenance: ['admin', 'tecnico'], // enviar, concluir, baixar
  'sector.manage': ['admin'],
  'data.admin': ['admin'], // importar / restaurar demo / apagar tudo
  'user.manage': ['admin'], // criar contas, mudar perfil, redefinir senha e excluir usuários
  'event.delete': ['admin'], // excluir um registro do histórico de movimentações
};

export const can = (role, action) => (MATRIX[action] ?? []).includes(role);
