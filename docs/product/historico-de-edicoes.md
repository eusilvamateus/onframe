# Historico de edicoes

## Finalidade

O historico registra alteracoes de anuncios realizadas pelo OnFrame e
confirmadas pelo Mercado Livre. Tentativas recusadas, alvos bloqueados e itens
ignorados em operacoes em lote nao aparecem na linha do tempo.

O popup usa esse contrato para um resumo recente e direto. As opcoes da
extensao usam a mesma consulta paginada, com filtros, para apresentar o
relatorio completo.

Na listagem completa, cada evento permanece resumido ate a pessoa acionar
`Ver detalhes`. A expansao acontece dentro do proprio card e apresenta somente
o conteudo pertinente ao tipo de alteracao, sem abrir outra pagina ou modal.
Eventos sem detalhes estruturados permanecem sem essa acao.

## Conteudo registrado

Cada evento identifica o workspace, a conta conectada, a pessoa, o anuncio, o
tipo de mudanca e o instante da confirmacao. Nome, imagem e link do anuncio sao
capturados como contexto historico quando estiverem disponiveis. Na consulta,
eventos sem imagem reutilizam a capa mais recente conhecida para o mesmo
anuncio, e a pessoa usa o nome, o e-mail e o avatar atuais do workspace.

O nivel de detalhe depende da operacao:

- preco: valor anterior e valor confirmado, cada um com valor e moeda;
- descricao: existencia e tamanho antes e depois, sem armazenar o texto;
- caracteristicas: campos enviados, com valor anterior e valor confirmado;
- promocao: identificacao, estado anterior e confirmado, campos alterados e
  origem individual ou em lote;
- fotos: quantidades, inclusoes, remocoes e indicacao de reordenacao.

Operacoes em lote geram um evento independente para cada anuncio efetivamente
alterado. Isso permite filtrar por anuncio e evita tratar um sucesso parcial
como se toda a familia tivesse sido modificada.

## Contrato de detalhes

Cada evento novo informa a operacao canonica em `operation` e a versao do
objeto `details` em `detailsVersion`. A versao atual e `1`:

- `price`: `before` e `after` usam `{ amount, currency }`;
- `description`: `before` e `after` usam `{ exists, length }`;
- `characteristics`: `changes` lista `{ id, label, before, after }`;
- `pictures`: informa `beforeCount`, `afterCount`, `added`, `removed` e
  `reordered`;
- `promotion`: informa `promotion`, `before`, `after`, `changedFields` e
  `origin`.

Eventos criados antes desse contrato continuam consultaveis com
`detailsVersion: 0` e `operation: null`. Consumidores devem manter a leitura do
formato legado enquanto esses registros existirem.

## Consulta e acesso

`GET /v1/app/item-edit-history` devolve os eventos do workspace em ordem
decrescente, com paginacao e limite de ate 50 registros. A consulta aceita os
filtros `itemId`, `accountId`, `userId`, `changeType`, `from` e `to`.

Administradores podem consultar todas as contas do workspace. Colaboradores
veem somente eventos das contas que continuam atribuidas a eles.

## Consistencia

O Worker grava o evento somente depois de o contrato de edicao concluir com
sucesso. Em operacoes em lote, apenas alvos com estado `applied` sao gravados.
A falha interna de escrita e registrada na observabilidade, sem transformar uma
alteracao ja confirmada pelo Mercado Livre em uma falsa falha para a pessoa.

Promocoes usam a leitura anterior a mutacao e a leitura que confirmou o estado
final. Quando a API aceita a alteracao mas ainda nao a reflete, a reconciliacao
duravel preserva o estado anterior e so cria o evento depois da confirmacao.
