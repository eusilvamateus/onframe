# Identidade e sessões

## Responsabilidades

| Informação | Fonte canônica |
| --- | --- |
| UUID da identidade, senha, e-mail confirmado, fatores MFA e recuperação | Supabase Auth |
| Nome e avatar do perfil de aplicação | D1 / API do Worker |
| Workspace, membros, atribuições, convites e contas Mercado Livre | D1 / API do Worker |
| Tokens Mercado Livre | D1, cifrados pelo Worker |
| Sessão operacional da extensão | D1, vinculada à identidade e sessão do Supabase |
| Eventos de autenticação e destinatários dos e-mails | Supabase Auth |
| Entrega dos e-mails de autenticação | Worker / Resend, por hook assinado |

O Worker não verifica nem armazena senhas. O cliente envia credenciais apenas
ao Supabase e entrega ao Worker um bearer temporário validado no servidor.
O bearer não é persistido pela extensão. O nome salvo no perfil do D1 é
preservado entre logins; os metadados do Supabase inicializam apenas novos perfis.

## Vínculo da sessão

`getUser` valida o bearer no Supabase antes de o Worker extrair `session_id`.
A RPC `onframe_identity_state`, executável somente por `service_role`, consulta
a identidade confirmada e a existência da sessão em `auth.sessions`.
O Worker grava apenas esse identificador, a versão da identidade e o hash do
token opaco da extensão. Workspaces e permissões são verificados no D1.

Em cada requisição autenticada, a RPC confirma que a identidade está ativa,
que a sessão do Supabase ainda existe e que ela foi criada depois da última
mudança de segurança. A versão da sessão no D1 deve coincidir com a versão
canônica. Tokens JWT anteriores não conseguem criar uma nova sessão operacional.
Trocar de workspace preserva esse vínculo e não renova a prova de identidade.

O vínculo usa exclusivamente `auth.users.id`. Um e-mail coincidente com uma
projeção de outra identidade gera `identity_conflict`; a administração deve
reconciliar o cadastro usando os UUIDs, sem transferir acesso automaticamente.

## Mudanças críticas

Triggers transacionais no Supabase incrementam a versão quando ocorre:

- troca efetiva de e-mail ou senha, inclusive recuperação e alteração administrativa;
- alteração de bloqueio, exclusão lógica ou confirmação do e-mail;
- remoção ou desativação de um fator MFA confirmado.

Uma solicitação de troca de e-mail ainda pendente não muda a identidade nem
revoga as sessões. `double_confirm_changes` exige confirmação no endereço
atual e no novo. Notificações de senha, e-mail e MFA continuam sendo enviadas
pelo hook de e-mail já configurado.

A verificação no Worker atualiza a projeção do e-mail, marca todas as sessões
com versão anterior como revogadas, expira fluxos de login obsoletos e registra
`identity_security_changed` uma vez por versão observada. O registro contém
versão e motivo, sem senha, hash de senha, OTP ou endereço de e-mail.
`POST /v1/identity/synchronize` antecipa essa atualização após um callback;
esse endpoint não cria sessão nem aceita campos para modificar a identidade.

A invalidação é garantida na próxima requisição, antes de autorizar a operação.
Requisições já autorizadas e em execução não são canceladas. O registro de
auditoria no D1 ocorre quando o estado é consultado, não na hora do commit
remoto; várias mudanças entre consultas aparecem como a última versão observada.

Após troca de senha ou confirmação de e-mail, é necessário entrar novamente.
A extensão descarta seu acesso local depois de salvar a nova senha, mesmo
se a sincronização estiver indisponível, e informa que a alteração foi salva.
A recuperação não transforma o token usado para redefinir a senha em uma nova
sessão da extensão. O logout no Supabase também invalida as sessões operacionais
vinculadas à sessão removida do provedor.

## Disponibilidade e limites

A consulta canônica adiciona uma chamada ao Supabase por requisição autenticada,
com timeout de cinco segundos. Essa escolha privilegia revogação imediata no
próximo acesso. Não há cache que possa autorizar uma versão antiga.
Uma falha de rede, RPC ausente ou resposta inválida retorna `503`; não apaga
uma sessão saudável nem permite executar a operação sem verificação.
Uma identidade excluída, bloqueada ou com sessão inválida retorna `401`.

Essas garantias não substituem a exigência de um segundo fator para mudar
credenciais. A tela de alteração de senha ainda revalida a senha atual no
Supabase. A exigência de MFA/OTP para toda alteração de senha precisa de um
fluxo próprio e de enforcement no provedor; esta divisão de responsabilidades
não deve ser anunciada como proteção contra alguém que já conhece a senha.

## Schema legado e armazenamento

As tabelas públicas de perfil, workspaces, membros, convites e contas nas
migrações antigas do Supabase são legado. A migração de identidade revoga o
acesso dos clientes e encerra a cópia automática de `auth.users` para
`public.profiles`, preservando os dados para exportação e auditoria.
As migrações históricas permanecem versionadas para reprodução dos ambientes.
Nenhuma tabela é excluída sem inventário e backup.

Os avatares continuam no Supabase Storage. Migrá-los para R2 pode concentrar
os arquivos de aplicação na Cloudflare, mas não elimina a chave do servidor
necessária à consulta de identidade. A migração exige copiar objetos, validar
integridade e substituir URLs no D1 preservando compatibilidade. Não há ganho
de segurança suficiente para trocar o armazenamento nesta correção.

## Referências

- [Estrutura do projeto](estrutura-do-projeto.md)
- [Publicação da identidade](../operations/publicacao-identidade.md)
- [Sessões do Supabase](https://supabase.com/docs/guides/auth/sessions)
- [Arquitetura do Supabase Auth](https://supabase.com/docs/guides/auth/architecture)
