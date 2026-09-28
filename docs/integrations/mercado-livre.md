# Integração com Mercado Livre

## Finalidade

O Worker em `onframe.onblide.com` é a única fronteira autenticada entre o
OnFrame e a API do Mercado Livre. A extensão não chama a API do Mercado Livre
diretamente e não guarda credenciais de conta no computador.

## Autenticação

1. A pessoa usa `ui/options/` ou `ui/popup/` para entrar com e-mail e senha ou
   criar a conta no Supabase Auth. O link mágico continua opcional e a
   recuperação de senha é iniciada nas mesmas interfaces.
2. O Turnstile é hospedado por `/auth/challenge` dentro de um `iframe` com
   origem `onframe.onblide.com`. A extensão entrega o token ao Supabase, sem
   carregar o script do provedor no contexto Manifest V3.
3. Após login por senha, a extensão envia o bearer do Supabase apenas ao
   `background`; `POST /v1/extension-sessions/from-auth` o valida e devolve o
   bearer revogável da sessão da extensão. O bearer do Supabase não é guardado.
4. Cadastro confirmado, link mágico e recuperação usam um fluxo opaco de vida
   curta. O callback `/connect` conclui o fluxo e o `background` consome a
   sessão sem apresentar um código para a pessoa.
5. Uma pessoa administradora inicia `POST /v1/mercadolivre/oauth/start`.
   O Worker gera `state`, `code_verifier` e o desafio PKCE `S256`.
6. O Mercado Livre retorna para
   `https://onframe.onblide.com/oauth/mercadolivre/callback`. O Worker
   valida o estado, troca o código por tokens e consulta `/users/me`.
7. A conta é associada ao workspace e fica disponível para as extensões
   vinculadas a ele.

O callback deve estar registrado exatamente como
`https://onframe.onblide.com/oauth/mercadolivre/callback` no aplicativo
do Mercado Livre.

## Contas e propriedade do anúncio

O workspace suporta várias contas conectadas. Uma conta pode ser desativada
sem ser removida. Quando a requisição informa `owner_user_id`, o Worker usa
essa conta; caso contrário, testa as contas habilitadas e seleciona aquela que
comprovar ser dona do anúncio. Contas desativadas não podem editar anúncios.

As telas da extensão usam:

- `GET /v1/accounts` para listar contas;
- `PATCH /v1/accounts/:meliUserId` para habilitar ou desabilitar uma conta;
- `DELETE /v1/accounts/:meliUserId` para desvincular uma conta.

Essas operações exigem uma sessão de extensão vinculada e permissão de
administração do workspace.

## Segredos e armazenamento

`MELI_CLIENT_ID` e `MELI_CLIENT_SECRET` são secrets do Worker.
`MELI_TOKEN_CIPHER_KEY` é uma `secret_key` usada em AES-GCM para cifrar
credenciais antes de gravá-las em `seller_credentials` no D1. Nenhum desses
valores, access token ou refresh token é devolvido para a extensão ou
registrado em logs.

O refresh token é rotativo e de uso único. Antes de renová-lo, o Worker obtém
um lock temporário por credencial no D1. A requisição que detém o lock grava o
novo par de tokens; as demais reutilizam o estado atualizado.

## Contratos da extensão

Com uma sessão válida, o `background` encaminha todo contrato iniciado em
`/api/` para `/v1/api/` no Worker. O Worker preserva os contratos
normalizados de itens, fotos, descrição, características, preços, promoções e
ações em massa.

Para promoções, `GET /seller-promotions/items/{itemId}` informa a
participação, enquanto
`GET /items/{itemId}/sale_price?context=channel_marketplace` identifica a
oferta que vence o preço público por `metadata.promotion_id`. A regra de
interface está em [Estados de promoções](../product/promocoes.md).

## Falhas

Uma sessão ausente, expirada ou revogada bloqueia a edição e orienta a pessoa a
entrar novamente na extensão. Se nenhuma conta habilitada for dona do anúncio,
a operação é recusada. Falhas de credencial exigem nova autorização da conta
no workspace.
