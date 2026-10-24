// CSV no padrão brasileiro (separador ";" + BOM para o Excel abrir com acentos).
// Células que começam com = + - @ recebem um apóstrofo para evitar injeção de fórmulas.
function cell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows, columns) {
  const head = columns.map((c) => cell(c.label)).join(';');
  const body = rows.map((r) => columns.map((c) => cell(c.value(r))).join(';'));
  return '﻿' + [head, ...body].join('\r\n');
}
