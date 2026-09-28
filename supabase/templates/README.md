# Templates de e-mail do OnFrame

Os arquivos deste diretório são publicados para o Supabase Auth pelo `supabase config push`. Eles são gerados por `npm run auth:templates:build`; valide a versão rastreada com `npm run auth:templates:check`.

O gerador traduz os componentes reais do `@onblide/ui` 1.1.1 para HTML transacional: `Card`, `Badge`, `Alert`, `Button`, `FieldShell`, `Stepper` e `CodeInput`. As regras e os valores literais vêm dos tokens oficiais; o logo é a variante PNG pública do design system, própria para clientes de e-mail.

Os clientes de e-mail não carregam o pacote, fontes locais ou variáveis CSS de forma confiável. Por isso os templates usam CSS inline, `Poppins, Arial, sans-serif` e `JetBrains Mono, Courier New, monospace`. Não substitua `{{ .ConfirmationURL }}`, `{{ .Token }}` ou as demais variáveis do Supabase. Quando a superfície web de autenticação estiver publicada, os fluxos com link devem migrar para uma rota própria baseada em `{{ .TokenHash }}`.
