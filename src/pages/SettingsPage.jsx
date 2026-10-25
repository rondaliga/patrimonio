import { useEffect, useRef, useState } from 'react';
import { Database, Download, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import { downloadFile } from '../lib/download.js';
import { plural } from '../lib/format.js';

export default function SettingsPage() {
  const { data, actions, mode, persistent, capabilities, can } = useData();
  const local = mode === 'local';
  const bulk = can('data.admin');
  const toast = useToast();
  const fileRef = useRef(null);
  const [confirm, setConfirm] = useState(null); // 'reset' | 'clear' | { import: obj }

  // O estado guarda só os eventos recentes; o total vem de uma contagem leve.
  const [eventCount, setEventCount] = useState(null);
  useEffect(() => {
    let alive = true;
    actions.countEvents().then((n) => alive && setEventCount(n)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [actions, data.events]);

  const exportBackup = async () => {
    const dump = await actions.exportData();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`backup-patrimonio-${stamp}.json`, JSON.stringify(dump, null, 2), 'application/json');
  };

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const obj = JSON.parse(await file.text());
      setConfirm({ import: obj });
    } catch {
      toast.error('Não foi possível ler o arquivo. Escolha um backup .json gerado por este sistema.');
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <section className="card">
        <div className="card-header">
          <h2 className="card-title flex items-center gap-2"><Database className="h-4 w-4" /> Armazenamento</h2>
        </div>
        <div className="space-y-2 px-4 py-4 text-sm text-slate-600">
          <p>
            Modo atual: <strong>{local ? 'Local (neste navegador)' : 'Online (Supabase)'}</strong> —{' '}
            {plural(data.assets.length, 'ativo', 'ativos')}, {plural(data.sectors.length, 'setor', 'setores')},{' '}
            {eventCount == null ? '…' : plural(eventCount, 'movimentação', 'movimentações')}.
          </p>
          {local ? (
            <>
              <p className="rounded bg-amber-50 px-3 py-2 text-amber-800">
                {persistent
                  ? 'Os dados ficam salvos apenas neste navegador e neste computador. Limpar os dados do site apaga tudo — faça backups periódicos.'
                  : 'O armazenamento do navegador está indisponível (modo privado ou bloqueado): os dados valem só até fechar esta aba.'}
              </p>
              <p className="text-slate-500">
                Para compartilhar os dados entre várias pessoas e computadores, configure o Supabase (veja FASE-2-SUPABASE.md).
              </p>
            </>
          ) : (
            <p className="rounded bg-emerald-50 px-3 py-2 text-emerald-800">
              Os dados ficam no banco online, compartilhados entre a equipe, com histórico imutável. Use o backup abaixo para guardar uma cópia.
            </p>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Backup</h2>
        </div>
        <div className="flex flex-wrap gap-2 px-4 py-4">
          <button className="btn btn-secondary" onClick={exportBackup}><Download className="h-4 w-4" /> Exportar backup (.json)</button>
          {capabilities.import && bulk && (
            <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Importar backup…</button>
          )}
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={pickFile} aria-label="Arquivo de backup" />
        </div>
      </section>

      {capabilities.demo && bulk && <section className="card">
        <div className="card-header">
          <h2 className="card-title">Dados de demonstração</h2>
        </div>
        <div className="flex flex-wrap gap-2 px-4 py-4">
          <button className="btn btn-secondary" onClick={() => setConfirm('reset')}><RotateCcw className="h-4 w-4" /> Restaurar demonstração</button>
          <button className="btn btn-secondary text-red-600" onClick={() => setConfirm('clear')}><Trash2 className="h-4 w-4" /> Apagar todos os ativos</button>
        </div>
      </section>}

      <ConfirmModal
        open={confirm === 'reset'}
        title="Restaurar demonstração"
        message="Todos os dados atuais serão substituídos pelos dados de demonstração. Faça um backup antes, se necessário."
        confirmLabel="Restaurar"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => actions.resetDemo()}
      />
      <ConfirmModal
        open={confirm === 'clear'}
        title="Apagar todos os ativos"
        message="Todos os ativos e o histórico de movimentações serão apagados (os setores permanecem). Esta ação não pode ser desfeita."
        confirmLabel="Apagar tudo"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => actions.clearAll()}
      />
      <ConfirmModal
        open={!!confirm?.import}
        title="Importar backup"
        message="Os dados atuais serão substituídos pelo conteúdo do arquivo escolhido."
        confirmLabel="Importar"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => actions.importData(confirm.import)}
      />
    </div>
  );
}
