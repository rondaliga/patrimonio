import { useState } from 'react';
import { Copy, Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Modal from '../ui/Modal.jsx';
import { assetUrl } from '../../lib/qr.js';
import { CATEGORIES } from '../../lib/status.js';
import { useToast } from '../../context/ToastContext.jsx';

// Etiqueta do ativo: QR Code com o link direto (#/ativos/TAG?mover=1) + patrimônio e nome em texto.
// "Imprimir" usa window.print(); o CSS de impressão (index.css) deixa só a etiqueta na página.
export default function QrLabelModal({ open, asset, sectorName, onClose }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  if (!asset) return null;
  const url = assetUrl(asset.tag);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar o link. Selecione e copie manualmente.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Etiqueta QR — ${asset.tag}`} size="sm">
      <div className="space-y-4">
        <div className="print-label mx-auto w-64 rounded-lg border-2 border-slate-800 bg-white p-4 text-center text-slate-900">
          <QRCodeSVG value={url} size={192} level="M" marginSize={1} className="mx-auto h-auto w-full" title={`QR Code do ativo ${asset.tag}`} />
          <p className="mt-2 font-mono text-lg font-bold tracking-wide">{asset.tag}</p>
          <p className="text-sm font-medium leading-tight">{asset.name}</p>
          <p className="text-[11px] text-slate-600">{CATEGORIES[asset.category]} · {sectorName(asset.sectorId)}</p>
          <p className="mt-1 text-[10px] text-slate-500">Escaneie para retirar ou devolver</p>
        </div>
        <p className="break-all rounded bg-slate-50 dark:bg-slate-800/60 px-2 py-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">{url}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={copy}>
            <Copy className="h-4 w-4" /> {copied ? 'Link copiado' : 'Copiar link'}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimir etiqueta
          </button>
        </div>
      </div>
    </Modal>
  );
}
