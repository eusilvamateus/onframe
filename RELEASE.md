# Releases do OnFrame

O OnFrame usa SemVer com tags `vMAJOR.MINOR.PATCH`.

O versionamento publico foi reiniciado em `2026-07-23`. A versao `v0.1.0`
representa o novo ponto inicial do projeto.

## Politica de versionamento

Enquanto o projeto estiver em beta privado, use `0.x.y` e seja conservador. Na
duvida entre `PATCH` e `MINOR`, escolha `PATCH`.

O numero da versao deve refletir mudanca percebida no produto, nao quantidade de
commits, arquivos alterados ou complexidade tecnica interna.

## Quando mudar cada parte

- `PATCH`: correcao, refinamento ou ajuste dentro de capacidades existentes.
  Use para bugs, textos, UX, layout, contratos de API, classificacao de dados,
  reorganizacao interna, testes, documentacao e melhorias em fotos, preco ou
  promocoes quando o modulo ja existia.
- `MINOR`: nova capacidade clara para o usuario, sem quebrar instalacoes
  existentes. Use para novo modulo, novo fluxo completo, nova area de
  gerenciamento ou uma acao que antes nao existia no OnFrame.
- `MAJOR`: mudanca incompativel em instalacao, autenticacao, dados locais,
  contrato de pacote, comandos de bootstrap ou forma de uso.

## Exemplos para o OnFrame

Use `PATCH` para:

- corrigir deteccao de anuncio, variacao, catalogo ou conta dona;
- melhorar popover, modal, bandeja, textos, badges ou mensagens;
- separar melhor estados de promocoes ja suportadas;
- corrigir calculo, exibicao ou narrativa de preco, frete, comissao ou bonus;
- remover informacao confusa da UI;
- ajustar testes, documentacao ou organizacao interna sem criar capacidade nova.

Use `MINOR` para:

- criar um modulo novo, como estoque, anuncios, reputacao ou diagnosticos;
- adicionar uma acao nova relevante, como editar preco inline quando isso passar
  a existir de fato;
- adicionar um fluxo completo novo, como gerenciar campanhas criadas pelo
  vendedor de ponta a ponta;
- mudar o produto de editor/diagnostico para uma area nova de operacao.

Use `MAJOR` para:

- exigir reinstalacao manual diferente;
- mudar a forma de autenticar ou armazenar contas;
- quebrar compatibilidade do pacote baixado por release;
- remover suporte a um fluxo que usuarios ja tenham instalado.

## Branches

- `dev`: desenvolvimento diario.
- `main`: historico das versoes estaveis.
- Tags de release sempre saem de commits da `main`.
- O historico deve permanecer linear sempre que possivel.
- A `dev` pode conter commits tagueados depois de sincronizar com `main`; isso e
  esperado porque tags apontam para commits, nao para branches.

## Preparar uma versao

Na `dev`, valide o estado que sera promovido:

```powershell
git checkout dev
git pull origin dev
npm test
```

Promova `dev` para `main` por fast-forward:

```powershell
git checkout main
git pull origin main
git merge --ff-only dev
```

Na `main`, escolha a proxima versao, atualize changelog e sincronize
`package.json` com `extension/manifest.json`:

```powershell
npm run version:set -- 0.1.1
# edite CHANGELOG.md
npm run release:check
git add package.json extension/manifest.json CHANGELOG.md RELEASE.md
git commit -m "Release v0.1.1"
git push origin main
git tag v0.1.1
git push origin v0.1.1
```

Depois que a tag disparar a release, sincronize a `dev` com o commit de release:

```powershell
git checkout dev
git merge --ff-only main
git push origin dev
```

O push da tag publica uma release no GitHub com
`onframe-release-vMAJOR.MINOR.PATCH.zip`. Esse ZIP e usado pelo bootstrap
PowerShell remoto.

## Atualizacao de instalacoes

Quando a extensao detectar uma release nova, ela mostra um botao para copiar o
comando:

```powershell
iwr -useb 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/update.ps1' | iex
```

O script remoto usa o diretorio padrao do OnFrame quando `ONFRAME_HOME` nao for
informado, baixa o ZIP da ultima release, preserva `.env` e `.onframe`, troca os
arquivos do pacote e reinicia o servico local.

Para revisar uma instalacao sem alterar arquivos:

```powershell
iwr -useb 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/check.ps1' | iex
```

Instalacoes feitas direto por `git clone` nao se atualizam pelo botao. Nelas, a
atualizacao continua sendo `git pull`.
