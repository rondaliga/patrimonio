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
create function t.pw_ok(p_email text, p_pw text) returns boolean language sql security definer as
$$ select encrypted_password = extensions.crypt(p_pw, encrypted_password) from auth.users where email = p_email $$;
create function t.set_pw(p_id uuid, p_pw text) returns void language sql security definer as
$$ update auth.users set encrypted_password = extensions.crypt(p_pw, extensions.gen_salt('bf')) where id = p_id $$;
create function t.banned(p_user uuid) returns boolean language sql security definer as
$$ select banned_until is not null and banned_until > now() + interval '10 years' from auth.users where id = p_user $$;
create function t.auth_ok(p_email text) returns boolean language sql security definer as
$$ select email_confirmed_at is not null and aud = 'authenticated' and role = 'authenticated'
          and confirmation_token = '' and recovery_token = '' and email_change = '' and email_change_token_new = ''
          and encrypted_password like '$2%' from auth.users where email = p_email $$;
create function t.auth_count(p_like text) returns bigint language sql security definer as
$$ select count(*) from auth.users where email like p_like $$;
create function t.ident_ok(p_email text) returns boolean language sql security definer as
$$ select count(*) = 1 and bool_and(provider = 'email' and email = p_email and identity_data ->> 'email' = p_email)
     from auth.identities where email = p_email $$;
create function t.sessions(p_user uuid) returns bigint language sql security definer as
$$ select count(*) from auth.sessions where user_id = p_user $$;
create function t.add_session(p_user uuid) returns void language sql security definer as
$$ insert into auth.sessions(user_id) values (p_user) $$;
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
select t.fails($$select public.checkout_asset('RAD-0001','Ana','uti')$$, 'Sem permissão', 'consulta não faz retirada');
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
select t.fails($$select public.checkout_asset('RAD-0001','Outro','uti')$$, 'retirada', 'não faz retirada de ativo em uso');
select t.fails($$select public.send_to_maintenance('RAD-0001','maintenance','Teste')$$, 'Sem permissão', 'enfermagem não envia para manutenção');
select t.fails($$select public.retire_asset('RAD-0001','Teste')$$, 'Sem permissão', 'enfermagem não dá baixa');
with u as (update public.assets set name='Hackeado' where tag='RAD-0001' returning 1) select t.ok((select count(*) from u) = 0, 'enfermagem não edita cadastro (RLS: 0 linhas)');
select public.checkin_asset('RAD-0001', 'maintenance', 'Antena quebrada');
select t.ok((select status = 'maintenance' and maint_reason = 'Antena quebrada' and assigned_user is null from public.assets where tag='RAD-0001'), 'check-in com defeito vai para manutenção e limpa o empréstimo');
select t.ok((select string_agg(type, ',' order by id) from public.events where tag='RAD-0001') = 'created,edited,checkout,checkin,maintenance', 'histórico completo e na ordem certa');
select t.ok((select count(*) from public.events where tag='RAD-0001' and actor is not null and type in ('checkout','checkin')) = 2, 'histórico registra quem fez (actor)');
select t.fails($$select public.checkin_asset('RAD-0001','ok')$$, 'devolução', 'não devolve ativo que não está em uso');

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
select t.fails($$select public.checkout_asset('RAD-0001','Ana','uti')$$, 'retirada', 'ativo baixado não sai mais');
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

\echo == EXCLUIR REGISTRO DO HISTÓRICO
select t.login('00000000-0000-0000-0000-0000000000c3');
select t.fails($$select public.delete_event(1)$$, 'Sem permissão', 'enfermagem não exclui registro do histórico');
select t.login('00000000-0000-0000-0000-0000000000b2');
select t.fails($$select public.delete_event(1)$$, 'Sem permissão', 'técnico não exclui registro do histórico');
select t.login('00000000-0000-0000-0000-0000000000a1');
select min(id) as ev_id from public.events where tag='RAD-0001' \gset
select t.ok(public.delete_event(:ev_id) = 1, 'admin exclui um registro');
select t.ok((select count(*) from public.events where id = :ev_id) = 0, 'o registro some do histórico');
select t.ok(public.delete_event(:ev_id) = 0, 'excluir de novo não encontra nada');
select t.ok((select count(*) from public.events where tag='RAD-0001') > 0, 'os demais registros do ativo permanecem');
select t.ok((select count(*) from public.assets where tag='RAD-0001') = 1, 'o ativo permanece');

