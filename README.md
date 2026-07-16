# Animatronics vs Console User — Multiplayer Cooperativo

Servidor Node.js + client 3D (Three.js) para o modo multiplayer **cooperativo**:
até **5 guardas noturnos** dividem o mesmo escritório em primeira pessoa.
Qualquer guarda pode apertar qualquer botão (lanterna, portas, máscara) — o
estado é o mesmo pra todo mundo. Os animatrônicos (Chuck, Bone, Fred, Raw)
são controlados pela IA do servidor, igual ao jogo single-player original.

O estado do jogo (energia, hora, posições) vive **só no servidor**. Os
navegadores apenas recebem atualizações — ninguém consegue trapacear editando
o JS do navegador.

## 1. Instalar

Você precisa do [Node.js](https://nodejs.org) instalado (versão 18+, recomendado 22+).

```bash
cd animatronics-multiplayer
npm install
```

## 2. Rodar (com Node.js instalado)

```bash
npm start
```

Isso abre o servidor em `http://localhost:3000`. **Só você tem acesso a esse
terminal** — quem joga com você nunca vê essa tela nem tem acesso ao arquivo
do servidor, só à página do navegador.

## 3. Gerar um `.exe` (Windows, sem precisar de Node.js instalado)

Se você quiser distribuir isso pra alguém que não tem Node.js na máquina,
dá pra empacotar tudo (servidor + Node.js embutido) num único `.exe`.

**Importante:** isso precisa ser feito na sua máquina com internet (o
empacotador baixa um binário do Node.js na primeira vez). Eu já deixei o
projeto configurado — falta só rodar:

```bash
npm install
npm run build:exe
```

Isso vai gerar `dist/AnimatronicsServer.exe`. Quem receber esse arquivo só
precisa dar um duplo-clique — uma janela de terminal abre sozinha mostrando
`Servidor rodando em http://localhost:3000`, e é só abrir esse endereço no
navegador. Continua valendo a mesma regra: **só quem roda o `.exe` tem
acesso a esse terminal**, os outros guardas só usam o navegador.

Usamos o [`@yao-pkg/pkg`](https://yao-pkg.github.io/pkg/) (fork mantido do
antigo `pkg` da Vercel, que foi descontinuado) pra fazer esse empacotamento.
Ele já está configurado no `package.json`:

```json
"pkg": {
  "assets": ["public/**/*"],
  "targets": ["node22-win-x64"],
  "outputPath": "dist"
}
```

Se quiser gerar pra Linux ou Mac também, é só trocar o alvo:

```bash
npx pkg . --targets node22-linux-x64,node22-macos-x64 --out-path dist
```

O `.exe` fica com uns 40-90 MB — isso é normal, ele carrega o runtime do
Node.js inteiro junto.

## 4. Jogar

### Na mesma rede Wi-Fi (mais simples)
1. Descubra o IP local da sua máquina:
   - Windows: `ipconfig` (procure "IPv4")
   - Mac/Linux: `ifconfig` ou `ip addr` (procure algo como `192.168.x.x`)
2. Você abre `http://localhost:3000`, clica em **Criar Sala**, escolhe a
   noite e recebe um código de 4 letras. Você é o anfitrião.
3. Cada guarda, na mesma rede, abre `http://SEU-IP:3000`, clica em
   **Entrar em Sala** e digita o código. Cabe até 5 no total.
4. Quando quiser (não precisa esperar os 5), você clica em **COMEÇAR NOITE**
   na sua tela de lobby.

## 5. Hospedar pra jogar com alguém do outro lado do mundo

Rodar `npm start` na sua máquina só funciona pra quem está na sua rede Wi-Fi.
Pra alguém em outro país entrar, o servidor precisa estar num endereço público
na internet, 24h no ar, sem depender do seu PC ligado.

### Opção recomendada: Render (grátis, sem cartão de crédito)

Já deixei um `render.yaml` configurado no projeto. Passo a passo:

1. **Suba o projeto pro GitHub** (se ainda não tiver um repositório):
   ```bash
   cd animatronics-multiplayer
   git init
   git add .
   git commit -m "primeira versão"
   ```
   Crie um repositório novo em [github.com/new](https://github.com/new) e siga
   as instruções que o GitHub mostra pra enviar (`git push`) o que você acabou
   de commitar.

2. Entre em [render.com](https://render.com) → crie conta (não pede cartão) →
   **New +** → **Web Service** → conecte o repositório que você acabou de criar.

3. Render detecta o `render.yaml` sozinho e já preenche:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plano: **Free**

4. (Opcional, mas recomendado) Nas variáveis de ambiente do serviço, adicione
   `HOST_KEY` com uma senha só sua — assim só você consegue criar salas
   (quem tiver o código de sala ainda consegue entrar normalmente).

5. Clique em **Deploy**. Em alguns minutos você recebe uma URL tipo
   `https://animatronics-multiplayer.onrender.com` — é isso que você abre no
   navegador (não precisa mais do `localhost`) e é isso que você manda pros
   guardas, não importa o país onde estejam.

**Vale saber sobre o plano grátis do Render:**
- Se ninguém acessar por 15 minutos seguidos, o servidor "dorme" e o próximo
  acesso demora uns 30-60 segundos pra acordar — normal, é só abrir o link e
  esperar. Depois que alguém conecta, ele fica acordado enquanto a partida
  estiver rolando (mensagens de WebSocket contam como atividade).
- 750 horas de servidor grátis por mês e 5 GB de tráfego — de sobra pra um
  jogo entre amigos.
- Se um dia você quiser o servidor sempre acordado, sem esse delay inicial,
  o plano pago mais barato do Render custa uns $7/mês. Não é necessário pra
  jogar casualmente.

### Alternativa: rodar na sua própria máquina, mas exposta à internet

Se preferir não depender de nenhum serviço externo, dá pra abrir uma porta
no seu roteador (*port forwarding*) apontando pra porta 3000 da sua máquina
e compartilhar seu IP público (ou um endereço de DNS dinâmico tipo No-IP,
já que seu IP de casa pode mudar). Isso funciona, mas:
- Seu computador precisa ficar ligado e com o `npm start` (ou o `.exe`) rodando
  o tempo todo que quiser deixar o servidor disponível.
- Você está expondo sua rede doméstica na internet — **defina o `HOST_KEY`**
  nesse cenário, e não deixe a porta aberta quando não estiver usando.

Pra maioria das pessoas, a opção do Render é mais simples e mais segura.

## Controles (dentro do escritório 3D)

| Tecla | Ação |
|---|---|
| W A S D | Mover |
| Mouse | Olhar ao redor (clique na tela pra travar o cursor) |
| Space | Pular |
| F | Ligar/desligar a lanterna |
| Q | Colocar/tirar a máscara |
| E | Abrir/fechar a porta — funciona só quando você está perto da porta esquerda ou direita |

A cena 3D usa o Three.js carregado via CDN (`cdnjs.cloudflare.com`), então o
navegador de quem for jogar precisa de internet para carregar essa parte —
o jogo em si continua rodando 100% através do seu servidor local/hospedado
(ou do seu `.exe`).

## Estrutura

```
server.js         -> servidor Node (HTTP + WebSocket), dono do estado do jogo
public/index.html -> telas (menu, lobby, escritório 3D, fim de jogo)
public/game.js     -> lógica do client (WebSocket + cena Three.js)
public/style.css   -> visual estilo terminal/CRT + overlay do escritório 3D
package.json       -> config do npm e do empacotador @yao-pkg/pkg
render.yaml        -> config pronta pra deploy grátis no Render
```

## Próximos passos sugeridos
- Trocar os blocos coloridos dos animatrônicos (Chuck, Bone, Fred, Raw) por
  modelos 3D de verdade ou sprites — hoje são só formas geométricas simples
  de placeholder.
- Adicionar efeitos CRT/glitch por cima do canvas 3D (um overlay em CSS ou
  um post-processing simples do Three.js) pra bater com a estética que você
  já usa no jogo single-player.
- Mostrar avatares dos outros guardas se movendo dentro da mesma sala 3D
  (hoje cada guarda só vê o escritório vazio do seu próprio ponto de vista,
  mas todos compartilham o mesmo estado de portas/lanterna/máscara).
- Guardar progresso (noites desbloqueadas) em um arquivo JSON no servidor,
  já que `localStorage` do original não funciona entre máquinas diferentes.
- Adicionar reconexão automática caso a conexão caia no meio da partida.
