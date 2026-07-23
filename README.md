# OnFrame

OnFrame e uma extensao local para Chrome/Edge que ajuda vendedores do Mercado
Livre a gerenciar anuncios diretamente pela pagina do produto.

A ideia e simples: abrir o anuncio como qualquer cliente veria e fazer ajustes
sem precisar voltar para a ficha do anuncio no painel do vendedor.

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

## Requisitos

- Windows.
- Node.js 20 ou superior.
- Chrome, Edge ou outro navegador Chromium.
- Modo desenvolvedor ativado no navegador.
- Conta Mercado Livre conectada no OnFrame.

## Instalar

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

## Carregar no Chrome ou Edge

1. Abra `chrome://extensions` ou `edge://extensions`.
2. Ative o modo de desenvolvedor.
3. Clique em `Carregar sem compactacao`.
4. Selecione a pasta:

```text
%LOCALAPPDATA%\OnFrame\extension
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

## Atualizar

Para atualizar para a ultima versao:

```powershell
iwr -useb 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/update.ps1' | iex
```

Depois da atualizacao, recarregue a extensao no navegador:

1. Abra `chrome://extensions` ou `edge://extensions`.
2. Encontre o OnFrame.
3. Clique em `Recarregar`.

## Verificar se esta tudo certo

Para diagnosticar a instalacao:

```powershell
iwr -useb 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/check.ps1' | iex
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

## Desinstalar

Para remover o OnFrame do computador:

```powershell
iwr -useb 'https://raw.githubusercontent.com/eusilvamateus/onframe/main/scripts/bootstrap/uninstall.ps1' | iex
```

Depois remova a extensao manualmente em `chrome://extensions` ou
`edge://extensions`.

## Observacoes

- O OnFrame funciona somente em paginas do Mercado Livre.
- A extensao precisa que o servico local esteja aberto.
- Alteracoes salvas podem levar alguns minutos para aparecer visualmente no
  Mercado Livre.
- Produtos de catalogo podem ter limitacoes impostas pelo proprio Mercado Livre.
