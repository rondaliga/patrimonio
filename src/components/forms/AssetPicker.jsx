import { useEffect, useRef } from 'react';
import { Field, inputClass } from '../ui/Field.jsx';
import StatusBadge from '../ui/StatusBadge.jsx';
import { normalizeTag } from '../../services/rules.js';
import { useData } from '../../context/DataContext.jsx';
import { fmtDuration } from '../../lib/format.js';

// "RAD-0042" ou "RAD-0042 — Rádio…" -> ativo
export function resolveAsset(assets, text) {
  const t = normalizeTag(text).split(/\s+/)[0];
  return t ? assets.find((a) => a.tag === t) ?? null : null;
}

// Campo de texto com lista de sugestões (datalist) — rápido de usar com teclado ou leitor de código de barras.
export default function AssetPicker({ id, label, assets, value, onChange, error, hint, autoFocus, disabled }) {
  // Foco automático só em telas largas e sem rolar a página: no celular ele abria o teclado
  // e empurrava a tela para o formulário em vez de mostrar o início da página.
  const ref = useRef(null);
  useEffect(() => {
    if (autoFocus && window.matchMedia?.('(min-width: 768px)').matches) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint ?? 'Digite ou escaneie o código de patrimônio.'}>
      <input
        id={id}
        className={inputClass(error)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={`${id}-list`}
        placeholder="Ex.: RAD-0042"
        autoComplete="off"
        ref={ref}
        disabled={disabled}
      />
      <datalist id={`${id}-list`}>
        {assets.slice(0, 400).map((a) => (
          <option key={a.tag} value={a.tag}>{a.name}</option>
        ))}
      </datalist>
    </Field>
  );
}

export function AssetSummary({ asset }) {
  const { sectorName } = useData();
  if (!asset) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold text-brand-700">{asset.tag}</span>
        <span className="text-slate-700">{asset.name}</span>
        <StatusBadge status={asset.status} />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Setor de origem: {sectorName(asset.sectorId)}
        {asset.assignedTo &&
          ` · com ${asset.assignedTo.user} (${sectorName(asset.assignedTo.sectorId)}) há ${fmtDuration(asset.assignedTo.since)}`}
        {asset.maintenance && ` · ${asset.maintenance.reason}`}
      </p>
    </div>
  );
}
