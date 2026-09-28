# Estrutura do projeto

## Objetivo

O OnFrame permite que vendedores do Mercado Livre gerenciem anúncios a partir
da página pública do produto. A extensão executa a interface no navegador; o
Worker remoto executa todas as operações autenticadas e guarda as credenciais.
Não há servidor local, token local ou fallback para `localhost`.

## Componentes

### Extensão (`extension/`)

- `core/` concentra detecção de página, registro de módulos, bridge de API e o
  shell da interface injetada.
- `modules/` implementa fotos, descrição, características e comércio.
- `background.js` mantém exclusivamente o bearer de sessão do OnFrame e
  encaminha contratos `/api/*` para `https://onframe.onblide.com/v1/api/*`.
- `ui/options/` e `ui/popup/` autenticam a pessoa, mostram a sessão do
  workspace e administram as contas conectadas.

### Worker remoto (`cloudflare/`)

- O Worker em `onframe.onblide.com` concentra usuários, workspaces, sessões de
  extensão, contas do Mercado Livre, operações e auditoria.
- O D1 armazena dados de workspace e credenciais do Mercado Livre cifradas.
- `POST /hooks/supabase/send-email` recebe exclusivamente webhooks assinados do
  Supabase Auth, renderiza os e-mails transacionais e os entrega pelo Resend.
  O segredo de assinatura, a chave do Resend e os OTPs não são armazenados no
  D1; somente o estado idempotente de entrega é registrado.
- `POST /v1/extension-sessions/from-auth` valida o bearer emitido pelo
  Supabase Auth e cria a sessão revogável da extensão. Nenhum código de
  autenticação adicional é exibido para a pessoa.
- `POST /v1/extension-auth-flows`, o callback público `/connect` e
  `GET /v1/extension-auth-flows/:token` concluem cadastro confirmado, link
  mágico e recuperação de senha sem transferir o bearer do Supabase para a
  interface visível da extensão.
- `/auth/challenge` hospeda o Turnstile dentro de um `iframe` com origem
  `onframe.onblide.com`, permitindo que páginas da extensão Manifest V3 usem
  a confirmação de segurança sem carregar scripts remotos.
- `POST /v1/mercadolivre/oauth/start` inicia a autorização de uma conta; o
  callback público `/oauth/mercadolivre/callback` conclui a troca de tokens.
- `GET /v1/accounts`, `PATCH /v1/accounts/:meliUserId` e
  `DELETE /v1/accounts/:meliUserId` administram as contas do workspace.
- `/v1/api/*` preserva os contratos da extensão para itens, fotos, descrição,
  características, preços, promoções e ações em massa.

### Domínio comercial (`cloudflare/src/domain/`)

Os módulos CommonJS concentram as regras de negócio e os contratos
normalizados. O Worker os importa pela fronteira `legacy-contracts.ts`; a
suíte Node os usa diretamente e com um adaptador HTTP exclusivo de teste em
`test/support/`.

### Scripts (`scripts/`)

- `bootstrap/` instala ou atualiza a extensão no Windows e macOS.
- `onframe-updater://update` inicia o atualizador registrado no computador.
- `release/` valida versão, prepara notas e monta o pacote distribuído.

### Testes (`test/`)

Os testes Node cobrem modelos da extensão, domínio comercial, contratos do
Worker, pacote de release e bootstrap. O adaptador em `test/support/` não é
parte do produto nem do pacote de instalação.

## Fluxo principal

1. A extensão reconhece uma página de anúncio e injeta apenas os módulos
   aplicáveis.
2. Um módulo envia um contrato `/api/*` para o `background`.
3. O `background` exige uma sessão vinculada e encaminha a chamada para
   `/v1/api/*` no Worker.
4. O Worker seleciona a conta habilitada do workspace, usa a credencial cifrada
   e normaliza a resposta do Mercado Livre.
5. A extensão recebe somente os dados de operação; tokens do Mercado Livre
   nunca entram no contexto da página.

## Fronteiras de segurança

- O contexto da página não recebe bearer da extensão nem token do Mercado Livre.
- O bearer da extensão fica apenas em `chrome.storage.local` e identifica uma
  sessão revogável do workspace.
- Access e refresh tokens ficam cifrados no D1; `MELI_CLIENT_ID`,
  `MELI_CLIENT_SECRET` e `MELI_TOKEN_CIPHER_KEY` são secrets do Worker.
- `RESEND_API_KEY` e `SUPABASE_SEND_EMAIL_HOOK_SECRET` são secrets do Worker.
  O endpoint de e-mail é público somente para receber o webhook, cuja
  autenticidade é verificada pelo padrão Standard Webhooks antes de qualquer
  entrega. Cada envio também usa uma chave de idempotência determinística no
  Resend, sem armazenar endereços, links ou códigos no D1.
- O Supabase Auth exige token do Turnstile para cadastro, login e recuperação
  de senha. O token é produzido pelo `iframe` com origem
  `onframe.onblide.com`; o segredo é injetado em `supabase config push` como
  `SUPABASE_TURNSTILE_SECRET`, nunca no Worker, na extensão ou no repositório.
- A ausência ou expiração da sessão bloqueia contratos `/api/*` até novo login.

## Referências

- [Integração Mercado Livre](../integrations/mercado-livre.md)
- [Instalação e atualização](../user/instalacao-e-atualizacao.md)
- [Estados de promoções](../product/promocoes.md)
