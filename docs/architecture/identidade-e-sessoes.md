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
- ativação, remoção ou desativação de um fator MFA confirmado.

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

## Segurança e login

Opções e popup compartilham o mesmo login faseado. Primeiro recebem o e-mail;
no acesso por senha, essa etapa apenas valida o formato localmente, sem
consultar a existência da conta. Depois apresentam a senha e o Turnstile.
Cadastro e recuperação são acessados por links, não por tabs de cadastro.
Dividir o formulário em etapas organiza a interação; não constitui, por si
só, uma proteção adicional de autenticação.

O acesso sem senha usa OTP nativo de seis dígitos: `otp` com `create_user: false`
e posterior `verify` de tipo `email`. O hook reconhece a URL exata
`connect?verification=login` e entrega o código, sem link que o consuma.
A configuração pública anuncia `emailOtpLength: 6`, alinhada a `otp_length`
do Supabase; TOTP continua com seis dígitos. A interface usa `CodeInput`,
aguarda 60 segundos para reenvio e exige um novo
Turnstile para cada envio. Senhas e códigos nunca passam pelo background.
A sessão nativa fica em memória até a troca pelo acesso opaco do Worker.

Senha e e-mail têm páginas próprias. A interface exige um OTP do e-mail atual
antes de liberar os campos; se houver TOTP confirmado, também exige seu código.
O OTP cria uma sessão temporária somente em memória. O hook diferencia esse
e-mail do magic link pela URL exata `connect?verification=email`, apresentando
o código sem um link que possa consumi-lo acidentalmente. Essa URL precisa
estar permitida nos redirecionamentos do Supabase.

**Limitação de segurança ainda aberta:** a etapa de e-mail obrigatória é
aplicada pela interface, não por um bloqueio universal da API pública do Auth.
`secure_password_change` dispensa o nonce quando a sessão tem menos de 24 horas.
Quem conhece a senha ainda pode tentar a alteração diretamente no Supabase.
Não anunciar esse fluxo como proteção completa contra essa ameaça nem publicar
como concluída a exigência de e-mail em toda alteração de senha. Falta um
mecanismo validado no provedor que bloqueie também essa chamada direta, sem
implementar um segundo armazenamento/verificador de senhas no Worker.

O 2FA usa TOTP nativo. A ativação só acontece após validar um código do novo
autenticador; cancelamento remove o fator não confirmado. A remoção solicita
o código do fator a remover. Ativação e remoção invalidam os acessos existentes.
O login por senha, código, link e chave de acesso passa pelo desafio TOTP quando existe
um fator confirmado. O Worker verifica o `aal` do JWT validado antes de criar
acesso, e a RPC exige `aal2` na sessão canônica; esconder a tela não remove
essa exigência.

Chaves de acesso usam a API experimental do Supabase e o WebAuthn do navegador,
no RP `onframe.onblide.com`. Cadastro, nomes e remoção são oferecidos em uma
aba HTTPS do Worker, construída com o mesmo pacote do design system. A sessão
temporária verificada é transferida no fragmento, nunca na query ou nos logs,
e retirada do histórico assim que o script inicia. Tokens não ficam em
localStorage. Esse fragmento é sensível e não deve ser copiado ou compartilhado.
O login por chave reutiliza o fluxo de uso único da extensão. Sua entrada está
oculta no formulário de login enquanto esse fluxo aguarda revisão; o
gerenciamento das chaves existentes continua disponível.

`GET /v1/security` lista sessões canônicas, fatores e nomes de chaves, sem
segredos, IPs ou materiais criptográficos. Browser e sistema são derivados do
user-agent com Bowser; não há inferência de modelo de computador ou localização.
A última atividade combina os horários do provedor com o último acesso da
extensão no D1. `DELETE /v1/security/sessions/:id` e a operação sem ID encerram,
respectivamente, uma sessão do titular e todas as sessões, inclusive a atual.
O provedor é revogado primeiro; depois são marcadas suas cópias no D1. A RPC
de revogação é exclusiva de `service_role` e restringe a operação ao UUID
obtido da sessão autenticada, nunca a um usuário informado pelo cliente.

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
