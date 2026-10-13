# Historico de edicoes

## Finalidade

O historico registra alteracoes de anuncios realizadas pelo OnFrame e
confirmadas pelo Mercado Livre. Tentativas recusadas, alvos bloqueados e itens
ignorados em operacoes em lote nao aparecem na linha do tempo.

O popup deve usar esse contrato para um resumo recente e direto. As opcoes da
extensao podem usar a mesma consulta paginada, com filtros, para apresentar o
relatorio completo.

## Conteudo registrado

Cada evento identifica o workspace, a conta conectada, a pessoa, o anuncio, o
tipo de mudanca e o instante da confirmacao. Nome, imagem e link do anuncio sao
capturados como contexto historico quando estiverem disponiveis. Na consulta,
eventos sem imagem reutilizam a capa mais recente conhecida para o mesmo
anuncio, e a pessoa usa o nome, o e-mail e o avatar atuais do workspace.

O nivel de detalhe depende da operacao:

- preco: valor anterior, valor confirmado e moeda;
- descricao: somente se foi adicionada ou alterada, sem armazenar o texto;
- caracteristicas: campos enviados, com valor anterior e valor confirmado;
- promocao: inclusao, alteracao ou remocao, sem copiar a configuracao inteira;
- fotos: quantidade anterior e quantidade confirmada.

Operacoes em lote geram um evento independente para cada anuncio efetivamente
alterado. Isso permite filtrar por anuncio e evita tratar um sucesso parcial
como se toda a familia tivesse sido modificada.

## Consulta e acesso

`GET /v1/app/item-edit-history` devolve os eventos do workspace em ordem
decrescente, com cursor e limite de ate 50 registros. A consulta aceita os
filtros `itemId`, `accountId`, `userId` e `changeType`.

Administradores podem consultar todas as contas do workspace. Colaboradores
veem somente eventos das contas que continuam atribuidas a eles.

## Consistencia

O Worker grava o evento somente depois de o contrato de edicao concluir com
sucesso. Em operacoes em lote, apenas alvos com estado `applied` sao gravados.
A falha interna de escrita e registrada na observabilidade, sem transformar uma
alteracao ja confirmada pelo Mercado Livre em uma falsa falha para a pessoa.
