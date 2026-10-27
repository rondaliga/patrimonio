// Auditoria visual: quem REGISTROU cada ação no sistema (≠ de quem retirou/devolveu o ativo, `ev.user`).

// Substantivo e concordância ("Retirada registrada por…", "Cadastro registrado por…").
const ACTIONS = {
  checkout: ['Retirada', 'registrada'],
  checkin: ['Devolução', 'registrada'],
  maintenance: ['Envio para manutenção', 'registrado'],
  sterilization: ['Envio para esterilização', 'registrado'],
  restored: ['Conclusão de manutenção', 'registrada'],
  retired: ['Baixa', 'registrada'],
  created: ['Cadastro', 'registrado'],
  edited: ['Edição', 'registrada'],
};

// Nome de usuário (ex.: maria.souza); se a conta nunca teve um, o nome completo. '' quando não há autoria.
export const actorLabel = (ev) => ev?.actorUsername || ev?.actorName || '';

// "Retirada registrada por maria.souza" ('' quando o evento não tem autoria: dados antigos ou modo local).
export function registeredBy(ev) {
  const who = actorLabel(ev);
  if (!who) return '';
  const [noun, verb] = ACTIONS[ev.type] ?? ['Ação', 'registrada'];
  return `${noun} ${verb} por ${who}`;
}

// Texto para busca por responsável: junta tudo o que identifica a pessoa que registrou ou que retirou.
export const actorSearchText = (ev) => [ev.actorUsername, ev.actorName, ev.user].filter(Boolean).join(' ');
