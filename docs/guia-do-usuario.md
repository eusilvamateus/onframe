# Guia do usuario do OnFrame

O OnFrame ajuda vendedores do Mercado Livre a editar anuncios diretamente na
pagina do produto. A ideia e simples: voce abre o anuncio como ele aparece para
o comprador e faz ajustes importantes sem voltar para varias telas do painel do
vendedor.

![Print - Visao geral do OnFrame na pagina do anuncio](assets/caracteristicas-antes-edicao.png)

## O que o OnFrame oferece

Com o OnFrame, voce pode:

- editar fotos do anuncio;
- reorganizar fotos arrastando;
- remover e adicionar fotos;
- conferir a qualidade das imagens;
- otimizar imagens abaixo do ideal;
- consultar preco, custos e promocoes;
- aplicar, alterar ou remover promocoes quando elas estiverem disponiveis;
- editar a descricao direto no corpo do anuncio;
- editar caracteristicas do produto direto na ficha tecnica;
- aplicar algumas alteracoes em todas as variacoes quando o anuncio permite.

## O que mudou nas versoes recentes

As mudancas recentes deixaram o OnFrame mais proximo da experiencia natural do
Mercado Livre. Em vez de abrir varias telas separadas, a extensao passa a
trabalhar dentro das secoes que voce ja conhece: descricao, caracteristicas,
preco e promocoes.

![Print - Botoes para editar descricao e caracteristicas](assets/descricao-antes-edicao.png)

As principais novidades sao:

- edicao da descricao direto no texto do anuncio;
- edicao da ficha tecnica dentro da propria tabela de caracteristicas;
- exibicao mais clara de campos pendentes, ocultos ou somente leitura;
- bloco separado para dimensoes do pacote;
- revisao mais limpa de promocoes, descontos, custos e valores recebidos;
- acao em massa para variacoes quando o anuncio trabalha com variacoes
  independentes;
- atualizacao por um clique a partir do popup da extensao.

## Como usar no dia a dia

Abra o anuncio no Mercado Livre e aguarde o OnFrame reconhecer o produto. Quando
os controles aparecerem, escolha a area que deseja ajustar.

Para editar a descricao, abra a descricao completa se ela estiver recolhida e
clique em `Editar descricao`.

Para editar as caracteristicas, abra todas as caracteristicas se a ficha estiver
recolhida e clique em `Editar caracteristicas`.

Para mexer em preco ou promocoes, use os botoes do OnFrame proximos ao preco do
anuncio.

![Print - Botoes de preco e promocao no anuncio](assets/promocoes-popover-anuncio.png)

## Quando aparece "Aplicar a todas as variacoes"

Alguns anuncios tratam cada variacao como se fosse um anuncio separado. Nesses
casos, alterar uma variacao nao muda automaticamente as outras.

Quando o OnFrame identifica que existe mais de uma variacao ativa e editavel, ele
pode mostrar a opcao `Aplicar a todas as variacoes`. Ao marcar essa opcao, a
extensao tenta repetir a alteracao nas variacoes disponiveis.

![Print - Opcao aplicar a todas as variacoes](assets/promocoes-revisao-todas-variacoes.png)

Antes de confirmar, revise com calma. Algumas variacoes podem ter regras
diferentes, promocoes diferentes ou campos bloqueados pelo Mercado Livre. Quando
isso acontece, o OnFrame mostra quais variacoes foram alteradas e quais nao
foram.

## O que acontece depois de salvar

Depois de salvar, o Mercado Livre pode levar alguns instantes para refletir a
mudanca na pagina. Se a informacao ainda parecer antiga, recarregue a pagina do
anuncio.

Se alguma coisa nao puder ser alterada, o OnFrame mostra uma mensagem explicando
o motivo de forma direta. Em geral, isso acontece quando o proprio Mercado Livre
bloqueia o campo, a promocao ou a variacao.

## Atualizacoes

Quando existe uma nova versao, o popup do OnFrame pode abrir uma pagina local de
atualizacao. Essa pagina tenta iniciar o atualizador automaticamente. Se o
navegador nao permitir, a mesma pagina mostra o comando manual para copiar e
executar no PowerShell.

![Print - Pagina local de atualizacao do OnFrame](assets/atualizacao-pagina-local.png)
