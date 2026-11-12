# Workspaces e acessos

## Finalidade

O workspace concentra as contas Mercado Livre, pessoas e o historico de
atividade do OnFrame. Uma pessoa pode participar de mais de um workspace e
alterna o contexto ativo pelo seletor do painel.

## Perfis de usuarios

O workspace oferece os perfis padrao `Administrador` e `Colaborador`. O primeiro
gerencia contas, pessoas, convites e configuracoes; o segundo conserva o acesso
operacional anterior. Esses perfis sao fixos. Administradores podem criar,
renomear, editar e excluir perfis personalizados, desde que nao estejam
atribuidos a pessoas ou convites pendentes.

Cada perfil personalizado define permissoes de leitura, edicao e, quando a
operacao existe, exclusao para contas Mercado Livre, anuncios, promocoes,
produtos, historico e configuracoes. Edicao e exclusao exigem leitura do mesmo
recurso. Anuncios e promocoes tambem exigem leitura de contas. As permissoes
sao verificadas pelo Worker a cada requisicao, a partir dos dados do D1.

Uma pessoa nao administradora acessa somente as contas explicitamente
atribuidas, independentemente do perfil. Pode entrar em um workspace sem
atribuicoes e visualiza o estado vazio de contas.

O criador do workspace existe somente para auditoria. Ele nao constitui um
papel adicional nem retém privilégios fora da associacao `Administrador`.

## Convites

Convites podem ser enviados para um e-mail ou criados como link
compartilhável. Cada convite tem um único uso, expira em sete dias e pode ser
revogado por um administrador antes da aceitação. O convite determina o perfil
e, para pessoas nao administradoras, as contas atribuídas inicialmente.

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
  Acoes de conexao, edicao e remocao dependem das permissoes do perfil.
- `Configurações` agrupa a conta pessoal, o workspace e o aplicativo. A aba
  `Conta` contém perfil, credenciais e sessões; `Workspace` apresenta
  configuracoes a quem tem leitura e reserva pessoas, perfis e convites aos
  administradores; `Aplicativo` concentra a atualização da extensão.

O início do popup resume essas mesmas áreas com dados do workspace: pessoas e
convites pendentes, contas disponíveis e desativadas e alterações confirmadas
nas últimas 24 horas. As contagens de contas e histórico respeitam as
atribuições da pessoa no workspace.
