# Workflow Git padrão para agentes

> Versão 1.0

Este documento define o padrão Git que deve ser seguido por qualquer agente que trabalhe neste projeto.

Ele é a fonte única de verdade para:

- branches;
- commits;
- integração;
- histórico;
- Conventional Commits;
- Semantic Versioning;
- GitHub Actions;
- releases;
- reversões;
- operações permitidas e proibidas.

O objetivo principal é manter um fluxo adequado a projetos mantidos majoritariamente por uma única pessoa com auxílio de agentes, priorizando:

- histórico estritamente linear;
- baixa poluição visual;
- commits semanticamente úteis;
- liberdade durante o desenvolvimento;
- `main` limpa e confiável;
- reversões seguras;
- versionamento previsível;
- automação sem burocracia desnecessária.

As regras deste documento têm precedência sobre preferências individuais de qualquer agente.

---

# 1. Filosofia

A regra central é:

```text
o desenvolvimento pode ser bagunçado;
o histórico oficial não pode ser.
```

O Git deve registrar a evolução útil do produto, e não cada tentativa necessária para chegar até ela.

Portanto:

```text
dev
→ área mutável de desenvolvimento

main
→ histórico oficial, linear e imutável

GitHub Releases
→ comunicação das versões publicadas
```

---

# 2. Branches permanentes

Existem somente duas branches permanentes por padrão:

```text
main
dev
```

## `main`

Representa:

- estado oficial;
- histórico publicado;
- código considerado integrado;
- origem do versionamento;
- base para releases.

Seu histórico é imutável.

## `dev`

Representa:

- desenvolvimento corrente;
- experimentação;
- commits intermediários;
- organização antes da publicação.

Seu histórico é mutável.

Não criar permanentemente branches como:

```text
develop
development
staging
integration
release
production
```

salvo necessidade específica documentada pelo projeto.

---

# 3. Fluxo padrão

Quando houver apenas um fluxo ativo de desenvolvimento:

```text
main
  │
  ▼
 dev
  │
  ├─ desenvolvimento
  ├─ commits
  ├─ amend
  ├─ fixup
  ├─ rebase
  └─ validação
  │
  ▼
squash
  │
  ▼
main
```

Depois da integração:

```text
dev = main
```

O próximo ciclo começa novamente a partir desse estado.

---

# 4. Regra de exclusividade da `dev`

A branch `dev` pode ser livremente reescrita apenas quando existir **um único fluxo ativo de trabalho sobre ela**.

Isso inclui:

```text
git commit --amend
git rebase
git reset
git push --force-with-lease
```

Antes de qualquer operação que reescreva `dev`, o agente deve garantir que nenhum outro agente possui trabalho ativo dependendo do histórico atual dessa branch.

Se não houver essa garantia, `dev` não deve ser reescrita.

---

# 5. Concorrência entre agentes

Quando dois ou mais agentes precisarem trabalhar simultaneamente em alterações independentes, não devem compartilhar uma `dev` mutável.

Nesse caso, utilizar branches temporárias:

```text
work/<descricao-curta>
```

Exemplos:

```text
work/marketplace-discounts
work/order-validation
work/pricing-refactor
```

Cada branch temporária deve nascer da versão mais recente de:

```text
origin/main
```

Exemplo:

```bash
git fetch origin
git switch -c work/marketplace-discounts origin/main
```

O fluxo passa a ser:

```text
             ┌── work/tarefa-a
main ────────┤
             └── work/tarefa-b
```

Cada trabalho é validado e integrado independentemente.

Depois da integração, a branch temporária deve ser removida.

Branches `work/*` não são permanentes.

---

# 6. Quando usar `dev` ou `work/*`

Usar:

```text
dev
```

quando:

- houver apenas um fluxo ativo;
- o trabalho for sequencial;
- nenhum outro agente depender da branch;
- não houver necessidade de isolamento.

Usar:

```text
work/*
```

quando:

