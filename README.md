# LiveCam

Aplicação web para transmitir a câmera de um celular ou computador para até **5 espectadores** por um link público.

- Frontend: React + Vite
- Backend: Node.js + Express
- Vídeo/áudio: WebRTC ponto a ponto (P2P)
- Sinalização: endpoints HTTP do próprio servidor
- Sem login, gravação ou armazenamento de vídeo

## Como funciona

O servidor hospeda a página e coordena a troca inicial de mensagens WebRTC. Depois de conectados, áudio e vídeo trafegam diretamente entre o transmissor e cada espectador. O servidor não recebe nem grava o conteúdo da câmera.

O transmissor envia um fluxo separado para cada espectador. Para cinco espectadores em 720p, a conexão de internet do transmissor precisa ter upload suficiente. Reduzir a resolução melhora a estabilidade em conexões lentas.

## Executar localmente

Requisitos: Node.js 22 e pnpm 10.

```bash
corepack enable
pnpm install
pnpm dev
```

Abra `http://localhost:3000`. Para testar câmera em outro dispositivo, use HTTPS; navegadores normalmente só liberam câmera em HTTPS ou `localhost`.

## Publicar gratuitamente no Render

1. Crie um repositório no GitHub e envie todos os arquivos deste projeto.
2. No Render, escolha **New > Blueprint** e conecte o repositório.
3. O Render identificará `render.yaml` e criará o serviço `livecam`.
4. Aguarde o primeiro deploy e abra o endereço `https://...onrender.com`.

O plano gratuito do Render suspende o serviço após 15 minutos sem tráfego de entrada; ao receber uma nova requisição, ele volta em cerca de um minuto. Há também 750 horas gratuitas de instância por workspace/mês e limites de banda de saída e minutos de build. Se o limite de banda for ultrapassado, a plataforma pode suspender serviços caso não haja forma de cobrança cadastrada. Confira os limites atuais antes de publicar.

## ICE / STUN / TURN

Por padrão, o LiveCam usa o STUN público da Cloudflare (`stun:stun.cloudflare.com:3478`), documentado como gratuito e sem limite de uso. STUN ajuda os navegadores a tentarem uma conexão direta, mas não garante conexão em toda rede.

Se uma rede bloquear conexões P2P, será necessário configurar um serviço TURN. O backend já aceita estas variáveis de ambiente:

- `TURN_URLS`: URLs TURN separadas por vírgula (ex.: `turn:turn.exemplo.com:3478?transport=udp,turns:turn.exemplo.com:5349`)
- `TURN_USERNAME`: usuário TURN
- `TURN_CREDENTIAL`: senha/credencial TURN

Não há um relay TURN próprio incluído nesta versão. Serviços TURN gratuitos de terceiros podem ter limites, baixa disponibilidade ou condições de uso. Não coloque credenciais TURN no código nem no repositório; configure-as como variáveis privadas no Render.

## Limites desta versão

- Até 5 espectadores simultâneos por sala.
- Uma transmissão por sala.
- Sem gravação ou replay.
- Salas e sinalização ficam em memória no processo do servidor e expiram após inatividade. Se o serviço reiniciar, as salas em andamento são encerradas.
- A transmissão P2P depende da rede do transmissor e dos espectadores. Algumas redes exigirão TURN.
- Para manter o plano gratuito, monitore os limites atuais do Render e de qualquer serviço TURN usado.

## Verificação

- `GET /api/health` retorna `{ "status": "ok" }`.
- `GET /api/live/ice-servers` retorna a configuração ICE pública usada pelos navegadores.
