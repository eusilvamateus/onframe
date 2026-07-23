# Changelog

## v0.1.1 - 2026-07-23

### Corrigido

- A remocao de promocoes nao exige mais preenchimento de preco promocional.
- Promocoes programadas aplicadas ao anuncio agora permitem alterar ou remover
  quando o Mercado Livre informa essas acoes no contrato da oferta.

## v0.1.0 - 2026-07-23

### Adicionado

- Primeira versao publica da nova linha do OnFrame.
- Extensao local para editar e diagnosticar anuncios do Mercado Livre pela
  pagina do produto.
- Modulo de fotos com bandeja imersiva, reordenacao, upload, remocao e leitura
  de dimensoes das imagens.
- Modulo de preco com leitura de preco base, preco promocional, comissao, frete,
  repasse estimado e bonus do Mercado Livre quando informado pela API.
- Modulo de promocoes com leitura, aplicacao, alteracao e remocao de ofertas
  disponiveis para o anuncio.
- Suporte a anuncios proprios nos modelos `item`, `user_product`, variacoes
  antigas e catalogo, respeitando as restricoes do Mercado Livre.
- Popup e pagina de opcoes alinhados ao design system da Onblide.
- Servico local para manter autenticacao, chamadas ao Mercado Livre e atualizacao
  do pacote fora da extensao.

### Observacao

- O versionamento anterior foi descartado intencionalmente. Esta versao passa a
  ser o novo ponto inicial do projeto.
