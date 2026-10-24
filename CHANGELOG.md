# Changelog

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
