# Estados de promocoes

## Objetivo

O OnFrame mostra campanhas disponiveis, participacoes ja enviadas e a promocao
que efetivamente determina o preco publico do anuncio. Essas situacoes sao
distintas e precisam permanecer coerentes no botao, no popover, no modal e no
contador.

## Terminologia

- **Participacao**: retorno de `GET /seller-promotions/items/{itemId}` para
  uma campanha do anuncio.
- **Promocao de preco**: campanha nao acumulativa que pode determinar o preco
  publico do anuncio.
- **Promocao acumulativa**: cupom ou desconto por meio de pagamento que pode
  coexistir com a promocao de preco e depende do contexto do comprador.
- **Oferta vencedora**: promocao de preco identificada pelo
  `metadata.promotion_id` de
  `GET /items/{itemId}/sale_price?context=channel_marketplace`.

## Regras

- `candidate` representa uma oportunidade **Disponivel**.
- `pending` representa uma participacao **Programada**.
- Uma participacao `started` nao acumulativa so e **Ativa** quando corresponde
  de forma exata a oferta vencedora do `sale_price`.
- Uma participacao `started` que nao vence o preco permanece **Programada**.
  Ela nao deve voltar a aparecer como oportunidade disponivel.
- Promocoes acumulativas `started` sao exibidas como **Ativas**, mas nao entram
  na contagem da promocao que define o preco publico.
- Preco, percentual de desconto, datas e ordem das respostas nunca determinam
  qual oferta esta ativa.
- Sem `metadata`, com identificador desconhecido, vinculo ambiguo ou falha na
  consulta do `sale_price`, nenhuma promocao de preco nao acumulativa recebe o
  estado **Ativa**.

## Resolucao da oferta vencedora

O identificador da oferta no `sale_price` e correlacionado sem usar preco,
desconto, data ou ordem de retorno:

1. Primeiro, `metadata.promotion_id` deve coincidir com `offer_id` ou `ref_id`
   da participacao do item. Essa identidade e suficiente; o
   `metadata.promotion_type` nao bloqueia a correspondencia.
2. Se a participacao nao expuser um identificador de oferta, o OnFrame consulta
   `GET /seller-promotions/offers/{offerId}` para obter a identidade da
   promocao associada a essa oferta.
3. A participacao so e considerada vencedora quando `offer.id`, `item_id` e
   `promotion_id` coincidem de forma unica com essa resposta.
4. Se a oferta e a participacao nao trouxerem identificador de promocao, o
   vinculo so ocorre se houver uma unica participacao nao acumulativa `started`,
   tambem sem identificadores, com o mesmo tipo retornado pela oferta.

O tipo retornado por `GET /seller-promotions/offers/{offerId}` e usado somente
para desambiguar participacoes sem identidade. Preco, desconto, data e o tipo
descritivo do `sale_price` nunca escolhem a oferta vencedora.

## Participacoes sem identificador

Alguns tipos de promocao podem retornar a participacao sem `offer_id`, `ref_id`
ou `promotion_id`. Nessa situacao, a oferta vencedora continua sendo consultada
e deve pertencer ao mesmo item. A participacao so recebe **Ativa** quando a
regra de vinculo unico acima for satisfeita; qualquer ambiguidade permanece
**Programada**.

## Reconciliacao

`GET /seller-promotions/offers/{offerId}` tambem resolve a identidade da oferta
vencedora quando a participacao do item nao trouxer `offer_id` ou `ref_id`.
Depois de encontrada a participacao correspondente, a consulta pode reconciliar
um estado defasado ou conflitante. Seu estado nao substitui indiscriminadamente
o estado retornado para o item. Um estado de oferta que nao tenha semantica de
reconciliacao conhecida ainda pode comprovar a identidade, mas nao altera o
estado visual da participacao.

## Relacoes

- [Promocoes e acoes em massa](../user/promocoes-acoes-em-massa.md)
- [Estrutura do projeto](../architecture/estrutura-do-projeto.md)
