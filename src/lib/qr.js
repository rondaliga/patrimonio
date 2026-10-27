// QR Code dos ativos: o que vai na etiqueta e como interpretar o que a câmera leu. Funções puras.
// O app usa roteamento por hash (GitHub Pages não tem fallback de rotas), então o link do ativo é
//   https://usuario.github.io/repo/#/ativos/RAD-0001?mover=1
// `mover=1` abre direto a retirada (ativo disponível) ou a devolução (ativo em uso) para quem pode movimentar.

export const TAG_RE = /^[A-Z0-9][A-Z0-9-]{2,19}$/; // mesma regra do banco (assets.tag)

// `base` = endereço da página sem o hash (padrão: o da janela atual).
export function assetUrl(tag, base = defaultBase()) {
  return `${base}#/ativos/${encodeURIComponent(tag)}?mover=1`;
}

function defaultBase() {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}`;
}

// Interpreta o texto lido de um QR e devolve o patrimônio, ou '' se não for deste sistema.
// Aceita: link completo (.../#/ativos/TAG?...), rota (#/ativos/TAG ou /ativos/TAG) e o patrimônio puro (RAD-0001).
export function tagFromScan(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const route = /#?\/ativos\/([^/?#\s]+)/i.exec(text);
  let candidate = text;
  if (route) {
    try {
      candidate = decodeURIComponent(route[1]);
    } catch {
      return '';
    }
  }
  candidate = candidate.toUpperCase();
  return TAG_RE.test(candidate) ? candidate : '';
}
