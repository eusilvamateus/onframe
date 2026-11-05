# Feedback de operacoes

## Objetivo

O frontend representa primeiro o resultado de uma operacao pelo estado da
propria interface. Mensagens adicionais existem somente quando a mudanca visual
nao explica o que aconteceu ou quando a pessoa precisa tomar uma decisao.

Esse contrato segue os principios de proximidade de feedback do GitHub Primer,
a sincronizacao local do Linear e a hierarquia de mensagens do Atlassian Design
System. O OnFrame adota as regras, nao a aparencia desses produtos.

## Resultados

As variacoes tecnicas de cada integracao devem chegar ao frontend classificadas
em poucas familias semanticas:

- `confirmed`: a alteracao foi confirmada pela fonte remota;
- `accepted`: a escrita foi aceita, mas a leitura ainda precisa ser reconciliada;
- `unchanged`: o estado desejado ja existia;
- `rejected`: uma regra de negocio impediu a operacao;
- `unavailable`: uma dependencia ou parte da interface esta indisponivel;
- `unexpected`: a falha nao tem classificacao mais especifica.

O frontend nao interpreta mensagens cruas do Mercado Livre para escolher um
componente. Codigos de dominio so recebem tratamento proprio quando exigem uma
acao diferente da familia a que pertencem.

## Escolha da superficie

- Sucesso evidente pela interface nao gera `Toast` ou `Alert`.
- Erro corrigivel em um campo aparece no proprio campo.
- Erro de uma acao ou formulario permanece dentro da superficie que originou a
  operacao e preserva os dados preenchidos.
- `AlertDialog` confirma uma acao destrutiva antes do envio; ele nao apresenta o
  resultado da requisicao.
- `Alert` comunica um problema persistente da secao ou um resumo de lote que nao
  pode ser deduzido olhando apenas o item atual.
- `Toast` fica reservado para eventos concluidos em segundo plano que exigem
  atencao depois que a pessoa deixou a superficie de origem.
- Falhas de autenticacao, conexao ou indisponibilidade geral usam tratamento
  global.

## Consistencia eventual

Uma operacao `accepted` atualiza o estado local e e reconciliada em segundo
plano. A interface nao apresenta essa espera como erro. Se a confirmacao demorar,
o item passa a indicar sincronizacao. Se a fonte remota encerrar a reconciliacao
sem confirmar a mudanca, o OnFrame restaura o estado remoto e apresenta o
problema no contexto ainda aberto ou por notificacao global quando esse contexto
ja tiver sido fechado.

## Acoes em massa

O resultado de uma acao em massa nao e evidente no item atual. Por isso, a
superficie de origem apresenta um resumo contextual com quantidades alteradas,
pendentes e nao alteradas. Um lote sem nenhuma alteracao preserva o formulario
para correcao; sucesso total ou parcial pode encerrar a edicao e manter o resumo
visivel na secao.

## Referencias

- [GitHub Primer - Notification messaging](https://primer.style/product/ui-patterns/notification-messaging/)
- [Linear - Real time sync and offline](https://linear.app/docs/get-the-app#real-time-sync-and-offline)
- [Atlassian Design System - Designing messages](https://atlassian.design/foundations/content/designing-messages/)
