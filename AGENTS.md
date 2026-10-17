# Diretrizes do Repositório

## Memória Persistente do Agente

Trate este arquivo como memória operacional persistente. Registre aqui apenas
instruções explícitas e permanentes sobre o comportamento do agente, fluxo de
trabalho, restrições ou correções operacionais. Não registre requisitos de produto,
referências visuais ou discussões em andamento, salvo se o usuário pedir
explicitamente que elas se tornem diretrizes permanentes. Mantenha os registros curtos
e acionáveis. Este arquivo deve permanecer na raiz do repositório e ser versionado.
Faça commit e push de suas atualizações seguindo o fluxo de trabalho do projeto.
Escreva todas as diretrizes textuais deste arquivo em português.

Sempre que o usuário declarar uma nova regra permanente de trabalho ou corrigir,
substituir ou ampliar uma regra anterior, atualize este arquivo na mesma tarefa,
sem exigir que ele peça o registro separadamente. Antes de adicionar uma diretriz,
verifique se o assunto já está documentado; nesse caso, atualize a regra existente
em vez de criar versões duplicadas ou conflitantes.

## Contexto do Projeto

Antes de alterar fronteiras, responsabilidades ou contratos entre componentes,
leia [a arquitetura do projeto](docs/architecture/estrutura-do-projeto.md).
Use [o indice da documentacao](docs/README.md) para localizar regras de produto,
guias de usuario e procedimentos de manutencao sem duplicar esse conhecimento
neste arquivo.

Antes de alterar autenticacao, contas conectadas, tokens ou chamadas ao Mercado
Livre, leia [a integracao Mercado Livre](docs/integrations/mercado-livre.md).
Antes de alterar o Worker ou os scripts de bootstrap, leia
[a arquitetura do projeto](docs/architecture/estrutura-do-projeto.md).

## Limites de Escopo

O agente só tem permissão para alterar arquivos dentro deste repositório. Não
altere nenhum outro projeto ou diretório, inclusive o design system, sem ordem ou
autorização explícita do usuário para aquele local. Referenciar, consultar ou usar
uma dependência externa não concede permissão para modificá-la.

## Comandos de Build, Teste e Desenvolvimento

Execute os comandos na raiz do repositório com Node.js 20 ou superior:

- `npm test`: executa o executor de testes do Node.js.
- `npm run build:extension-ui`: compila popup e opções React, incluindo os
  ativos locais do pacote `@onblide/ui`.
- `npm run test:all`: compila as interfaces e executa toda a suíte nomeada
  antes da entrega.
- `npm run release:check`: valida versão, dependências, testes e pacote de lançamento.

## Estilo de Código e Convenções de Nomenclatura

Use CommonJS, indentação de dois espaços, ponto e vírgula e aspas simples. Use
`camelCase` para funções e variáveis locais, `UPPER_SNAKE_CASE` para constantes
e nomes descritivos em português para os testes. Mantenha comportamento de DOM
nos módulos da extensão, transformações reutilizáveis de estado nos modelos e
integrações de API/Mercado Livre no Worker.

## Design System Obrigatório

Use exclusivamente o design system vigente em
`C:\Users\Mateus\onblide-design-system` para toda decisão visual e de interação
do OnFrame: componentes, variantes, tokens, tipografia, ícones, tamanhos,
espaçamentos, estados e acessibilidade. Não crie, simule, combine ou customize
variações visuais fora das especificações documentadas. Quando a necessidade não
tiver componente, variante ou regra documentada, interrompa a implementação e
informe a lacuna ao usuário; não improvise uma solução visual.

## Feedback na Interface

Escolha o canal de feedback pelo contexto, não apenas pelo tom: mudanças já
visíveis no próprio controle não precisam de mensagem adicional; confirmações
breves sem próximo passo usam `Toast`; erros, avisos e instruções que precisam
permanecer legíveis usam `Alert` junto ao contexto afetado; erros de campo
ficam no próprio campo. Não use toast temporário para uma falha que exige
correção, nem alert de página para confirmar um switch que já mudou de estado.

## Diretrizes de Teste

Inclua ou atualize testes comportamentais junto ao domínio afetado. Cubra erros
e mudanças visíveis ao usuário, não apenas utilitários. Execute o teste focado no
desenvolvimento e depois `npm run test:all`. Alterações de UI devem manter as
asserções de layout e interação atualizadas.

## Git e releases

Antes de executar qualquer operação Git ou preparar uma release, use e siga a
skill `fluxo-git-releases`. Ela é a única fonte de verdade para branches,
commits, integração, histórico, SemVer e publicação. Não mantenha uma cópia
desse workflow no repositório.

## Segurança e Integrações

Não versione tokens ou credenciais. Quando o usuário indicar um conector, MCP, documentação ou outro
recurso oficial e confiável de um provedor, use exclusivamente essa fonte para
pesquisa e decisões sobre o respectivo provedor. Se ela não estiver disponível,
informe expressamente o bloqueio e não use busca externa sem autorização
explícita do usuário. Use o conector `$mercado-livre` para informações do
Mercado Livre.

## Controle do Navegador e do Computador

Não assuma o controle do navegador ou do computador para validação visual, teste
de uso, conferência de layout, inspeção de implementação ou tarefas ordinárias de
QA. Essas verificações são responsabilidade do usuário.

Quando esse controle puder melhorar materialmente a solução, simplificar a
implementação ou for requisito para resolver a tarefa, solicite autorização
explícita antes de qualquer acesso. Explique exatamente o que será acessado, qual
hipótese ou requisito será verificado e por que o controle é necessário. Só
prossiga depois da resposta afirmativa do usuário. A autorização vale apenas para
o acesso e o escopo descritos; um novo uso exige nova autorização.
