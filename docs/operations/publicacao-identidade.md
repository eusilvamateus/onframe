# Publicação da identidade

## Pré-requisitos

O código depende da RPC `onframe_identity_state` no Supabase e da migração
`0008_identity_sessions.sql` no D1. A chave `SUPABASE_SERVICE_ROLE_KEY` já
utilizada para os avatares passa a consultar essa RPC; nenhum segredo novo
é necessário. A RPC deve ser acessível pela Data API e executável apenas
por `service_role`.

O repositório preparado não publica automaticamente o Worker nem migra bancos
remotos. Testes usam PostgreSQL em memória (PGlite) e D1 local (Miniflare).

As novas telas também dependem da migração
`20261011191126_account_security.sql`. Ela amplia o controle de MFA e instala
as RPCs de consulta e encerramento de sessões. O deploy gera os assets HTTPS
das chaves de acesso com `npm run build:security-ui`; o Wrangler associa o
diretório gerado ao binding `ASSETS`. Não publique só a extensão sem as RPCs,
a configuração do provedor e esse build.

**A publicação não conclui toda a segurança:** ainda falta bloquear
a mudança direta de senha sem OTP na API pública do Supabase. Veja a limitação
em [Segurança e login](../architecture/identidade-e-sessoes.md#segurança-e-login).

O ambiente atual está em desenvolvimento e é usado somente pelo autor, sem
dados que exijam preservação. A instalação das estruturas abaixo não exige
um projeto de migração de usuários, conversão de dados legados ou um ambiente
de preview separado. Os arquivos SQL versionados continuam sendo a definição
reproduzível das tabelas e funções, independentemente desse estágio.

## Extensão local e compatibilidade

Carregar `extension/` sem empacotamento muda somente os arquivos no navegador.
O background e o cliente de autenticação continuam apontando para
`https://onframe.onblide.com`; isso não cria um backend de preview nem publica
o código da `dev`. Um preview isolado exige seu próprio ambiente remoto e
configuração explícita das origens, callbacks e dados; ele não existe apenas
porque a extensão foi carregada pelo diretório.

`GET /v1/auth/config` anuncia `capabilities.accountSecurity = 1` quando o
Worker suporta o contrato de segurança. A extensão verifica esse campo antes
de consultar `/v1/security`; servidores anteriores permanecem utilizáveis
para os fluxos que já oferecem. A presença do contrato não substitui as
migrações e a configuração do provedor: falhas dessas dependências continuam
sendo reportadas, sem inventar uma lista vazia ou um estado de MFA desativado.

Quando os dados de segurança não estão disponíveis, as ações da tela ficam
desabilitadas e os contadores mostram indisponibilidade. O login não oferece
chaves de acesso se o servidor não anunciar suporte. Após atualizar o código
local, recarregue a extensão e reabra opções/popup para não misturar o bundle
novo com um service worker antigo.

## Procedimento

1. Conferir quais estruturas já estão instaladas para não executar novamente
   comandos de criação de tabelas, colunas e triggers existentes.
2. Aplicar a migração Supabase `20261011120000_identity_authority.sql`.
   Ela preserva os dados legados, retira o acesso dos clientes e instala
   os triggers e a RPC. As migrações históricas não devem ser reaplicadas.
3. Publicar a configuração de autenticação versionada em `supabase/config.toml`,
   preservando os secrets injetados no ambiente. Confirmação de cadastro e
   dupla confirmação de e-mail devem estar ativas.
   Aplicar também a migração de segurança, habilitar TOTP e passkeys, definir
   o RP/origin HTTPS e permitir `https://onframe.onblide.com/connect?verification=email`.
   Verificar que a versão do CLI suporta os campos experimentais de passkeys
   antes do push da configuração; não ignorar campos desconhecidos.
   Não sobrescrever SMTP, o segredo do hook ou o segredo do Turnstile durante
   uma atualização parcial. Ao usar a Management API, enviar somente os campos
   necessários e conferir o estado salvo; o JSON dos templates deve ser UTF-8.
   A auditoria do projeto apontou proteção contra senhas vazadas desativada;
   habilitá-la quando disponível no plano, sem confundir essa proteção com OTP.
4. Aplicar `0008_identity_sessions.sql` no D1 e publicar o Worker preparado
   na mesma janela de manutenção. Essa migração revoga as sessões existentes,
   que não possuem vínculo verificável com o Supabase, e expira fluxos pendentes.
5. Distribuir o build atualizado da extensão para os callbacks e mensagens
   acompanharem a exigência de novo login após alterações de segurança.

O Worker anterior pode criar sessões sem vínculo entre os passos 4 e sua
publicação. O Worker preparado as recusa. Planeje a janela de manutenção
considerando que todos os usuários precisarão entrar novamente.

Quando a instalação usar o MCP, manter os registros das estruturas aplicadas
alinhados às versões dos arquivos SQL no repositório. A data gerada pelo MCP
não deve fazer o CLI interpretar a mesma estrutura como ainda pendente.

## Validação

Execute `npm run test:all` na raiz e `npm run check` em `cloudflare/` antes
de publicar. Depois da ativação, valide com uma conta de teste:

- novo login e operações autorizadas no workspace;
- nome de perfil preservado após logout e login;
- confirmação de e-mail nos dois endereços e atualização da projeção no D1;
- sessões anteriores recusadas após senha alterada ou fator MFA removido;
- recuperação de senha concluída seguida de novo login;
- RPC e tabelas legadas inacessíveis às chaves públicas e usuários comuns.
- OTP recebido com código, sem alterar o e-mail de login por magic link;
- ativação TOTP, login exigindo código e remoção com novo login;
- login por magic link e passkey com TOTP quando ativado;
- criação, renomeação e remoção de chave no domínio HTTPS com dispositivo real;
- sessão individual/global encerrada sem permitir recriar acesso pelo JWT anterior;
- tentativa direta de mudar senha com sessão recente, explicitamente tratada
  como teste pendente de segurança, não como sucesso dessa implementação.

## Recuperação

Falhas de RPC retornam `identity_security_unavailable` e bloqueiam operações
com `503`. Verifique sua existência, os grants, a Data API e a chave do Worker.
Não restaure um fallback que aceite apenas a sessão D1.
Uma sessão revogada não deve ser reativada em um rollback: mantenha os bancos,
preserve os backups e solicite novo login após restabelecer a verificação.