\echo == GESTÃO DE USUÁRIOS
-- (a1 = admin, b2 = técnico, c3 = enfermagem, d4 = consulta/técnico)
select t.login('00000000-0000-0000-0000-0000000000c3');
select t.fails($$select * from public.admin_list_users()$$, 'Sem permissão', 'enfermagem não lista usuários');
select t.fails($$select public.admin_create_user('maria','Maria Souza','consulta','senha12345')$$, 'Sem permissão', 'enfermagem não cria usuário');
select t.fails($$select public.admin_set_password('00000000-0000-0000-0000-0000000000d4','novasenha123')$$, 'Sem permissão', 'enfermagem não troca senha de ninguém');
select t.fails($$select public.admin_delete_user('00000000-0000-0000-0000-0000000000d4')$$, 'Sem permissão', 'enfermagem não exclui usuário');
select t.fails($$select public.admin_update_user('00000000-0000-0000-0000-0000000000c3','Eu','admin')$$, 'Sem permissão', 'ninguém se promove pela função');
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.ok((select count(*) from public.admin_list_users()) = 4, 'admin lista os 4 usuários');
select public.admin_create_user('  Maria.Souza ', ' Maria Souza ', 'consulta', 'senha12345') as novo \gset
select t.ok((select username = 'maria.souza' and full_name = 'Maria Souza' and role = 'consulta' from public.profiles where username = 'maria.souza'), 'cria usuário (usuário em minúsculas, nome sem espaços, perfil)');
select t.ok(t.auth_ok('maria.souza@patrimonio.invalid') and t.pw_ok('maria.souza@patrimonio.invalid', 'senha12345') and not t.pw_ok('maria.souza@patrimonio.invalid', 'errada123'), 'conta no Auth: e-mail interno, confirmada, senha com hash bcrypt, tokens vazios');
select t.ok(t.ident_ok('maria.souza@patrimonio.invalid'), 'identidade de e-mail criada');
select t.fails($$select public.admin_create_user('MARIA.souza','Outra Maria','consulta','senha12345')$$, 'Já existe um usuário', 'usuário duplicado (caixa) é recusado');
select t.fails($$select public.admin_create_user('ab','Nome Ok','consulta','senha12345')$$, 'Nome de usuário inválido', 'usuário curto demais');
select t.fails($$select public.admin_create_user('joão silva','Nome Ok','consulta','senha12345')$$, 'Nome de usuário inválido', 'usuário com acento/espaço');
select t.fails($$select public.admin_create_user('joao','X','consulta','senha12345')$$, 'nome completo', 'nome obrigatório');
select t.fails($$select public.admin_create_user('joao','João Lima','root','senha12345')$$, 'Perfil de acesso inválido', 'perfil inválido');
select t.fails($$select public.admin_create_user('joao','João Lima','consulta','curta')$$, 'pelo menos 8', 'senha curta');
select t.ok((select count(*) from public.admin_list_users()) = 5, 'falhas não deixam usuário pela metade');
select t.ok(t.auth_count('%@patrimonio.invalid') = 1, 'só a conta válida foi criada no Auth (nenhuma órfã das tentativas que falharam)');

select t.login((select id from public.profiles where username = 'maria.souza'));
select t.ok((select role from public.profiles where id = auth.uid()) = 'consulta', 'novo usuário entra como visualizador');
select t.fails($$select public.checkout_asset('RAD-0001','Ana','uti')$$, 'Sem permissão', 'visualizador não movimenta');
select t.login('00000000-0000-0000-0000-0000000000a1');

