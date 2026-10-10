# Workspaces e acessos

## Finalidade

O workspace concentra as contas Mercado Livre, pessoas e o historico de
atividade do OnFrame. Uma pessoa pode participar de mais de um workspace e
alterna o contexto ativo pelo seletor do painel.

## Papeis

- `Administrador`: conecta e remove contas Mercado Livre, gerencia pessoas,
  convites e o nome do workspace.
- `Colaborador`: acessa somente as contas explicitamente atribuidas. Pode
  entrar em um workspace sem atribuicoes e visualiza o estado vazio de contas.

O criador do workspace existe somente para auditoria. Ele nao constitui um
papel adicional nem retém privilégios fora da associacao `Administrador`.

## Convites

Convites podem ser enviados para um e-mail ou criados como link
compartilhável. Cada convite tem um único uso, expira em sete dias e pode ser
revogado por um administrador antes da aceitação. O convite determina o papel
e, para colaboradores, as contas atribuídas inicialmente.

O link de convite nao contém token de sessao. Ele abre a pagina hospedada do
OnFrame, que encaminha para as opcoes da extensao. A extensao exige login ou
cadastro e aceita o convite usando sua sessao remota revogavel.

## Perfil

Cada pessoa pode atualizar nome, imagem de perfil, senha e e-mail. Avatares
aceitam PNG, JPEG e WebP ate 2 MB. O arquivo fica no bucket publico
`onframe-avatars`; a gravacao ocorre exclusivamente pelo Worker com a chave
de servico do Supabase.

## Painel do workspace

As opções da extensão organizam o painel em três destinos principais:

- `Início` apresenta o contexto do workspace, as contas Mercado Livre
  disponíveis, pendências reais de convite e a atividade recente. Sem contas,
  mostra a próxima ação compatível com o papel da pessoa.
- `Integrações` concentra as contas Mercado Livre conectadas ou atribuídas.
  Administradores podem conectar, habilitar, desativar e remover contas.
- `Configurações` agrupa a conta pessoal, o workspace e o aplicativo. A aba
  `Conta` contém perfil, credenciais e sessões; `Workspace` é exclusiva de
  administradores e reúne nome, pessoas, permissões e convites; `Aplicativo`
  concentra a atualização da extensão.