- houver agentes trabalhando simultaneamente;
- existir mais de uma alteração independente em andamento;
- uma mudança for experimental;
- for necessário preservar o estado atual de `dev`;
- houver risco de conflito entre trabalhos.

Não criar branches temporárias sem motivo.

---

# 7. Uma unidade lógica por integração

Cada entrada criada em `main` deve representar uma única unidade lógica de mudança.

Por exemplo:

```text
feat: adiciona descontos progressivos
```

ou:

```text
fix: corrige cálculo da comissão
```

Evitar publicar como um único commit:

```text
feat: adiciona descontos, corrige frete e atualiza dependências
```

Alterações independentes devem gerar commits independentes em `main`.

---

# 8. Não acumular entregas independentes em `dev`

`dev` pode possuir vários commits relacionados à mesma entrega.

Exemplo:

```text
feat: implementa descontos
test: adiciona testes de descontos
fix: corrige validação dos descontos
```

Isso é aceitável enquanto todos fizerem parte da mesma unidade que será consolidada.

Por padrão, não iniciar uma nova entrega independente antes de integrar ou isolar a entrega atual.

Se `dev` já possuir múltiplas unidades independentes, o agente deve separá-las antes da integração.

Pode utilizar:

- rebase interativo;
- cherry-pick;
- branches temporárias;
- reset apropriado;
- outra operação Git segura que preserve cada unidade.

Nunca executar:

```bash
git merge --squash dev
```

se isso misturar alterações independentes que deveriam aparecer separadamente em `main`.

---

# 9. Conventional Commits

Todos os commits definitivos de `main` devem seguir Conventional Commits.

Formato:

```text
<tipo>(<escopo opcional>): <descrição>
```

Exemplos:

```text
feat: adiciona cálculo de comissão

fix: corrige arredondamento do frete

feat(pricing): adiciona descontos progressivos

refactor(api): reorganiza tratamento de erros

docs: documenta configuração inicial
```

---

# 10. Tipos permitidos

O conjunto padrão é:

```text
feat
fix
refactor
perf
docs
test
build
ci
chore
style
revert
```

## `feat`

Nova funcionalidade ou capacidade observável.

```text
feat: adiciona filtro por marketplace
```

## `fix`

Correção de comportamento incorreto.

```text
fix: corrige cálculo da comissão
```

## `refactor`

Alteração estrutural sem mudança intencional de comportamento.

```text
refactor: separa cálculo de preço em serviço próprio
```

## `perf`

Melhoria de desempenho.

```text
perf: reduz consultas durante sincronização
```

## `docs`

Alteração exclusivamente documental.

```text
docs: documenta variáveis de ambiente
```

## `test`

Alteração exclusivamente relacionada a testes.

```text
test: adiciona cobertura para cálculo de descontos
```

## `build`

Alterações no processo de build ou dependências diretamente relacionadas.

```text
build: atualiza configuração do vite
```

## `ci`

Alterações em CI/CD ou GitHub Actions.

```text
ci: adiciona workflow de release
```

## `chore`

Manutenção sem mudança funcional relevante.

```text
chore: atualiza dependências de desenvolvimento
```

## `style`

Formatação sem mudança de comportamento.

```text
style: aplica formatação do prettier
```

Não utilizar `style` para mudanças visuais da aplicação.

Uma mudança visual pode ser `feat` ou `fix`.

## `revert`

Reversão intencional de uma mudança publicada.

```text
revert: desfaz nova estratégia de cache
```

---

# 11. Escopos

Scopes são opcionais.

Usar somente quando melhorarem a compreensão.

Exemplos:

```text
feat(auth): adiciona magic link

fix(pricing): corrige comissão

refactor(api): reorganiza erros
```

Não transformar diretórios em scopes obrigatórios.

Evitar:

```text
feat(src-components-pricing-utils): ...
```

O objetivo é clareza, não ornamentação.

---

# 12. Idioma

O projeto deve utilizar um único idioma para mensagens de commit.

Por padrão:

```text
Português
```

Se um projeto definir explicitamente inglês como idioma oficial, todos os agentes devem respeitar essa decisão.

