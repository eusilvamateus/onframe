# Integracao com Mercado Livre

## Finalidade

O OnFrame usa um servico local para autenticar contas, acessar a API do Mercado
Livre e devolver dados normalizados para a extensao. O contexto da pagina nunca
recebe tokens da conta.

## Sistemas externos

- `https://connect.onblide.com` atua como broker da autorizacao e da troca
  ou renovacao de tokens. A base pode ser alterada com
  `ONBLIDE_CONNECT_BASE_URL`.
- `https://api.mercadolibre.com` fornece itens, descricoes,
  caracteristicas, imagens, precos e promocoes.

## Autenticacao

1. A extensao solicita `POST /auth/start` ao servico local.
2. O servico cria `state`, `code_verifier` e o desafio PKCE
   `S256`, e pede ao broker a URL de autorizacao.
3. O navegador conclui a autorizacao do Mercado Livre e retorna para o callback
   local `/auth/mercadolivre/callback`.
4. O servico valida o estado pendente, troca o codigo pelo token por meio do
   broker e consulta `/users/me` para completar o perfil da conta.
5. O token e o perfil sao armazenados localmente; a extensao recebe apenas os
   dados necessarios para operar a conta.

Estados de autorizacao pendentes expiram em dez minutos. O servico renova o
access token quando ele esta ausente ou faltam menos de cinco minutos para a
expiracao.

## Contas e propriedade do anuncio

O armazenamento suporta varias contas conectadas. Uma conta pode ser desativada
sem ser removida. Quando a requisicao informa `owner_user_id`, o servico usa
essa conta; caso contrario, testa as contas habilitadas e seleciona aquela que
comprovar ser dona do anuncio. Contas desativadas nao podem editar anuncios.

## Segredos e armazenamento

A instalacao normal define `ML_TOKEN_STORE_PATH` para
`.onframe/tokens.json` dentro da pasta do OnFrame. O arquivo e cifrado
com `AES-256-GCM`. O bootstrap gera e guarda um
`ONBLIDE_TOKEN_SECRET` local em `.env` quando ele ainda nao existe.

Nao versione `.env`, tokens, `ONBLIDE_TOKEN_SECRET` ou arquivos em
`.onframe/`. A configuracao de exemplo e
[.env.example](../../.env.example); ela nao contem segredos.

## Contratos e fronteiras

- A extensao acessa somente o servico local em `127.0.0.1`.
- Requisicoes com `Origin` precisam vir da extensao autorizada pelo
  `manifest.json`, salvo `GET /health` e o callback de autorizacao.
- O servico expõe rotas por dominio para itens, descricao, caracteristicas,
  fotos, precificacao, promocoes e operacoes em massa.
- `GET /seller-promotions/items/{itemId}` informa participacoes; o
  `sale_price` identifica a oferta que determina o preco publico. As
  regras de apresentacao ficam em [Estados de promocoes](../product/promocoes.md).

## Falhas e recuperacao

Erros de autenticacao invalidam a operacao e orientam a pessoa usuaria a
conectar novamente. Se nenhuma conta habilitada for dona do anuncio, a edicao e
recusada. Diagnostique o processo e os logs conforme
[Servico local](../operations/servico-local.md).

## Configuracao

| Variavel | Finalidade |
| --- | --- |
| `ML_SERVICE_PORT` | Porta do servico local; padrao `4765`. |
| `ONBLIDE_CONNECT_BASE_URL` | Base do broker de autenticacao. |
| `ONBLIDE_TOKEN_SECRET` | Segredo local usado para cifrar tokens. |
| `ML_TOKEN_STORE_PATH` | Caminho local do banco cifrado de contas. |
| `ONFRAME_ALLOWED_ORIGINS` | Lista opcional de origens permitidas, separadas por virgula. |
