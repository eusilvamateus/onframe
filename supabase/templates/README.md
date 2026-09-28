# Templates de e-mail do OnFrame

Os arquivos deste diretório são publicados para o Supabase Auth pelo `supabase config push`. Eles são gerados por `npm run auth:templates:build`; valide a versão rastreada com `npm run auth:templates:check`.

Eles são somente a contingência textual mínima do Supabase: título, instrução,
token ou link. Não carregam identidade visual, componentes ou layout.

Em produção, o `Send Email Hook` do Supabase encaminha a entrega para o Worker
em `cloudflare/src/auth-email.ts`, que verifica a assinatura Standard Webhooks,
renderiza o e-mail no design transacional da Onblide e o envia pelo Resend.
O Worker é a única fonte da apresentação final. Não substitua
`{{ .ConfirmationURL }}`, `{{ .Token }}` ou as demais variáveis do Supabase.