Não misturar idiomas no mesmo histórico.

Exemplo indesejado:

```text
feat: adiciona descontos
fix: update discount validation
refactor: reorganiza serviço
```

---

# 13. Descrições

A descrição deve:

- ser curta;
- explicar diretamente o que mudou;
- começar preferencialmente com verbo;
- não terminar com ponto;
- evitar termos genéricos;
- permanecer compreensível fora do contexto imediato.

Preferir:

```text
fix: corrige arredondamento do frete
```

Evitar:

```text
fix: ajustes
fix: correções
fix: changes
fix: small fix
fix: fix again
chore: update
chore: stuff
```

---

# 14. Metadados e atribuições

Não adicionar automaticamente às mensagens de commit:

```text
Co-authored-by
Generated-by
Created-by
AI-generated
Claude
Codex
Copilot
ChatGPT
```

ou qualquer outra atribuição ao agente ou ferramenta.

Esses metadados só devem ser adicionados quando explicitamente solicitados.

O histórico deve comunicar a mudança realizada, não qual ferramenta a produziu.

---

# 15. Granularidade dos commits

Um commit representa uma unidade lógica, não uma operação de edição.

Não criar commits após cada pequena alteração.

Exemplo indesejado:

```text
feat: adiciona cálculo
fix: ajusta cálculo
fix: corrige cálculo
fix: corrige typo
fix: ajusta novamente
```

Se tudo pertence à mesma implementação, preferir:

```text
feat: adiciona cálculo de comissão
```

---

# 16. Amend

Quando uma alteração apenas corrige ou completa o último commit da branch mutável:

```bash
git add .
git commit --amend --no-edit
```

É permitido fazer isso em:

```text
dev
work/*
```

desde que nenhum outro trabalho dependa daquele histórico.

Se a branch já estiver no remoto:

```bash
git push --force-with-lease
```

Nunca utilizar:

```bash
git push --force
```

quando `--force-with-lease` for suficiente.

---

# 17. Fixup e squash durante o desenvolvimento

Commits temporários são permitidos.

Exemplo:

```text
feat: implementa integração
fix: corrige validação
test: adiciona testes
fixup: corrige mensagem
```

Antes da publicação, eles podem ser reorganizados com:

```bash
git rebase -i HEAD~N
```

Utilizando:

```text
squash
fixup
reword
```

Quando todos os últimos N commits pertencem à mesma unidade:

```bash
git reset --soft HEAD~N
git commit -m "<mensagem definitiva>"
```

Nunca incluir commits de outra unidade por acidente.

---

# 18. Sincronização antes da integração

Antes de integrar uma mudança:

```bash
git fetch origin
```

Em `dev`:

```bash
git switch dev
git rebase origin/main
```

Em uma branch temporária:

```bash
git switch work/<nome>
git rebase origin/main
```

Se o rebase alterar uma branch já publicada e seu uso for exclusivo:

```bash
git push --force-with-lease
```

---

# 19. Validação obrigatória

Nenhuma mudança deve chegar a `main` sem passar pelas validações aplicáveis ao projeto.

O projeto deve fornecer uma forma única de executar todas elas.

Preferência:

```bash
npm run verify
```

ou equivalente da stack.

Esse comando pode executar:

```text
lint
typecheck
test
build
```

conforme aplicável.

A regra importante é:

> O agente não deve precisar inventar a sequência de validação.

Ela deve existir no próprio projeto.

---

# 20. Integração padrão sem Pull Request

Este é o fluxo padrão para desenvolvimento solo.

Depois da validação:

```bash
git switch main
git pull --ff-only origin main
git merge --squash <branch-de-origem>
git commit -m "<Conventional Commit>"
git push origin main
```

Exemplo:

```bash
git merge --squash dev
git commit -m "feat: adiciona descontos progressivos"
git push origin main
```

O squash remove do histórico oficial os commits intermediários.

---

# 21. Alinhamento de `dev` após squash

Depois que `dev` for integrada por squash, seus commits antigos não são ancestrais do novo commit criado em `main`.

