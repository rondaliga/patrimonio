# Changelog

## 1.5.0 — usuários, senhas, login por usuário e tema escuro
- **Login por nome de usuário** (não mais por e-mail). Contas antigas ganham como usuário a parte do e-mail antes do `@` e mantêm a senha (o `schema.sql` faz a migração ao ser rodado de novo).
- **Tela Usuários** (menu, só administrador): criar conta (nome, usuário, perfil, senha com botão "Gerar"), editar nome e perfil, redefinir a senha de outra pessoa e excluir. O administrador não exclui a si mesmo nem se rebaixa.
- **Alterar minha senha** (ícone de chave no topo, qualquer perfil): pede a senha atual.
- Perfil "Consulta" agora se chama **Visualizador** (o valor no banco continua `consulta`).
- **Tema claro/escuro**: botão no topo e na tela de login, respeita o tema do sistema, lembra a escolha e não pisca ao abrir.
- Banco: novas funções `admin_*` e coluna `profiles.username`. **Rode o `supabase/schema.sql` de novo.** Veja "Usuários e senhas" em FASE-2-SUPABASE.md (inclui o que ainda precisa ser testado em um projeto real).
- Testes SQL agora cobrem permissões, validações, hash da senha, exclusão e migração; 85 testes automáticos.

## 1.4.1 — excluir registros do histórico, um a um
- Cada registro do histórico ganhou um ícone de lixeira (somente administrador): em **Atividade recente** (painel), **Últimas movimentações** e **Histórico de movimentações** do ativo. Pede confirmação; só o registro é apagado, o ativo e a situação atual dele não mudam.
- Removida a opção de apagar o histórico inteiro de Configurações (introduzida na 1.4.0).
- Modo online (Supabase): nova função `delete_event(p_id)` restrita ao administrador. **Rode o `supabase/schema.sql` de novo.** Se a função não existir, o app mostra "O banco ainda não tem esta função…" em vez de um erro técnico. Outras sessões abertas atualizam em tempo real.
- Ativos cujo histórico foi excluído continuam com a regra de exclusão de ativo inalterada (só sem movimentações).

## 1.3.3 — tudo em português
- "check-out" / "check-in" viraram "retirada" / "devolução" na interface (menu, títulos, botões, avisos, relatórios, mensagens de erro e do banco). "Dashboard" virou "Painel". "walkie-talkies" virou "rádios comunicadores".
- O CSV de movimentações exportava o tipo do evento em inglês (`checkout`, `checkin`…); agora sai "Retirada", "Devolução", etc.
- Teste automático impede o retorno de termos em inglês na interface.
- **Supabase:** rode o `supabase/schema.sql` de novo para atualizar as mensagens de erro das funções do banco.

## 1.3.2
- Tabelas: os títulos das colunas numéricas (Setores: Total, Disponível, Em uso…) ficavam alinhados à esquerda, longe dos números alinhados à direita. A regra base de `th` tinha especificidade maior que `text-right`; agora o alinhamento padrão fica na camada base e `text-right` prevalece.

## 1.3.1 — revisão visual e de textos
**Visual**
- Manutenção: os botões "Concluir" ficavam cortados no desktop e escondidos (só com rolagem lateral) no celular. A lista agora cabe no cartão, e no celular tipo, motivo e tempo parado aparecem sob o nome do ativo.
- Ativos: removida a barra de busca duplicada no cabeçalho (a página já tem a sua).
- Contraste: textos de apoio em cinza muito claro (`slate-400`) passaram para `slate-500`, legíveis nos padrões de acessibilidade (WCAG AA).
- Foco automático do campo de patrimônio só em telas largas e sem rolar a página: no celular a Manutenção abria já rolada até o formulário, com o teclado aberto.
- Título da página no cabeçalho não estoura no celular (tamanho menor e dica ao passar o mouse).

**Textos**
- Concordância: "1 setor", "1 ativo", "1 movimentação", "1 emprestado agora" (antes "1 setores" etc.).
- "Setor destino" → "Setor de destino" (igual ao formulário).
- FASE-2-SUPABASE.md atualizado com a carga por janela de eventos.

