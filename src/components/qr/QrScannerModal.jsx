import { useEffect, useRef, useState } from 'react';
import { ScanLine } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import { Field, FormError, inputClass } from '../ui/Field.jsx';
import { useData } from '../../context/DataContext.jsx';
import { tagFromScan } from '../../lib/qr.js';
import { navigate } from '../../router/hashRouter.js';

const READER_ID = 'qr-reader';

// Leitor de QR Code pela câmera (html5-qrcode, carregado só quando o leitor abre).
// Lê o link/patrimônio da etiqueta e abre o ativo já com a retirada/devolução pronta (?mover=1).
// A câmera só funciona em HTTPS (o GitHub Pages é) ou em localhost; sem câmera, dá para digitar o patrimônio.
export default function QrScannerModal({ open, onClose }) {
  const { getAsset } = useData();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('starting'); // starting | scanning | unavailable
  const [manual, setManual] = useState('');
  const handled = useRef(false);
  const getAssetRef = useRef(getAsset);
  getAssetRef.current = getAsset;

  const go = (raw) => {
    const tag = tagFromScan(raw);
    if (!tag) {
      setError('Este QR Code não é de um ativo deste sistema.');
      return false;
    }
    if (!getAssetRef.current(tag)) {
      setError(`Ativo ${tag} não encontrado.`);
      return false;
    }
    handled.current = true;
    onClose();
    navigate(`/ativos/${encodeURIComponent(tag)}?mover=1`);
    return true;
  };

  useEffect(() => {
    if (!open) return undefined;
    handled.current = false;
    setError('');
    setStatus('starting');
    let cancelled = false;
    let scanner = null;
    let started = false;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera-unsupported');
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (cancelled) return;
        scanner = new Html5Qrcode(READER_ID, { verbose: false, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] });
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: (w, h) => {
              const side = Math.floor(Math.min(w, h) * 0.75);
              return { width: side, height: side };
            },
          },
          (text) => {
            if (handled.current) return;
            go(text);
          },
          () => {} // quadros sem QR: normal, ignora
        );
        started = true;
        if (cancelled) {
          await scanner.stop().catch(() => {});
          scanner.clear();
          return;
        }
        setStatus('scanning');
      } catch (e) {
        if (cancelled) return;
        setStatus('unavailable');
        const name = String(e?.name || e?.message || e);
        setError(
          /NotAllowed|Permission/i.test(name)
            ? 'Permissão da câmera negada. Libere a câmera para este site nas configurações do navegador ou digite o patrimônio abaixo.'
            : /NotFound|Devices/i.test(name)
              ? 'Nenhuma câmera encontrada. Digite o patrimônio abaixo.'
              : 'Não foi possível abrir a câmera (ela só funciona em conexão segura, HTTPS). Digite o patrimônio abaixo.'
        );
      }
    })();

    return () => {
      cancelled = true;
      if (scanner && started) {
        scanner.stop().then(() => scanner.clear()).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submitManual = (e) => {
    e.preventDefault();
    setError('');
    go(manual);
  };

  return (
    <Modal open={open} onClose={onClose} title="Escanear QR Code do ativo" size="sm">
      <div className="space-y-3">
        <div
          id={READER_ID}
          className={`overflow-hidden rounded-lg bg-slate-900 ${status === 'unavailable' ? 'hidden' : 'min-h-[16rem]'}`}
          aria-label="Visualização da câmera"
        />
        {status === 'starting' && <p className="text-center text-sm text-slate-500 dark:text-slate-400">Abrindo a câmera…</p>}
        {status === 'scanning' && (
          <p className="flex items-center justify-center gap-1.5 text-center text-sm text-slate-600 dark:text-slate-300">
            <ScanLine className="h-4 w-4" /> Aponte a câmera para a etiqueta do ativo.
          </p>
        )}
        <FormError message={error} />
        <form onSubmit={submitManual} noValidate className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
          <Field label="Ou digite o patrimônio" htmlFor="qr-manual">
            <div className="flex gap-2">
              <input
                id="qr-manual"
                className={`${inputClass()} font-mono uppercase`}
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="RAD-0001"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
              <button type="submit" className="btn btn-primary">Abrir</button>
            </div>
          </Field>
        </form>
      </div>
    </Modal>
  );
}
