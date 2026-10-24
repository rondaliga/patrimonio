// Ciclo de vida do ativo — fonte única de verdade para rótulos e cores.
export const STATUS = {
  available: {
    label: 'Disponível',
    badge: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20',
    dot: 'bg-emerald-500',
    hex: '#10b981',
  },
  in_use: {
    label: 'Em uso',
    badge: 'bg-sky-100 text-sky-800 ring-sky-600/20',
    dot: 'bg-sky-500',
    hex: '#0ea5e9',
  },
  maintenance: {
    label: 'Manutenção / Esterilização',
    badge: 'bg-amber-100 text-amber-800 ring-amber-600/20',
    dot: 'bg-amber-400',
    hex: '#f59e0b',
  },
  retired: {
    label: 'Baixado',
    badge: 'bg-red-100 text-red-800 ring-red-600/20',
    dot: 'bg-red-500',
    hex: '#ef4444',
  },
};

export const STATUS_ORDER = ['available', 'in_use', 'maintenance', 'retired'];

export const CATEGORIES = {
  wheelchair: 'Cadeira de rodas',
  stretcher: 'Maca',
  infusion_pump: 'Bomba de infusão',
  monitor: 'Monitor multiparamétrico',
  radio: 'Rádio comunicador',
  collector: 'Coletor de dados',
  computer: 'Computador',
  printer: 'Impressora',
};

// Prefixo do número de patrimônio sugerido por categoria (ex.: RAD-0042).
export const CATEGORY_PREFIX = {
  wheelchair: 'CDR',
  stretcher: 'MAC',
  infusion_pump: 'BIN',
  monitor: 'MON',
  radio: 'RAD',
  collector: 'COL',
  computer: 'PC',
  printer: 'IMP',
};

// Modelos/nomes sugeridos no cadastro (alimentam o autocompletar).
export const MODELS = {
  wheelchair: ['Cadeira de rodas adulto', 'Cadeira de rodas obeso', 'Cadeira de rodas infantil'],
  stretcher: ['Maca de transporte', 'Maca hidráulica'],
  infusion_pump: ['Bomba de infusão volumétrica', 'Bomba de infusão de seringa'],
  monitor: ['Monitor multiparamétrico'],
  radio: ['Rádio comunicador HT-760'],
  collector: ['Coletor de dados Zebra TC21'],
  computer: ['Computador desktop', 'Notebook'],
  printer: ['Impressora térmica', 'Impressora laser'],
};

export const MAINTENANCE_KINDS = {
  maintenance: 'Manutenção',
  sterilization: 'Esterilização',
};

// Condição do ativo na devolução (check-in).
export const CONDITIONS = {
  ok: 'Em bom estado — volta a ficar disponível',
  maintenance: 'Precisa de manutenção',
  sterilization: 'Precisa de esterilização',
};

// Empréstimo acima deste tempo é considerado "prolongado" (dashboard e relatórios).
export const LONG_LOAN_HOURS = 12;
