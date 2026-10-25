import { useEffect, useRef, useState } from 'react';
import { Database, Download, Eraser, RotateCcw, Trash2, Upload } from 'lucide-react';
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
  const [confirm, setConfirm] = useState(null); // 'reset' | 'clear' | 'history' | { import: obj }
  const [period, setPeriod] = useState('all'); // histórico a apagar: 'all' ou nº de dias (apaga o mais antigo)

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

  // Apagar histórico: 'all' remove tudo; um número de dias remove só o que for mais antigo que isso.
  const historyCutoff = () => (period === 'all' ? undefined : new Date(Date.now() - Number(period) * 86400000).toISOString());
  const periodLabel = period === 'all' ? 'todo o registro de movimentações' : `o registro de movimentações anterior a ${period} dias`;

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
              Os dados ficam no banco online, compartilhados entre a equipe, com o histórico protegido (só o administrador pode apagá-lo). Use o backup abaixo para guardar uma cópia.
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

      {capabilities.clearHistory && can('history.clear') && <section className="card">
        <div className="card-header">
          <h2 className="card-title">Histórico</h2>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm text-slate-600">
          <p>
            Apaga o registro de movimentações: atividade recente, últimas movimentações, histórico de cada ativo e dados dos relatórios.
            Os ativos e a situação atual deles (em uso, em manutenção…) não mudam.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="history-period" className="mb-1 block text-xs font-medium text-slate-600">O que apagar</label>
              <select id="history-period" className="input w-auto" value={period} onChange={(e) => setPeriod(e.target.value)}>
                <option value="all">Todo o histórico</option>
                <option value="30">Anterior a 30 dias</option>
                <option value="90">Anterior a 90 dias</option>
                <option value="365">Anterior a 1 ano</option>
              </select>
            </div>
            <button className="btn btn-secondary text-red-600" onClick={() => setConfirm('history')}>
              <Eraser className="h-4 w-4" /> Apagar histórico
            </button>
          </div>
          <p className="text-xs text-slate-500">Dica: exporte um backup antes. A exclusão não pode ser desfeita.</p>
        </div>
      </section>}

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
        open={confirm === 'history'}
        title="Apagar histórico"
        message={`Vai apagar ${periodLabel}. Os ativos e a situação atual deles são mantidos. Esta ação não pode ser desfeita — exporte um backup antes, se precisar guardar uma cópia.`}
        confirmLabel="Apagar histórico"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => actions.clearHistory({ before: historyCutoff() })}
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
