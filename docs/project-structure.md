# Estrutura do projeto

O OnFrame tem quatro areas principais:

- `extension/`: codigo que roda no navegador.
- `service/`: servidor local Node.js que conversa com Mercado Livre e guarda tokens.
- `scripts/`: automacoes do projeto e comandos publicos de instalacao/manutencao.
- `test/`: testes automatizados.

## `extension/`

- `core/`: runtime da extensao. Contem deteccao da pagina, helpers compartilhados, icones, registry e o shell que coordena os modulos.
- `modules/`: funcionalidades de dominio. Hoje existem `photos` e `commerce`.
- `ui/`: telas nativas da extensao, como popup e options.
- `styles/`: contrato visual compartilhado. `foundations.css` concentra tokens, fontes e cores; `components.css` concentra componentes reutilizaveis; `shell.css` organiza apenas telas nativas da extensao.
- `assets/`, `fonts/` e `vendor/`: recursos estaticos e bibliotecas vendorizadas.

## `service/`

- `server.js`: entrada do servidor local.
- `src/app.js`: composicao HTTP principal.
- `src/routes/`: rotas expostas para a extensao.
- `src/*.js`: clientes, contratos e regras de negocio do servidor local.

## `scripts/`

- `bootstrap/`: contrato publico usado por comandos remotos via GitHub. Instala, inicia, verifica, atualiza, para e remove uma instalacao local.
- `release/`: automacoes internas de versao, validacao e empacotamento.

`scripts/bootstrap` deve permanecer estavel porque os comandos publicados apontam para esses arquivos.