Por isso, depois da integração:

```bash
git switch dev
git fetch origin
git reset --hard origin/main
git push --force-with-lease origin dev
```

Isso só pode ser feito se `dev` estiver em uso exclusivo.

Resultado:

```text
main ── S
        ↑
dev ───┘
```

O próximo ciclo começa daqui.

---

# 22. Pull Requests

Pull Requests são opcionais.

Não criar PR apenas para cumprir cerimônia.

Usar PR quando houver vantagem concreta, por exemplo:

- mudança crítica;
- alto risco de regressão;
- validações que precisam acontecer no GitHub antes da integração;
- revisão desejada;
- múltiplos agentes;
- colaboração externa;
- mudança experimental;
- necessidade explícita de preservar discussão ou contexto.

Quando uma PR for utilizada:

```text
branch
  ↓
PR
  ↓
CI
  ↓
Squash and merge
  ↓
main
```

---

# 23. Estratégia de merge com PR

Quando houver PR, utilizar somente:

```text
Squash and merge
```

Desabilitar:

```text
Merge commits
Rebase and merge
```

O título da PR deve seguir Conventional Commits.

Exemplo:

```text
feat(pricing): adiciona descontos progressivos
```

O título deve ser utilizado como mensagem do squash commit.

---

# 24. `main` é imutável

Depois que um commit chega a `main`, ele faz parte do histórico oficial.

Nunca utilizar para substituir commits já presentes em `main`:

```text
git commit --amend
git rebase
git reset
git push --force
git push --force-with-lease
```

Mesmo quando o projeto possui apenas um mantenedor.

Essa regra não possui exceção operacional normal.

---

# 25. Revert

Se uma mudança publicada precisar ser desfeita, preservar o commit original.

Utilizar:

```bash
git revert <commit>
```

Para o último commit:

```bash
git revert HEAD
```

Resultado:

```text
feat: adiciona nova estratégia de cache
revert: desfaz nova estratégia de cache
```

Nunca apagar o commit problemático de `main`.

Se posteriormente a mudança precisar retornar:

```bash
git revert <hash-do-revert>
```

---

# 26. Semantic Versioning

Todas as releases utilizam:

```text
MAJOR.MINOR.PATCH
```

Tags:

```text
vMAJOR.MINOR.PATCH
```

Exemplo:

```text
v2.4.1
```

---

# 27. Impacto SemVer

## PATCH

Alteração compatível de correção ou desempenho:

```text
fix
perf
revert
```

Exemplo:

```text
1.4.2 → 1.4.3
```

## MINOR

Nova funcionalidade compatível:

```text
feat
```

Exemplo:

```text
1.4.2 → 1.5.0
```

## MAJOR

Breaking change.

Exemplos:

```text
feat!
fix!
refactor!
perf!
```

ou:

```text
BREAKING CHANGE:
```

Exemplo:

```text
1.4.2 → 2.0.0
```

---

# 28. Commits sem impacto de versão

Por padrão:

```text
docs
test
refactor
build
ci
chore
style
```

não geram versão nova, desde que não representem breaking changes.

---

# 29. Breaking changes

Formato preferencial:

```text
feat!: altera contrato da API
```

Com scope:

```text
feat(api)!: altera estrutura das respostas
```

Quando necessário:

```text
BREAKING CHANGE: descreve claramente o impacto e a migração necessária
```

Breaking changes devem ser explicitamente comunicadas nas notas da release.

---

# 30. Cadência de releases

O padrão global utiliza:

```text
releases em lote
```

Um commit em `main` não precisa gerar imediatamente uma nova GitHub Release.

Isso evita:

```text
v1.2.1
v1.2.2
v1.3.0
v1.3.1
v1.3.2
```

apenas porque várias pequenas integrações aconteceram em sequência.

A release deve agrupar todas as mudanças desde a última tag.

Quando a release for executada, a automação deve analisar todos os commits desde a versão anterior e calcular automaticamente o maior impacto SemVer.

