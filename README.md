# Hub de Protótipos — Plataforma de modelagem e diagramas

Ecossistema composto pelo **Hub** (Next.js + React), a aplicação independente **MindMap** (React + Vite) e a **API NestJS** compartilhada com persistência **SQLite** e integração **Google Gemini**.

## Estrutura do projeto

- `backend/` — API NestJS (porta `3001`, SQLite em `backend/data/mindmap.sqlite`)
  - `GET /api/hub` — retorna marca, usuário e catálogo das soluções
  - `GET /api/solutions` e `GET /api/solutions/:slug` — catálogo das soluções
  - `GET /api/mindmaps`, `POST /api/mindmaps`, `GET /api/mindmaps/:id`, `PUT /api/mindmaps/:id`, `POST /api/mindmaps/:id/duplicate`, `DELETE /api/mindmaps/:id` — CRUD de mapas mentais em SQLite
  - `POST /api/mindmaps/ai/generate`, `POST /api/mindmaps/:id/ai/explain`, `POST /api/mindmaps/:id/ai/expand-node` — recursos de IA via Gemini
  - `GET /api/ai/status`, `POST /api/ai/generate`, `POST /api/ai/translate` — endpoints genéricos da integração Gemini
  - `GET /api/health` — saúde da API e status da integração Gemini
- `frontend/` — Hub Next.js + React (porta `3000`)
  - Consome `GET /api/hub` da API NestJS
  - Card **MindMap** abre diretamente a aplicação independente (`http://localhost:3002`)
- `mindmap/` — Aplicação independente MindMap em React + Vite (porta `3002`)
  - Biblioteca de mapas com busca, criação, duplicação, exclusão e geração via IA
  - Editor visual com pan/zoom, atalhos de teclado, notas, tarefas concluídas, executores, comentários, compartilhamento, Markdown, explicação/expansão com IA e exportação em PNG, PDF, HTML, CSV e Markdown
- `flowchart/` — Aplicação independente Modelador de Fluxogramas em Next.js + React (porta `3003`)
  - Compartilha a mesma autenticação e API (`3001`), com relação **Usuário 1 × N Fluxogramas** em SQLite
  - Biblioteca com abas (`Meus modelos`, `Compartilhados comigo`, `Arquivados`), busca e filtro por estado
  - Editor visual com paleta de 12 símbolos, raias (swimlanes), auto-organização, validação estrutural, comentários, versões, autosave contínuo, geração via botão **IA** a partir de texto corrido e exportação rica em PNG, PDF, HTML, JSON, CSV e Markdown
- `erstudio/` — Aplicação independente ER Studio em Next.js + React (porta `3004`)
  - Compartilha a mesma autenticação e API (`3001`), com relação **Usuário 1 × N Projetos de DER** em SQLite
  - Edição completa de tabelas (adicionar/editar/remover colunas, renomear/excluir tabelas, criar FKs, conjuntos de campos e **N SubModels**)
  - Conexão direta **estritamente somente leitura** com PostgreSQL, MySQL e SQLite para leitura do DDL (nunca grava alterações no banco conectado) + importação de script DDL + geração de script SQL de atualização
  - Assistente com IA que converte texto livre em ajustes estruturados de banco de dados (com revisão antes de aplicar) e exportação do SubModel ativo em PNG, PDF (A4 paisagem) e HTML rico com resumo executivo por IA

## Autenticação (E-mail/Senha + Google OAuth 2.0) e Usuários 1×N Mapas

- O Hub (`http://localhost:3000/login`) exige login e compartilha a sessão (`cookie HttpOnly`) com o **MindMap** (`http://localhost:3002`) via API NestJS (`3001`).
- A tabela `users` se relaciona **1 × N** com `mindmaps` (`owner_id REFERENCES users(id)`): cada usuário vê seus próprios mapas e mapas compartilhados explicitamente com seu e-mail.
- Conta inicial de teste criada no primeiro boot (caso não haja usuários): `nilton@hub.local` / `123456`.
- Para ativar **Continuar com Google**:
  1. Crie um OAuth Client ID (Web Application) no Google Cloud Console com URI de redirecionamento autorizado `http://localhost:3001/api/auth/google/callback`.
  2. Preencha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` em `backend/.env`.

## Configuração da API do Gemini

1. Copie `backend/.env.example` para `backend/.env`.
2. Defina sua chave em `GEMINI_API_KEY` (opcionalmente ajuste `GEMINI_MODEL` e `GEMINI_TEMPERATURE`).
3. Verifique o status em `GET http://localhost:3001/api/ai/status`.

## Como executar

### Linux (Shell)

- `./start.sh` — abre 5 sessões de terminal para API (`3001`), Hub (`3000`), MindMap (`3002`), Flowchart (`3003`) e ER Studio (`3004`)
- `./stop.sh` — encerra os 5 serviços e fecha automaticamente as sessões de terminal abertas pelo `./start.sh`

### Windows (Batch)

- `start.bat` — abre 5 sessões de CMD para API (`3001`), Hub (`3000`), MindMap (`3002`), Flowchart (`3003`) e ER Studio (`3004`)
- `stop.bat` — encerra os 5 serviços e fecha automaticamente as sessões de CMD abertas pelo `start.bat`

### Terminal (npm)

```bash
npm run install:all
npm run dev
```
