# OnFrame

OnFrame e uma extensao local para Chrome/Edge que ajuda vendedores do Mercado
Livre a gerenciar anuncios diretamente pela pagina do produto.

A ideia e simples: abrir o anuncio como qualquer cliente veria e fazer ajustes
sem precisar voltar para a ficha do anuncio no painel do vendedor.

Guias para usuario final ficam em [docs/README.md](docs/README.md).

## O que a extensao faz

- Edita fotos do anuncio pela propria pagina do produto.
- Reordena fotos por arrastar e soltar.
- Remove fotos.
- Adiciona novas fotos.
- Analisa a resolucao das imagens.
- Otimiza imagens abaixo do ideal.
- Mostra informacoes de preco.
- Mostra promocoes aplicadas e oportunidades disponiveis.
- Permite revisar e aplicar promocoes quando disponiveis para o anuncio.
- Edita descricao diretamente no corpo do anuncio.
- Edita caracteristicas diretamente na ficha tecnica do Mercado Livre.
- Permite aplicar descricao, caracteristicas, preco e promocoes em variacoes
  elegiveis quando o anuncio permite.

## Requisitos

- Windows com Node.js 20 ou superior; ou
- macOS 13 Ventura ou superior, com runtime Node.js privado instalado
  automaticamente pelo OnFrame.
- Chrome ou Edge.
- Modo desenvolvedor ativado no navegador.
- Conta Mercado Livre conectada no OnFrame.

## Instalar no Windows

Abra o PowerShell e rode:

```powershell
iwr -useb 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/install.ps1' | iex
```

A instalacao padrao fica em:

```text
%LOCALAPPDATA%\OnFrame
```

Normalmente:

```text
C:\Users\SEU_USUARIO\AppData\Local\OnFrame
```

## Instalar no macOS

Abra o Terminal e rode:

```sh
/bin/sh -c "$(/usr/bin/curl -fsSL 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/install.sh')"
```

A instalacao fica em:

```text
~/Library/Application Support/OnFrame
```

O instalador baixa um Node.js 24 LTS oficial somente para o OnFrame, valida o
checksum do arquivo e registra o servico para iniciar junto com a sessao do
usuario. Nao e necessario instalar Homebrew, usar `sudo` ou alterar particoes.

## Carregar no Chrome ou Edge

1. Abra `chrome://extensions` ou `edge://extensions`.
2. Ative o modo de desenvolvedor.
3. Clique em `Carregar sem compactacao`.
4. Selecione a pasta:

```text
Windows: %LOCALAPPDATA%\OnFrame\extension
macOS: ~/Library/Application Support/OnFrame/extension
```

## Conectar o Mercado Livre

1. Abra uma pagina de anuncio no Mercado Livre.
2. Clique no icone da extensao ou no controle do OnFrame na pagina.
3. Clique em `Conectar`.
4. Autorize sua conta Mercado Livre.
5. Volte para a pagina do anuncio.

Depois disso, o OnFrame ja pode carregar os dados do anuncio aberto.

## Usar no anuncio

Abra a pagina de venda do anuncio no Mercado Livre.

O OnFrame aparece direto na pagina quando reconhece o anuncio. A partir dali,
voce pode:

- abrir o editor de fotos;
- arrastar fotos para reordenar;
- remover fotos;
- adicionar fotos;
- salvar ou descartar alteracoes;
- abrir o painel completo para revisar dimensoes e otimizar imagens;
- abrir informacoes de preco e promocoes quando existirem dados disponiveis.

Depois de salvar uma alteracao, aguarde alguns segundos e recarregue a pagina
para conferir o resultado atualizado no Mercado Livre.

## Iniciar o OnFrame

Se a extensao informar que o servico local nao esta aberto, rode:

```powershell
iwr -useb 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/start.ps1' | iex
```

No macOS:

```sh
"$HOME/Library/Application Support/OnFrame/scripts/bootstrap/start.sh"
```

## Atualizar

Quando uma nova versao estiver disponivel, o popup da extensao pode abrir a
pagina local de atualizacao. Ela tenta iniciar o atualizador registrado no
computador e tambem mostra o comando manual adequado ao PowerShell ou Terminal.

Para atualizar manualmente:

```powershell
iwr -useb 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/update.ps1' | iex
```

No macOS:

```sh
ONFRAME_HOME="$HOME/Library/Application Support/OnFrame" /bin/sh -c "$(/usr/bin/curl -fsSL 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/update.sh')"
```

O instalador e o atualizador registram o protocolo local
`onframe-updater://`. Ele aceita somente as acoes fixas `update`, `start`,
`stop`, `restart`, `check` e `open-log`.

Depois da atualizacao, recarregue a extensao no navegador:

1. Abra `chrome://extensions` ou `edge://extensions`.
2. Encontre o OnFrame.
3. Clique em `Recarregar`.

## Verificar se esta tudo certo

Para diagnosticar a instalacao:

```powershell
iwr -useb 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/check.ps1' | iex
```

No macOS:

```sh
"$HOME/Library/Application Support/OnFrame/scripts/bootstrap/check.sh"
```

Use esse comando quando:

- a extensao nao carrega dados;
- o botao de conectar nao responde;
- o servico local parece fechado;
- voce quer confirmar a versao instalada.

## Parar

```powershell
iwr -useb 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/stop.ps1' | iex
```

No macOS:

```sh
"$HOME/Library/Application Support/OnFrame/scripts/bootstrap/stop.sh"
```

## Desinstalar

Para remover o OnFrame do computador:

```powershell
iwr -useb 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/uninstall.ps1' | iex
```

No macOS:

```sh
/bin/sh -c "$(/usr/bin/curl -fsSL 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/uninstall.sh')"
```

A desinstalacao comum preserva configuracao e contas. Para remover tambem os
dados locais no macOS:

```sh
ONFRAME_REMOVE_DATA=1 /bin/sh -c "$(/usr/bin/curl -fsSL 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/uninstall.sh')"
```

Depois remova a extensao manualmente em `chrome://extensions` ou
`edge://extensions`.

## Observacoes

- O OnFrame funciona somente em paginas do Mercado Livre.
- A extensao precisa que o servico local esteja aberto.
- Alteracoes salvas podem levar alguns minutos para aparecer visualmente no
  Mercado Livre.
- Produtos de catalogo podem ter limitacoes impostas pelo proprio Mercado Livre.
- Safari nao faz parte desta distribuicao.