Exemplo:

```text
fix   → PATCH
fix   → PATCH
feat  → MINOR
docs  → nenhum impacto
```

Resultado:

```text
MINOR
```

---

# 31. Disparo de release

Por padrão, a release não deve acontecer automaticamente após cada push em `main`.

O workflow de release deve ser iniciado explicitamente quando houver intenção de publicar uma nova versão.

Preferência no GitHub Actions:

```text
workflow_dispatch
```

O agente não deve decidir sozinho que chegou o momento de publicar uma release, salvo quando o projeto possuir instrução explícita diferente.

Quando solicitado a publicar, ele executa ou acompanha a automação existente.

---

# 32. Semantic Release

A implementação preferencial é:

```text
semantic-release
```

Ele deve:

1. analisar commits desde a última tag;
2. determinar se existe impacto de versão;
3. calcular a próxima versão;
4. criar a tag;
5. gerar notas;
6. criar a GitHub Release.

Os números de versão não devem ser escolhidos manualmente pelos agentes.

---

# 33. Regra customizada para `revert`

O workflow deve configurar explicitamente:

```text
revert → PATCH
```

Essa decisão faz parte deste padrão.

Não depender de comportamento implícito da ferramenta.

---

# 34. Versionamento manual

Evitar:

```text
chore: bump version
chore: release 2.1.0
chore: prepare release
chore: update changelog
```

como parte normal do processo.

A versão é consequência dos commits semânticos.

Não criar commits artificiais apenas para registrar versionamento.

---

# 35. GitHub Releases

Uma release não é considerada concluída apenas porque uma tag foi criada.

Ela deve possuir:

- tag;
- versão;
- título;
- notas;
- categorias relevantes;
- breaking changes destacados.

As GitHub Releases são a principal fonte pública do histórico de versões.

---

# 36. Notas de release

As notas devem priorizar comunicação humana.

Formato recomendado:

```markdown
## Novidades

- Adiciona suporte a descontos progressivos

## Correções

- Corrige o arredondamento da comissão

## Desempenho

- Reduz consultas durante a sincronização

## Breaking changes

- Altera o formato da resposta da API
  - Consulte as instruções de migração antes de atualizar
```

Omitir categorias vazias.

Não expor:

- fixups;
- commits temporários;
- mensagens sem contexto;
- nomes de agentes;
- detalhes internos sem valor para quem utiliza o projeto.

---

# 37. CHANGELOG

Por padrão, não manter `CHANGELOG.md` manual.

GitHub Releases são a fonte padrão das notas de versão.

Se algum projeto necessitar de `CHANGELOG.md`, ele deve ser gerado automaticamente a partir da mesma fonte das releases.

Não manter duas fontes manuais divergentes.

---

# 38. GitHub Actions obrigatórias

Todo projeto deve possuir, quando aplicável:

```text
.github/workflows/ci.yml
.github/workflows/release.yml
```

Quando PRs forem utilizadas regularmente, pode possuir também:

```text
.github/workflows/pr-policy.yml
```

---

# 39. CI

`ci.yml` deve executar as verificações relevantes da stack.

Exemplo:

```text
lint
typecheck
test
build
```

Executar, quando aplicável, em:

```text
push para dev
push para work/**
pull_request para main
push para main
```

A execução em `main` funciona como confirmação final.

Ela não substitui a validação obrigatória executada antes do squash local.

---

# 40. Workflow de release

`release.yml` deve utilizar, por padrão:

```text
workflow_dispatch
```

Ele deve:

- executar semantic-release;
- calcular SemVer;
- criar tag;
- criar GitHub Release;
- gerar notas categorizadas;
- destacar breaking changes.

---

# 41. Validação de PR

Quando PRs fizerem parte do fluxo, seu título deve seguir Conventional Commits.

Aceitar:

```text
feat: adiciona novo filtro
fix(api): corrige autenticação
refactor!: remove API antiga
```

Rejeitar:

```text
Update stuff
Fix
Changes
Ajustes
Final
```

---

