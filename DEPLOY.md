# Guia de Deploy em Produção (100% Free Tier)

Este projeto está configurado para rodar em produção com custo zero utilizando:

- **Banco de Dados (PostgreSQL):** [Neon](https://neon.tech) — Plano Free (1 GB por projeto, sem pausa após 7 dias)
- **Backend (NestJS):** [Render](https://dashboard.render.com/register) — Plano Free (`Web Service`, 750h/mês, com [render.yaml](file:///home/nilton-cesar/projetos/utilitarios/hub/render.yaml) e [backend/Dockerfile](file:///home/nilton-cesar/projetos/utilitarios/hub/backend/Dockerfile) já prontos)
- **Frontends (4 apps React/Next):** [Cloudflare Pages](https://pages.cloudflare.com) — Plano Free (banda ilimitada e uso comercial liberado) ou [Vercel](https://vercel.com)

> Em desenvolvimento local (`./start.sh` ou `start.bat`), a API usa a `DATABASE_URL` da Neon definida em `backend/.env` (ou faz fallback automático para **SQLite** caso `DATABASE_URL` fique vazia).

---

## Passo 1 — Banco PostgreSQL na Neon (Já configurado)

1. No painel da [Neon](https://console.neon.tech), clique no botão verde **`Connect`** (canto superior esquerdo).
2. Com **`Connection pooling`** ativo, copie a connection string:
   ```text
   postgresql://neondb_owner:SUA_SENHA@ep-xxxx-pooler.c-9.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```
3. As 10 tabelas do ecossistema (`users`, `sessions`, `mindmaps`, `mindmap_executors`, `mindmap_shares`, `flowcharts`, `flowchart_shares`, `flowchart_versions`, `er_projects` e `er_project_shares`) já estão criadas e populadas na Neon.

---

## Passo 2 — Deploy do Backend NestJS no Render Free

Acesse [dashboard.render.com/register](https://dashboard.render.com/register) e entre com sua conta do **GitHub**. Você pode criar o serviço de duas formas:

### Opção A — Automática via Blueprint (`render.yaml`)
1. No topo do painel do Render, clique em **`+ New`** → **`Blueprint`**.
2. Selecione o repositório Git do projeto.
3. O Render lerá automaticamente o arquivo `render.yaml` na raiz (configurando o serviço `hub-prototipos-api` no plano **Free**, apontando para `backend/Dockerfile` e healthcheck em `/api/health`).
4. Preencha as variáveis de ambiente solicitadas na tela (tabela abaixo) e clique em **`Apply`**.

### Opção B — Manual via Web Service
1. No topo do painel do Render, clique em **`+ New`** → **`Web Service`** e selecione seu repositório Git.
2. Configure os campos principais:
   - **Name:** `hub-prototipos-api`
   - **Root Directory:** `backend`
   - **Runtime:** **`Docker`** *(ou `Node`, com Build Command: `npm install && npm run build` e Start Command: `node dist/main.js`)*
   - **Instance Type:** **`Free`** (\$0/month)
3. Em **Advanced** (opcional):
   - **Health Check Path:** `/api/health`
4. Em **Environment Variables**, adicione as variáveis abaixo (substitua `https://hub-prototipos-api.onrender.com` pela URL gerada pelo Render para o seu serviço):

| Variável | Valor em Produção (Render) |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `DATABASE_URL` | `postgresql://neondb_owner:...@ep-...aws.neon.tech/neondb?sslmode=require&channel_binding=require` |
| `CORS_ORIGIN` | `https://hub.pages.dev,https://mindmap.pages.dev,https://flowchart.pages.dev,https://erstudio.pages.dev` |
| `HUB_APP_URL` | `https://hub.pages.dev` |
| `MINDMAP_APP_URL` | `https://mindmap.pages.dev` |
| `FLOWCHART_APP_URL` | `https://flowchart.pages.dev` |
| `ERSTUDIO_APP_URL` | `https://erstudio.pages.dev` |
| `GOOGLE_CLIENT_ID` | *(seu Client ID do Google OAuth)* |
| `GOOGLE_CLIENT_SECRET` | *(seu Client Secret do Google OAuth)* |
| `GOOGLE_CALLBACK_URL` | `https://hub-prototipos-api.onrender.com/api/auth/google/callback` |
| `GEMINI_API_KEY` | *(sua chave da API do Gemini)* |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` |
| `GEMINI_FALLBACK_MODELS` | `gemini-3-flash-preview,gemini-flash-lite-latest,gemini-3.8-flash` |

> **Cookies de sessão compartilhada (`hub_session`):**
> - **Sem domínio próprio** (`*.pages.dev` / `*.vercel.app` acessando `*.onrender.com`): deixe `COOKIE_DOMAIN` vazio. A API detecta `NODE_ENV=production` automaticamente e emite cookies `HttpOnly; Secure; SameSite=None`.
> - **Com domínio próprio (recomendado para compatibilidade total no Safari/iOS):** configure subdomínios (`hub.`, `mindmap.`, `flowchart.`, `erstudio.`, `api.seudominio.com`) e adicione `COOKIE_DOMAIN=.seudominio.com` e `COOKIE_SAME_SITE=lax`.

5. Clique em **`Deploy Web Service`**.
6. Assim que o deploy finalizar, acesse `https://hub-prototipos-api.onrender.com/api/health` e confirme o retorno:
   ```json
   {
     "status": "ok",
     "service": "hub-prototipos-api",
     "database": { "driver": "postgres", "connected": true }
   }
   ```

---

## Passo 3 — Deploy dos 4 Frontends no Cloudflare Pages (ou Vercel)

Os 3 apps Next.js (`frontend`, `flowchart`, `erstudio`) já estão configurados com `output: 'export'` (gerando HTML/JS estático na pasta `out/`), e o `mindmap` gera sua saída estática em `dist/`.

No [Cloudflare Pages](https://dash.cloudflare.com) (**Workers & Pages → Create → Pages → Connect to Git**) ou na [Vercel](https://vercel.com/new), crie **4 projetos** apontando para o mesmo repositório:

| Aplicação | Root Directory | Build Command | Build Output Directory | Variáveis de Ambiente |
| :--- | :--- | :--- | :--- | :--- |
| **1. Hub** | `frontend` | `npm run build` | `out` | `NEXT_PUBLIC_API_URL=https://hub-prototipos-api.onrender.com/api` |
| **2. MindMap** | `mindmap` | `npm run build` | `dist` | `VITE_API_URL=https://hub-prototipos-api.onrender.com/api`<br>`VITE_HUB_URL=https://hub.pages.dev` |
| **3. Flowchart** | `flowchart` | `npm run build` | `out` | `NEXT_PUBLIC_API_URL=https://hub-prototipos-api.onrender.com/api`<br>`NEXT_PUBLIC_HUB_URL=https://hub.pages.dev` |
| **4. ER Studio** | `erstudio` | `npm run build` | `out` | `NEXT_PUBLIC_API_URL=https://hub-prototipos-api.onrender.com/api`<br>`NEXT_PUBLIC_HUB_URL=https://hub.pages.dev` |

> **Importante:** Depois que o Cloudflare Pages (ou Vercel) gerar as 4 URLs reais dos frontends, copie essas URLs e atualize `CORS_ORIGIN`, `HUB_APP_URL`, `MINDMAP_APP_URL`, `FLOWCHART_APP_URL` e `ERSTUDIO_APP_URL` nas variáveis de ambiente do serviço no **Render**.

---

## Passo 4 — Autorizar a URL do Render no Google OAuth 2.0

No [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials):

1. Clique no seu **OAuth 2.0 Client ID**.
2. Em **Authorized redirect URIs**, adicione a URL da sua API no Render:
   ```text
   https://hub-prototipos-api.onrender.com/api/auth/google/callback
   ```
3. Em **Authorized JavaScript origins**, adicione a URL de produção do Hub (ex.: `https://hub.pages.dev`) e clique em **Save**.

---

## Passo 5 — Evitar Hibernação (Spin-down) do Render Free

No plano Free do Render, o Web Service hiberna após **15 minutos sem receber requisições** (levando ~50 segundos para acordar no primeiro acesso seguinte), mas você tem **750 horas gratuitas por mês** (suficiente para 1 serviço rodar 24/7 o mês inteiro).

Para manter a API sempre acordada sem custo:
1. Crie uma conta gratuita no [cron-job.org](https://cron-job.org) ou [UptimeRobot](https://uptimerobot.com).
2. Configure um monitor/cron fazendo `GET` em:
   ```text
   https://hub-prototipos-api.onrender.com/api/health
   ```
   a cada **14 minutos**.
