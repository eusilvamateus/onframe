# Privacidade na Chrome Web Store

Este roteiro acompanha o pacote da extensão. A política pública é servida em
`https://onframe.onblide.com/privacidade` pelo Worker. Os campos da loja devem ser
reconferidos a cada alteração de permissões ou de tratamento de dados.

## Finalidade única

> Gerenciar anúncios e produtos do Mercado Livre a partir das páginas dos
> anúncios, usando contas e workspaces autorizados pelo usuário.

## Permissões

| Declaração | Justificativa para o painel |
| --- | --- |
| `storage` | Guarda a sessão revogável do onframe e preferências locais, como tema e visibilidade dos recursos. |
| `https://onframe.onblide.com/*` | Permite à extensão acessar a API do onframe, autenticar o usuário e abrir páginas hospedadas de segurança. |
| `https://ignrkxityihpvreaimxe.supabase.co/*` | Permite os fluxos de autenticação e segurança da conta no provedor de identidade. |
| Script de conteúdo em `https://*.mercadolivre.com.br/*` | Identifica o anúncio aberto no Mercado Livre e exibe ali as ferramentas de gestão. O acesso é limitado a esse domínio. |

O manifesto não pede `activeTab`, `tabs`, `scripting` nem acesso de host ao Mercado
Livre além da correspondência do script de conteúdo. A extensão não chama a API do
Mercado Livre diretamente; as operações autenticadas passam pelo Worker.

## Dados a declarar

Marque no formulário as categorias correspondentes às opções que a loja apresentar:

- Identificação pessoal: nome, e-mail, identificadores de conta, foto de perfil.
- Autenticação: senha informada ao provedor de identidade, fatores de segurança e
  sessão revogável da extensão. Não declarar que o onframe guarda a senha em texto.
- Dados financeiros ou comerciais: preços, custos, impostos, margens e resultados
  de promoções. Não confundir com dados de cartão ou pagamento, que não são pedidos.
- Conteúdo de sites e conteúdo criado pelo usuário: dados do anúncio aberto,
  descrições, características e fotos editadas ou enviadas.
- Atividade de navegação, caso a categoria cubra a URL do anúncio atual: a extensão
  lê a página do Mercado Livre para identificar o produto; não lê o histórico geral
  do navegador nem acompanha outros sites.

Não afirmar que a extensão não trata dados apenas porque parte deles é processada
localmente. Não marcar localização ou saúde sem uma funcionalidade que realmente
trate esses dados. Confirme a redação das opções exibidas no painel antes de enviar.

## Código remoto e uso limitado

O pacote Manifest V3 inclui seus scripts executáveis. O fluxo de verificação
Turnstile roda numa página HTTPS hospedada fora do contexto da extensão; não é
um script remoto carregado para execução dentro da extensão. Confira o ZIP final
antes de responder à pergunta sobre código remoto no painel.

Certifique somente as práticas efetivas: os dados são usados para as funções
descritas, não são vendidos nem usados para publicidade personalizada e o acesso
humano fica restrito às hipóteses permitidas. A declaração de Uso Limitado consta
na política pública.

## Conferência antes do envio

1. Confirmar que `eu.silvamateus80@gmail.com` recebe solicitações de privacidade.
2. Publicar o Worker e conferir que `GET /privacidade` responde com a política
   atual, sem exigir login.
3. Preencher a aba **Práticas de privacidade** com as justificativas e categorias
   acima. Informar `https://onframe.onblide.com/privacidade` como URL da política.
4. Conferir que a ficha da loja, a política e o comportamento da versão enviada
   descrevem os mesmos dados e a mesma finalidade.

Fontes da loja: [campos de privacidade](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy),
[política de dados do usuário](https://developer.chrome.com/docs/webstore/program-policies/policies),
[FAQ de dados do usuário](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
