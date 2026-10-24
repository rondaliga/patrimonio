-- Testes do schema.sql (permissões por papel, ciclo de vida, histórico, integridade).
-- Uso: createdb hosp && psql -d hosp -q -v ON_ERROR_STOP=1 -f mock-auth.sql -f schema.sql && psql -d hosp -q -t -A -f schema.test.sql
\set ON_ERROR_STOP 1
\set QUIET 1
create schema t;
grant usage on schema t to authenticated, anon;
create function t.login(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, true); end $$;
create function t.ok(c boolean, label text) returns void language plpgsql as $$
begin
  if c is not true then raise exception 'FALHOU: %', label; end if;
  raise notice 'ok   %', label;
end $$;
create function t.fails(q text, pat text, label text) returns void language plpgsql as $$
begin
  begin execute q;
  exception when others then
    if sqlerrm !~* pat then raise exception 'FALHOU (mensagem inesperada) [%]: % -- esperado /%/', label, sqlerrm, pat; end if;
    raise notice 'ok   % (bloqueado: %)', label, left(sqlerrm, 60);
    return;
  end;
  raise exception 'FALHOU (deveria ter sido bloqueado): %', label;
end $$;
grant execute on all functions in schema t to authenticated, anon;

begin;
insert into auth.users (id) values
 ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2'),
 ('00000000-0000-0000-0000-0000000000c3'), ('00000000-0000-0000-0000-0000000000d4');
update public.profiles set role='admin'      where id='00000000-0000-0000-0000-0000000000a1';
update public.profiles set role='tecnico'    where id='00000000-0000-0000-0000-0000000000b2';
update public.profiles set role='enfermagem' where id='00000000-0000-0000-0000-0000000000c3';
-- d4 permanece "consulta" (padrão do trigger)
select t.ok((select role from public.profiles where id='00000000-0000-0000-0000-0000000000d4') = 'consulta', 'novo usuário nasce como consulta');

set local role authenticated;

\echo == CONSULTA
select t.login('00000000-0000-0000-0000-0000000000d4');
select t.ok((select count(*) from public.sectors) = 6, 'consulta enxerga os 6 setores');
select t.fails($$insert into public.assets(tag,name,category,sector_id) values ('RAD-0001','Rádio','radio','uti')$$, 'row-level', 'consulta não cadastra ativo');
select t.fails($$select public.checkout_asset('RAD-0001','Ana','uti')$$, 'Sem permissão', 'consulta não faz check-out');
select t.fails($$insert into public.events(tag,type) values ('RAD-0001','created')$$, 'permission denied', 'ninguém grava histórico direto');

\echo == TÉCNICO
select t.login('00000000-0000-0000-0000-0000000000b2');
insert into public.assets(tag,name,category,sector_id) values ('RAD-0001','Rádio HT-760','radio','uti');
select t.ok((select status from public.assets where tag='RAD-0001') = 'available', 'ativo nasce disponível');
select t.ok((select count(*) from public.events where tag='RAD-0001' and type='created') = 1, 'trigger grava evento "created"');
update public.assets set name='Rádio HT-760 B' where tag='RAD-0001';
select t.ok((select count(*) from public.events where tag='RAD-0001' and type='edited') = 1, 'edição grava evento "edited"');
update public.assets set name='Rádio HT-760 B' where tag='RAD-0001';
select t.ok((select count(*) from public.events where tag='RAD-0001' and type='edited') = 1, 'edição sem mudança não gera evento');
select t.fails($$update public.assets set status='retired' where tag='RAD-0001'$$, 'permission denied', 'técnico não altera status direto');
select t.fails($$insert into public.assets(tag,name,category,sector_id,status) values ('RAD-0002','X1','radio','uti','retired')$$, 'permission denied', 'não dá para inserir já com status');
select t.fails($$insert into public.assets(tag,name,category,sector_id) values ('x','Rádio','radio','uti')$$, 'assets_tag_check', 'patrimônio inválido é recusado');
select t.fails($$insert into public.assets(tag,name,category,sector_id) values ('RAD-0001','Dup','radio','uti')$$, 'duplicate key', 'patrimônio duplicado é recusado');
select t.fails($$insert into public.assets(tag,name,category,sector_id) values ('RAD-0003','Rádio','radio','nao-existe')$$, 'foreign key', 'setor inexistente é recusado');
select t.fails($$insert into public.sectors(id,name) values ('x','Novo')$$, 'row-level', 'técnico não cria setor');