## 1.3.0 — desempenho de carregamento
**Primeira abertura**
- Páginas em chunks separados (`React.lazy`): a tela inicial baixa só o que precisa; as demais são baixadas no tempo ocioso. O JS da tela atual começa a baixar em paralelo com a inicialização.
- Adaptadores de dados carregados sob demanda: no modo local o `@supabase/supabase-js` não é baixado.
- Bibliotecas (react, ícones, supabase) em arquivos próprios, que continuam em cache entre as publicações.
- Casca (skeleton) exibida antes do JavaScript; fonte Inter sem bloquear a primeira pintura.
- Service worker: visitas seguintes abrem do cache (`public/sw.js`); a página inicial continua sendo buscada na rede primeiro.

**Dados**
- Ações não recarregam mais o banco inteiro: o ativo devolvido pela operação é aplicado direto e uma consulta pequena traz só os eventos novos. O tempo real aplica apenas a linha que mudou.
- Carga inicial traz só os últimos 60 dias de eventos; o histórico completo do ativo, a exportação e a contagem são buscados sob demanda.
- Cadastro de ativo não baixa mais todas as tags (o banco recusa duplicidade); colunas explícitas no lugar de `select *`.
- Modo local mantém o banco em memória (sem reinterpretar o JSON a cada operação).
- Login: o perfil não é buscado de novo ao renovar o token ou voltar para a aba.

**Cálculos e interface**
- `computeStats` em uma única passada, calculado uma vez por versão dos dados e compartilhado entre Dashboard, Setores e Relatórios; `getAsset` em tempo constante.
- Busca na lista de ativos usa texto normalizado pré-calculado (não refaz a cada tecla).

**Banco e CI**
- Índices novos (`assets_in_use_idx`, `events_type_at_idx`); policies RLS com `(select ...)` para avaliar o papel uma vez por consulta. Rode o `supabase/schema.sql` de novo (é repetível).
- Deploy com cache de pacotes e `npm ci` quando houver `package-lock.json` (rode `npm install` uma vez e envie o arquivo gerado).

## 1.2.2
- Teste de estrutura não depende mais de arquivos que começam com ponto nem da ausência de `docs/` (evita falha no CI após upload pelo navegador).

## 1.2.1
- Testes no deploy não bloqueiam mais a publicação (`continue-on-error`); removido teste que falhava se existisse uma pasta `docs/` antiga.

## 1.2.0
- **Deploy automático:** `.github/workflows/deploy.yml` instala, testa, compila e publica no GitHub Pages a cada upload; a pasta `docs/` (build manual, causa de telas brancas) foi removida.
- Build vai para `dist/` (ignorado pelo Git). Variáveis do Supabase configuráveis no GitHub (Actions → Variables).
- Adicionados `.nvmrc`, `.gitattributes`, `.editorconfig` e `engines` no `package.json`.

## 1.1.1
- `supabase/schema.sql` agora é um arquivo único e repetível (sem erro "already exists") e já define o administrador pelo e-mail.

## 1.1.0
**Interface**
- Check-out e Check-in: cartões com a mesma altura e botões alinhados na base.
- Removido o botão "Novo ativo" duplicado (fica só no cabeçalho).
- Celular: tabelas de ativos, empréstimos ativos e últimas movimentações reorganizadas (sem colunas cortadas ou espremidas).
- Removida a coluna "Status" dos empréstimos ativos (era sempre "Em uso").
- Campo de patrimônio: placeholder curto (não é mais cortado) e dica abaixo do campo.
- Versão exibida no menu vem do `package.json`.

**Código**
- `DataContext` exporta o contexto (facilita testes). Testes de colunas de CSV e constantes.

## 1.0 (0.2.0)
- Fase 2: adaptador Supabase, login, permissões por papel, script de migração; deduplicação de CSV, slug e limite de empréstimo.
