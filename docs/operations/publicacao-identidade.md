# Publicação da identidade

## Pré-requisitos

O código depende da RPC `onframe_identity_state` no Supabase e da migração
`0008_identity_sessions.sql` no D1. A chave `SUPABASE_SERVICE_ROLE_KEY` já
utilizada para os avatares passa a consultar essa RPC; nenhum segredo novo
é necessário. A RPC deve ser acessível pela Data API e executável apenas
por `service_role`.

O repositório preparado não publica automaticamente o Worker nem migra bancos
remotos. Testes usam PostgreSQL em memória (PGlite) e D1 local (Miniflare).

## Procedimento

1. Exportar o D1 e as tabelas públicas legadas do Supabase antes da ativação.
   Confirmar que nenhum consumidor externo depende do schema legado.
2. Aplicar a migração Supabase `20261011120000_identity_authority.sql`.
   Ela preserva os dados legados, retira o acesso dos clientes e instala
   os triggers e a RPC. As migrações históricas não devem ser reaplicadas.
3. Publicar a configuração de autenticação versionada em `supabase/config.toml`,
   preservando os secrets injetados no ambiente. Confirmação de cadastro e
   dupla confirmação de e-mail devem estar ativas.
4. Aplicar `0008_identity_sessions.sql` no D1 e publicar o Worker preparado
   na mesma janela de manutenção. Essa migração revoga as sessões existentes,
   que não possuem vínculo verificável com o Supabase, e expira fluxos pendentes.
5. Distribuir o build atualizado da extensão para os callbacks e mensagens
   acompanharem a exigência de novo login após alterações de segurança.

O Worker anterior pode criar sessões sem vínculo entre os passos 4 e sua
publicação. O Worker preparado as recusa. Planeje a janela de manutenção
considerando que todos os usuários precisarão entrar novamente.

## Validação

Execute `npm run test:all` na raiz e `npm run check` em `cloudflare/` antes
de publicar. Depois da ativação, valide com uma conta de teste:

- novo login e operações autorizadas no workspace;
- nome de perfil preservado após logout e login;
- confirmação de e-mail nos dois endereços e atualização da projeção no D1;
- sessões anteriores recusadas após senha alterada ou fator MFA removido;
- recuperação de senha concluída seguida de novo login;
- RPC e tabelas legadas inacessíveis às chaves públicas e usuários comuns.

## Recuperação

Falhas de RPC retornam `identity_security_unavailable` e bloqueiam operações
com `503`. Verifique sua existência, os grants, a Data API e a chave do Worker.
Não restaure um fallback que aceite apenas a sessão D1.
Uma sessão revogada não deve ser reativada em um rollback: mantenha os bancos,
preserve os backups e solicite novo login após restabelecer a verificação.
