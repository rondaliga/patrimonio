import { Boxes, BadgeCheck, ArrowLeftRight, Wrench, Radio, Accessibility } from 'lucide-react';
import MetricCard from '../components/dashboard/MetricCard.jsx';
import SectorBarChart from '../components/dashboard/SectorBarChart.jsx';
import StatusDonut from '../components/dashboard/StatusDonut.jsx';
import WeeklyLoansChart from '../components/dashboard/WeeklyLoansChart.jsx';
import ActiveLoansTable from '../components/dashboard/ActiveLoansTable.jsx';
import RecentActivity from '../components/dashboard/RecentActivity.jsx';
import { useData } from '../context/DataContext.jsx';
import { describeEvent } from '../services/rules.js';

export default function Dashboard() {
  const { data, actions, sectorName, can, capabilities, getStats } = useData();
  const stats = getStats(); // calculado uma vez por versão dos dados (compartilhado com outras páginas)

  if (data.assets.length === 0) {
    return (
      <div className="card p-10 text-center">
        <Boxes className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-700">Nenhum ativo cadastrado</p>
        <p className="mt-1 text-sm text-slate-500">
          {can('asset.create') ? 'Cadastre o primeiro ativo' : 'Aguarde o cadastro dos ativos'}
          {capabilities.demo ? ' ou carregue dados de demonstração para conhecer o sistema.' : '.'}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          {can('asset.create') && <a href="#/ativos?novo=1" className="btn btn-primary">Cadastrar ativo</a>}
          {capabilities.demo && <button className="btn btn-secondary" onClick={() => actions.resetDemo()}>Carregar demonstração</button>}
        </div>
      </div>
    );
  }

  const { statusTotals: st } = stats;
  const recent = stats.recent.map((e) => ({
    id: e.id,
    type: e.type,
    tag: e.tag,
    text: describeEvent(e, e.sectorId ? sectorName(e.sectorId) : ''),
    sector: e.sectorId ? sectorName(e.sectorId) : '',
    at: e.at,
  }));

  return (
    <div className="space-y-6">
      {/* Linha 1 — métricas rápidas */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total de ativos" value={stats.total} hint="em todos os setores" icon={Boxes} tone="slate" href="#/ativos" />
        <MetricCard label="Disponíveis" value={st.available} hint="prontos para check-out" icon={BadgeCheck} tone="green" href="#/ativos?status=available" />
        <MetricCard label="Em uso" value={st.in_use} hint={`${stats.activeLoans.length} ${stats.activeLoans.length === 1 ? 'emprestado' : 'emprestados'} agora`} icon={ArrowLeftRight} tone="blue" href="#/ativos?status=in_use" />
        <MetricCard label="Manutenção / Esterilização" value={st.maintenance} hint={`${st.retired} baixados`} icon={Wrench} tone="amber" href="#/manutencao" />
      </section>

      {/* Linha 2 — itens compartilhados em destaque */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricCard label="Rádios emprestados" value={stats.radiosLoaned} hint="walkie-talkies em check-out" icon={Radio} tone="blue" href="#/ativos?categoria=radio&status=in_use" />
        <MetricCard label="Cadeiras de rodas alocadas" value={stats.chairsLoaned} hint="fora do estoque central" icon={Accessibility} tone="blue" href="#/ativos?categoria=wheelchair&status=in_use" />
      </section>

      {/* Linha 3 — gráficos */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectorBarChart data={stats.bySector} className="xl:col-span-2" />
        <StatusDonut totals={st} total={stats.total} />
      </section>

      {/* Linha 4 — operação */}
      <section>
        <ActiveLoansTable loans={stats.activeLoans} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <WeeklyLoansChart data={stats.weekly} className="xl:col-span-2" />
        <RecentActivity items={recent} />
      </section>
    </div>
  );
}