# 42. Ruleset de `main`

O GitHub deve proteger `main` com um Ruleset mínimo.

Ativar:

```text
Require linear history
Block force pushes
Restrict deletions
```

Essas regras transformam partes críticas deste documento em proteção técnica.

---

# 43. Ruleset e Pull Requests

Por padrão, NÃO ativar:

```text
Require a pull request before merging
```

porque PRs não são obrigatórias neste workflow.

Também não exigir por padrão:

```text
Require status checks to pass
```

na `main`, pois o fluxo padrão permite squash local seguido de push direto.

A validação prévia é responsabilidade do workflow local padronizado.

Projetos que adotarem PR obrigatória podem aumentar essas proteções explicitamente.

---

# 44. Configuração de merge no GitHub

Configurar:

```text
Allow squash merging: ON
Allow merge commits: OFF
Allow rebase merging: OFF
```

Quando PRs forem utilizadas.

O objetivo é impedir merge commits e preservar o grafo linear.

---

# 45. Fonte única de verdade

Este documento deve existir no projeto em localização padronizada, preferencialmente:

```text
docs/GIT_WORKFLOW.md
```

Arquivos específicos de agentes, como:

```text
AGENTS.md
CLAUDE.md
.github/copilot-instructions.md
```

não devem copiar todas estas regras.

Devem apenas instruir:

```text
Antes de executar operações Git, leia e siga integralmente
docs/GIT_WORKFLOW.md.
```

Isso evita versões divergentes da política.

---

# 46. Permissões do agente em branches mutáveis

Em:

```text
dev
work/*
```

o agente pode utilizar:

```text
git add
git commit
git commit --amend
git rebase
git reset
git cherry-pick
git push
git push --force-with-lease
```

quando necessário para organizar exclusivamente seu próprio trabalho.

---

# 47. Operações proibidas

O agente nunca deve:

```text
force push em main
rebasear main publicada
resetar main para apagar histórico
alterar commits publicados em main
criar merge commits
apagar tags de releases existentes
reescrever releases existentes sem solicitação explícita
usar git push --force quando --force-with-lease for suficiente
misturar unidades independentes em um único commit
atribuir commits automaticamente a agentes ou ferramentas de IA
publicar uma release sem intenção explícita
```

---

# 48. Regra antes de cada commit

Antes de criar um commit, perguntar:

> Esta alteração representa uma nova unidade lógica ou apenas corrige/completa a unidade atual?

Se corrige/completa:

```text
amend
fixup
```

Se é independente:

```text
novo commit
```

Se pertence a outra entrega:

```text
não misturar
```

---

# 49. Regra antes da integração

Antes de integrar em `main`, perguntar:

> O diff entre `main` e a branch de origem representa exatamente uma unidade lógica publicável?

Se não:

```text
não integrar
```

Primeiro:

```text
reorganizar
separar
isolar
```

Depois executar:

```text
validação
squash
commit definitivo
push
```

---

# 50. Regra depois da integração

Depois do push para `main`:

- não reescrever o commit;
- acompanhar a CI;
- corrigir falhas através de novo commit;
- utilizar `revert` quando a mudança precisar ser retirada;
- alinhar `dev` novamente quando aplicável.

---

# 51. Regra para falha encontrada após publicação

Se o comportamento publicado estiver incorreto, existem duas situações.

## Corrigir

Se a solução é uma nova alteração:

```text
fix: corrige ...
```

## Retirar

Se a mudança precisa ser desfeita:

```text
revert: desfaz ...
```

Nunca apagar o commit original de `main`.

---

# 52. Regra para trabalho concorrente

Antes de reescrever `dev`, o agente deve verificar:

> Existe qualquer possibilidade de outro agente depender do estado atual de `dev`?

Se sim:

```text
não reescrever dev
```

Criar ou utilizar:

```text
work/<descricao>
```

Essa regra é obrigatória.

---

# 53. Checklist antes do commit definitivo

Antes do commit que chegará a `main`:

