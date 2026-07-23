# Contribuicao no OnFrame

Este projeto usa um fluxo simples:

- `dev` e a branch de desenvolvimento diario.
- `main` e a branch de versoes estaveis.
- Todo trabalho finalizado deve virar commit e push em `dev`.
- Releases saem apenas da `main`, com tag `vMAJOR.MINOR.PATCH`.

## Fluxo diario

Antes de alterar qualquer coisa:

```powershell
git checkout dev
git pull --ff-only origin dev
```

Depois de implementar:

```powershell
npm run test:all
git status
git diff
git add <arquivos>
git commit -m "tipo: descricao curta"
git push origin dev
```

Use commits pequenos e com uma intencao clara. Nao deixe commit local sem push
quando a alteracao estiver validada.

## Mensagens de commit

Use Conventional Commits:

- `fix:` correcao de bug ou regressao.
- `feat:` recurso novo para o usuario.
- `refactor:` reorganizacao sem mudanca de comportamento.
- `test:` inclusao ou ajuste de testes.
- `docs:` documentacao.
- `chore:` manutencao interna, scripts ou configuracao.

Exemplos:

```text
fix: corrigir remocao de promocao programada
feat: adicionar modulo de estoque
refactor: simplificar deteccao de anuncio
test: cobrir oferta acumulativa
docs: atualizar fluxo de release
chore: ajustar bootstrap de instalacao
```

## Releases

O fluxo completo de release fica em `RELEASE.md`.

Resumo:

- Promova `dev` para `main` por fast-forward.
- Atualize versao e `CHANGELOG.md`.
- Rode `npm run release:check`.
- Commit de release deve seguir o formato `Release vx.y.z`.
- Crie e envie a tag `vx.y.z`.
- Sincronize `dev` com `main`.

## SemVer

Enquanto o OnFrame estiver em beta privado, seja conservador:

- `PATCH` para correcoes, ajustes de UX, textos, testes e melhorias dentro de
  fotos, preco ou promocoes.
- `MINOR` para uma capacidade nova clara para o usuario.
- `MAJOR` para mudancas incompativeis em instalacao, autenticacao, pacote ou
  forma de uso.