select public.admin_update_user((select id from public.profiles where username = 'maria.souza'), 'Maria S. Souza', 'enfermagem');
select t.ok((select full_name = 'Maria S. Souza' and role = 'enfermagem' from public.profiles where username = 'maria.souza'), 'admin altera nome e perfil');
select t.fails($$select public.admin_update_user('00000000-0000-0000-0000-0000000000a1','Admin','consulta')$$, 'próprio acesso de administrador', 'admin não se rebaixa');
select t.fails($$select public.admin_update_user('00000000-0000-0000-0000-00000000ffff','Alguém','consulta')$$, 'não encontrado', 'atualizar usuário inexistente');
select public.admin_update_user('00000000-0000-0000-0000-0000000000a1','Administrador Geral','admin');
select t.ok((select full_name = 'Administrador Geral' from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'admin edita o próprio nome mantendo o perfil');

select t.add_session((select id from public.profiles where username = 'maria.souza'));
select public.admin_set_password((select id from public.profiles where username = 'maria.souza'), 'outrasenha99');
select t.ok(t.pw_ok('maria.souza@patrimonio.invalid', 'outrasenha99') and not t.pw_ok('maria.souza@patrimonio.invalid', 'senha12345'), 'admin redefine a senha de outra pessoa');
select t.ok(t.sessions((select id from public.profiles where username = 'maria.souza')) = 0, 'sessões abertas da pessoa são encerradas');
select t.fails($$select public.admin_set_password((select id from public.profiles where username = 'maria.souza'), '1234567')$$, 'pelo menos 8', 'redefinir com senha curta');
select t.fails($$select public.admin_set_password('00000000-0000-0000-0000-00000000ffff', 'umasenhaboa1')$$, 'não encontrado', 'redefinir senha de usuário inexistente');

select t.fails($$select public.admin_delete_user('00000000-0000-0000-0000-0000000000a1')$$, 'própria conta', 'admin não exclui a si mesmo');
select public.admin_delete_user((select id from public.profiles where username = 'maria.souza'));
select t.ok((select count(*) from public.profiles where username = 'maria.souza') = 0 and t.auth_count('maria.souza@%') = 0, 'excluir remove conta e perfil');
select t.fails($$select public.admin_delete_user('00000000-0000-0000-0000-00000000ffff')$$, 'não encontrado', 'excluir usuário inexistente');
select t.ok((select count(*) from public.events where actor is not null) > 0, 'histórico feito pelo usuário excluído permanece');

\echo == v1.6.0: SENHA TEMPORÁRIA, CONTA ATIVA/INATIVA E AUTORIA
select public.admin_create_user('joana.lima', 'Joana Lima', 'enfermagem', 'temporaria1') as j \gset
select id as joana from public.profiles where username = 'joana.lima' \gset
select t.ok((select must_change_password and is_active from public.profiles where id = :'joana'), 'conta nova nasce ativa e com troca de senha obrigatória');
select t.ok((select must_change_password and is_active from public.admin_list_users() where username = 'joana.lima'), 'admin_list_users informa ativo e troca pendente');
reset role;
select t.set_pw(:'joana', 'minhanova123');   -- a própria pessoa troca a senha (Auth atualiza encrypted_password)
set local role authenticated;
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.ok((select not must_change_password from public.profiles where id = :'joana'), 'trocar a senha limpa a marca de troca obrigatória');
select public.admin_set_password(:'joana', 'redefinida99');
select t.ok((select must_change_password from public.profiles where id = :'joana'), 'senha redefinida pelo admin volta a ser temporária');
reset role;
select t.set_pw(:'joana', 'definitiva123');
set local role authenticated;
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.ok((select not must_change_password from public.profiles where id = :'joana'), 'nova troca da própria pessoa limpa a marca de novo');
select public.admin_set_password('00000000-0000-0000-0000-0000000000a1', 'minhasenha123');
select t.ok((select not must_change_password from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'admin redefinindo a PRÓPRIA senha não fica com troca obrigatória');
select t.login(:'joana');
select t.fails($$update public.profiles set must_change_password = false, is_active = true where id = auth.uid()$$, 'permission denied|row-level', 'ninguém altera a marca/ativo pela API direta');
select t.login('00000000-0000-0000-0000-0000000000a1');

-- autoria: o histórico guarda quem registrou (cópia do nome, sobrevive à exclusão da conta)
select public.admin_update_user(:'joana', 'Joana Lima', 'enfermagem');
insert into public.assets(tag,name,category,sector_id) values ('RAD-0777','Rádio autoria','radio','uti');
select public.checkout_asset('RAD-0777', 'Setor UTI', 'uti', 'teste de autoria') is not null as retirou \gset
select t.login(:'joana');
select public.checkin_asset('RAD-0777', 'ok', 'devolvido pela Joana');
select t.ok((select actor_username = 'joana.lima' and actor_name = 'Joana Lima' and actor = :'joana' from public.events where tag = 'RAD-0777' and type = 'checkin' order by id desc limit 1), 'devolução grava quem registrou (usuário e nome)');
select t.ok((select actor_name = 'Administrador Geral' from public.events where tag = 'RAD-0777' and type = 'checkout' order by id desc limit 1), 'retirada grava o nome de quem registrou');

-- desativação
select t.login('00000000-0000-0000-0000-0000000000c3');
select t.fails($$select public.admin_set_active(null, false)$$, 'Sem permissão', 'enfermagem não ativa/desativa contas');
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.fails($$select public.admin_set_active('00000000-0000-0000-0000-0000000000a1', false)$$, 'própria conta', 'admin não desativa a si mesmo');
select t.fails($$select public.admin_set_active('00000000-0000-0000-0000-00000000ffff', false)$$, 'não encontrado', 'desativar usuário inexistente');
select t.add_session(:'joana');
select t.ok((select not is_active from public.admin_set_active(:'joana', false)), 'admin desativa a conta');
select t.ok(t.banned(:'joana'), 'login bloqueado no Auth (banned_until)');
select t.ok(t.sessions(:'joana') = 0, 'sessões abertas da pessoa encerradas');
select t.ok((select count(*) from public.events where actor = :'joana') > 0, 'histórico da pessoa permanece intacto');
select t.ok((select not is_active from public.admin_list_users() where username = 'joana.lima'), 'lista mostra a conta como inativa');
select t.login(:'joana');
select t.ok((select not is_active from public.profiles where id = auth.uid()), 'conta inativa ainda lê o próprio perfil (para mostrar o aviso)');
select t.ok((select count(*) from public.assets) = 0 and (select count(*) from public.events) = 0 and (select count(*) from public.sectors) = 0, 'conta inativa não lê ativos, histórico nem setores');
select t.fails($$select public.checkout_asset('RAD-0001','Ana','uti')$$, 'Sem permissão', 'conta inativa não movimenta');
select t.ok(public.app_role() is null, 'conta inativa não tem papel');
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.ok((select is_active from public.admin_set_active(:'joana', true)), 'admin reativa a conta');
select t.ok(not t.banned(:'joana'), 'login liberado de novo no Auth');
select t.login(:'joana');
select t.ok(public.app_role() = 'enfermagem' and (select count(*) from public.assets) > 0, 'conta reativada volta a ter o mesmo papel e acesso');
select t.login('00000000-0000-0000-0000-0000000000a1');

\echo == ANÔNIMO
reset role; set local role anon;
select t.fails($$select * from public.assets$$, 'permission denied', 'anônimo não lê ativos');
select t.fails($$select public.app_role()$$, 'permission denied', 'anônimo não chama funções');
select t.fails($$select public.admin_create_user('invasor','Invasor','admin','senha12345')$$, 'permission denied', 'anônimo não cria usuário');
select t.fails($$select * from public.admin_list_users()$$, 'permission denied', 'anônimo não lista usuários');

\echo == INTEGRIDADE (mesmo como dono do banco)
reset role;
select t.fails($$update public.assets set status='in_use' where tag='RAD-0001'$$, 'in_use_fields|maintenance_fields|retired_fields', 'CHECK impede estado incoerente');
rollback;
\echo
\echo TODOS OS TESTES SQL PASSARAM