- o diff representa uma unidade lógica;
- não existem arquivos não relacionados;
- nenhum segredo foi incluído;
- nenhum arquivo temporário foi incluído;
- a mensagem segue Conventional Commits;
- o idioma está correto;
- o tipo está correto;
- o scope é útil, se presente;
- breaking changes estão marcadas;
- não existem atribuições automáticas a agentes.

---

# 54. Checklist antes do push para `main`

Antes de:

```bash
git push origin main
```

confirmar:

- `main` está atualizada com `origin/main`;
- a branch de origem está atualizada;
- validações passaram;
- o squash contém somente uma unidade lógica;
- o commit definitivo segue Conventional Commits;
- nenhum merge commit foi criado;
- nenhum histórico publicado foi reescrito.

---

# 55. Checklist depois do push

Confirmar:

- o push foi aceito;
- a CI executou;
- a CI passou;
- `main` continua linear;
- `dev` foi alinhada novamente, quando aplicável;
- branches temporárias concluídas foram removidas.

A falha da CI depois do push deve ser corrigida imediatamente através de novo commit ou revert.

Não reescrever `main`.

---

# 56. Checklist de release

Quando uma release for solicitada:

- todos os commits desejados já estão em `main`;
- a última tag conhecida está correta;
- semantic-release analisará somente commits posteriores a ela;
- o impacto SemVer pode ser inferido;
- `revert` está configurado como PATCH;
- breaking changes estão corretamente marcadas;
- a CI está verde;
- o workflow de release foi iniciado;
- a tag foi criada;
- a GitHub Release foi criada;
- as notas foram geradas;
- as notas são legíveis;
- não existem commits intermediários nas notas.

---

# 57. Resultado esperado em `dev`

Durante o desenvolvimento:

```text
feat: adiciona integração com promoções
test: adiciona cobertura para promoções
fix: corrige validação da promoção
fixup: ajusta mensagem de erro
```

Isso é aceitável.

---

# 58. Resultado esperado em `main`

Depois da consolidação:

```text
feat: adiciona integração com promoções
│
fix: corrige cálculo do preço líquido
│
refactor: reorganiza serviço de marketplaces
│
feat(pricing): adiciona comissão dinâmica
```

Sem:

```text
Merge branch
Merge pull request
fix again
small fix
adjust
update
final
final 2
chore: bump version
chore: update changelog
```

---

# 59. Resultado esperado nas releases

Exemplo:

```text
v1.4.0
```

```markdown
## Novidades

- Adiciona integração com promoções
- Adiciona suporte a comissão dinâmica

## Correções

- Corrige o cálculo do preço líquido

## Manutenção técnica

- Reorganiza o serviço de marketplaces
```

A release comunica o conjunto publicado desde a versão anterior.

---

# 60. Resumo operacional

## Trabalho solo normal

```text
main
 ↓
dev
 ↓
desenvolvimento
 ↓
amend/fixup quando necessário
 ↓
rebase em origin/main
 ↓
validação
 ↓
squash local
 ↓
Conventional Commit
 ↓
main
 ↓
CI
 ↓
realinhar dev
```

## Trabalho concorrente

```text
              work/a
             ↗
main ────────
             ↘
              work/b

cada branch
 ↓
validação
 ↓
squash independente
 ↓
main
```

## Release

```text
main
 ↓
solicitação explícita de release
 ↓
semantic-release
 ↓
SemVer
 ↓
tag
 ↓
GitHub Release
 ↓
release notes
```

---

# 61. Princípio final

A `dev` existe para permitir liberdade.

A `main` existe para preservar história.

Conventional Commits existem para dar significado a essa história.

SemVer existe para transformar significado em versão.

GitHub Actions existem para automatizar o que não deve depender de disciplina manual.

Rulesets existem para impedir tecnicamente os erros mais perigosos.

GitHub Releases existem para explicar cada versão de forma útil.

O resultado esperado é:

> **a `main` conta a história do produto; as Releases contam a história das versões; e nenhum dos dois registra a bagunça necessária para chegar até lá.**