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

## Contexto do Projeto

Antes de alterar fronteiras, responsabilidades ou contratos entre componentes,
leia [a arquitetura do projeto](docs/architecture/estrutura-do-projeto.md).
Use [o indice da documentacao](docs/README.md) para localizar regras de produto,
guias de usuario e procedimentos de manutencao sem duplicar esse conhecimento
neste arquivo.

Antes de alterar autenticacao, contas conectadas, tokens ou chamadas ao Mercado
Livre, leia [a integracao Mercado Livre](docs/integrations/mercado-livre.md).
Antes de alterar o servico local ou os scripts de bootstrap, leia
[Servico local](docs/operations/servico-local.md).

## Comandos de Build, Teste e Desenvolvimento

Execute os comandos na raiz do repositório com Node.js 20 ou superior:

- `npm start`: inicia o serviço local.
- `npm test`: executa o executor de testes do Node.js.
- `npm run test:all`: executa toda a suíte nomeada antes da entrega.
- `npm run check`: executa o diagnóstico de instalação.
- `npm run release:check`: valida versão, dependências, testes e pacote de lançamento.

## Estilo de Código e Convenções de Nomenclatura

Use CommonJS, indentação de dois espaços, ponto e vírgula e aspas simples. Use
`camelCase` para funções e variáveis locais, `UPPER_SNAKE_CASE` para constantes
e nomes descritivos em português para os testes. Mantenha comportamento de DOM
nos módulos da extensão, transformações reutilizáveis de estado nos modelos e
integrações de API/Mercado Livre no serviço. Siga o sistema de design em
`C:\Users\Mateus\onblide-design-system`; não introduza tipografia, controles ou
retornos visuais ad hoc.

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

Não versione tokens ou credenciais; use `.env.example` como referência de
configuração. Use o conector `$mercado-livre` para informações do Mercado Livre.
Se ele não estiver disponível, informe isso expressamente antes de usar qualquer
fonte externa.

## Verificação no Navegador

Não use o navegador para validar aparência, layout, posição ou animações: essa
verificação é responsabilidade do usuário. Abra-o somente quando for necessário
confirmar a estrutura, os seletores ou o ciclo de vida do DOM real do Mercado
Livre. Antes de qualquer acesso, informe qual hipótese precisa ser verificada e
por que a inspeção do DOM é necessária.
