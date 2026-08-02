# Changelog

## v0.3.8 - 2026-08-02

### Melhorado

- Disponibiliza uma nova versao para validar o fluxo de atualizacao por um
  clique introduzido no `v0.3.7`.

## v0.3.7 - 2026-08-02

### Adicionado

- Popup de atualizacao passa a abrir uma pagina local que aciona o atualizador
  registrado no Windows via `onframe-updater://update`.
- Instalacao e atualizacao passam a registrar o protocolo local do atualizador;
  a desinstalacao remove esse registro.

### Melhorado

- Pagina local de atualizacao mantem comando manual como fallback e atalhos para
  `chrome://extensions/` e `edge://extensions/`.

## v0.3.6 - 2026-07-26

### Melhorado

- Scripts de instalacao, atualizacao e desinstalacao passam a mostrar atalhos
  diretos para `chrome://extensions/` e `edge://extensions/` ao concluir o
  processo.

## v0.3.5 - 2026-07-26

### Melhorado

- Scripts de instalacao, atualizacao e desinstalacao passam a exibir uma
  experiencia visual OnFrame no PowerShell, com etapas claras, mensagens de
  progresso e erros destacados.
- Bootstrap local preserva o contexto do terminal do usuario sem limpar a tela.

## v0.3.4 - 2026-07-26

### Melhorado

- Pacotes de release passam a usar o nome `onframe-vX.Y.Z.zip`.
- Bootstrap de instalacao e atualizacao continua aceitando pacotes legados
  `onframe-release-vX.Y.Z.zip`.
- Scripts de versionamento passam a manter `package-lock.json` alinhado com a
  versao publicada.

## v0.3.3 - 2026-07-26

### Melhorado

- Notas de release do GitHub passam a ser geradas com cabecalho publico,
  release anterior e link de comparacao.
- A geracao das notas de release foi movida para um script testavel.

## v0.3.2 - 2026-07-26

### Corrigido

- Releases do GitHub passam a usar somente as notas da versao publicada.
- Titulos das releases foram padronizados para a propria tag `vX.Y.Z`.
- Removida nota interna de versionamento do changelog publico.

## v0.3.1 - 2026-07-26

### Adicionado

- Atributos pendentes da categoria passam a aparecer no editor de
  caracteristicas quando o contrato da API permite preenchimento seguro.

### Melhorado

- Badges de status das caracteristicas foram simplificados para evitar conflito
  visual entre `Pendente`, `Leitura` e `Oculto`.

### Corrigido

- Campos de texto pendentes preservam o valor digitado durante a edicao inline.

## v0.3.0 - 2026-07-26

### Adicionado

- Edicao inline da descricao diretamente na pagina do produto, com suporte a
  anuncios comuns e `user_product`.
- Edicao inline das caracteristicas do produto na ficha tecnica nativa do
  Mercado Livre.
- Acao em massa para salvar descricao e caracteristicas nas variacoes ativas de
  anuncios `user_product`, respeitando falhas individuais.
- Tratamento separado para dimensoes do pacote dentro do editor de
  caracteristicas.

### Melhorado

- Editor de descricao preserva a altura visual da pagina ao entrar em edicao.
- Editor de caracteristicas usa campos do design system local e mantem campos
  ocultos ou de leitura incorporados a tabela nativa.
- Botoes de edicao respeitam o estado colapsado das secoes nativas do Mercado
  Livre antes de abrir o editor.
- Servico local com origem, erros, diagnosticos, auditoria e armazenamento de
  tokens mais restritos.
- Scripts de bootstrap geram segredo local de token de forma compativel com o
  PowerShell do Windows.

### Corrigido

- Dimensoes de embalagem editaveis deixam de aparecer como somente leitura
  quando o contrato da API permite alteracao.
- Campos compostos de dimensao, como largura x comprimento, sao tratados dentro
  da linha nativa quando possivel.

## v0.2.0 - 2026-07-25

### Adicionado

- Acoes em massa para aplicar, alterar ou remover preco e promocoes nas
  variacoes de anuncios `user_product`, respeitando elegibilidade e bloqueios
  individuais de cada variacao.
- Validacao previa das variacoes elegiveis antes de confirmar uma acao em
  massa.

### Melhorado

- Feedback de carregamento durante validacao e envio de acoes em massa.
- Cards de preco e promocoes com menos repeticao de informacoes e melhor
  organizacao de rebate, repasse, comissao e frete.
- Checkbox de acao em massa alinhado ao design system local.
- Grid de revisao de custos ajustado para ocupar melhor o espaco quando houver
  quantidade impar de cards.

### Corrigido

- Removida duplicidade de `Mercado Livre paga` em cards de promocoes.
- Corrigida regressao visual em que valores internos viravam cards aninhados.
- Ajustada a revisao de aplicacao de promocoes para nao repetir preco,
  desconto, rebate e percentual do vendedor no mesmo bloco.

## v0.1.2 - 2026-07-23

### Documentacao

- Documentado o fluxo padrao de commit, push e release.
- Ajustado o documento de releases para usar `--ff-only` e validar com
  `npm run test:all`.

### Manutencao

- Ignorados os dados locais gerados pelo `code-review-graph`.

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