\echo == ENFERMAGEM
select t.login('00000000-0000-0000-0000-0000000000c3');
select public.checkout_asset('RAD-0001', '  Enf. Carlos ', 'ps', 'plantão noite');
select t.ok((select status = 'in_use' and assigned_user = 'Enf. Carlos' and assigned_sector_id = 'ps' from public.assets where tag='RAD-0001'), 'check-out registra responsável e setor');
select t.fails($$select public.checkout_asset('RAD-0001','Outro','uti')$$, 'check-out', 'não faz check-out de ativo em uso');
select t.fails($$select public.send_to_maintenance('RAD-0001','maintenance','Teste')$$, 'Sem permissão', 'enfermagem não envia para manutenção');
select t.fails($$select public.retire_asset('RAD-0001','Teste')$$, 'Sem permissão', 'enfermagem não dá baixa');
with u as (update public.assets set name='Hackeado' where tag='RAD-0001' returning 1) select t.ok((select count(*) from u) = 0, 'enfermagem não edita cadastro (RLS: 0 linhas)');
select public.checkin_asset('RAD-0001', 'maintenance', 'Antena quebrada');
select t.ok((select status = 'maintenance' and maint_reason = 'Antena quebrada' and assigned_user is null from public.assets where tag='RAD-0001'), 'check-in com defeito vai para manutenção e limpa o empréstimo');
select t.ok((select string_agg(type, ',' order by id) from public.events where tag='RAD-0001') = 'created,edited,checkout,checkin,maintenance', 'histórico completo e na ordem certa');
select t.ok((select count(*) from public.events where tag='RAD-0001' and actor is not null and type in ('checkout','checkin')) = 2, 'histórico registra quem fez (actor)');
select t.fails($$select public.checkin_asset('RAD-0001','ok')$$, 'check-in', 'não devolve ativo que não está em uso');

\echo == TÉCNICO (manutenção e baixa)
select t.login('00000000-0000-0000-0000-0000000000b2');
select public.complete_maintenance('RAD-0001', 'Antena trocada');
select t.ok((select status = 'available' and maint_kind is null from public.assets where tag='RAD-0001'), 'concluir manutenção libera o ativo');
select public.send_to_maintenance('RAD-0001', 'sterilization', 'Pós-cirurgia');
select t.ok((select maint_kind = 'sterilization' from public.assets where tag='RAD-0001'), 'esterilização registrada');
select t.fails($$select public.send_to_maintenance('RAD-0001','sterilization','Outra vez')$$, 'enviar para manutenção', 'não envia de novo quem já está em manutenção');
select t.fails($$select public.retire_asset('RAD-0001','  ')$$, 'motivo', 'baixa exige motivo');
select public.retire_asset('RAD-0001', 'Fim de vida útil');
select t.ok((select status = 'retired' and retired_reason = 'Fim de vida útil' from public.assets where tag='RAD-0001'), 'baixa registrada');
select t.fails($$select public.checkout_asset('RAD-0001','Ana','uti')$$, 'check-out', 'ativo baixado não sai mais');
select t.fails($$select public.complete_maintenance('RAD-0001')$$, 'concluir', 'baixa é definitiva (não volta)');

\echo == EXCLUSÃO
insert into public.assets(tag,name,category,sector_id) values ('MON-0001','Monitor','monitor','uti');
with d as (delete from public.assets where tag='MON-0001' returning 1) select t.ok((select count(*) from d) = 0, 'técnico não exclui (só admin)');
select t.login('00000000-0000-0000-0000-0000000000a1');
with d as (delete from public.assets where tag='RAD-0001' returning 1) select t.ok((select count(*) from d) = 0, 'admin não exclui ativo com histórico');
with d as (delete from public.assets where tag='MON-0001' returning 1) select t.ok((select count(*) from d) = 1, 'admin exclui ativo sem movimentações');
select t.ok((select count(*) from public.events where tag='MON-0001') = 0, 'histórico do ativo excluído some junto');

\echo == SETORES / PERFIS (admin)
insert into public.sectors(id,name) values ('hemo','Hemodiálise');
select t.fails($$insert into public.sectors(id,name) values ('hemo2',' hemodiálise ')$$, 'sectors_name_unique|duplicate', 'setor duplicado (caixa/espaços) é recusado');
update public.profiles set role='tecnico' where id='00000000-0000-0000-0000-0000000000d4';
select t.ok((select count(*) from public.profiles) = 4, 'admin enxerga todos os perfis');
select t.login('00000000-0000-0000-0000-0000000000c3');
select t.ok((select count(*) from public.profiles) = 1, 'demais usuários só veem o próprio perfil');
with u as (update public.profiles set role='admin' where id='00000000-0000-0000-0000-0000000000c3' returning 1) select t.ok((select count(*) from u) = 0, 'ninguém se promove a admin');

\echo == ANÔNIMO
reset role; set local role anon;
select t.fails($$select * from public.assets$$, 'permission denied', 'anônimo não lê ativos');
select t.fails($$select public.app_role()$$, 'permission denied', 'anônimo não chama funções');

\echo == INTEGRIDADE (mesmo como dono do banco)
reset role;
select t.fails($$update public.assets set status='in_use' where tag='RAD-0001'$$, 'in_use_fields|maintenance_fields|retired_fields', 'CHECK impede estado incoerente');
rollback;
\echo
\echo TODOS OS TESTES SQL PASSARAM
