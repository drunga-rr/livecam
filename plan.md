# Plano do LiveCam

## Escopo aprovado

O LiveCam será uma experiência web responsiva de transmissão pública por link: uma pessoa transmite a câmera e o microfone do celular, enquanto espectadores assistem sem login. A sessão é estritamente ao vivo, sem gravação, replay ou armazenamento de mídia.

## Implementação

- Frontend React com três superfícies: página inicial, painel `/broadcast` para o transmissor e página `/watch/:roomId` para espectadores.
- WebRTC em modo mesh controlado: o transmissor mantém uma `RTCPeerConnection` por espectador; cada espectador recebe vídeo e áudio diretamente do transmissor.
- Sinalização por HTTP com polling curto, usando o servidor Express e memória do processo: criação de sala, entrada/saída, ofertas, respostas e candidatos ICE. Isso evita banco de dados e não armazena áudio ou vídeo.
- A sala possui um único broadcaster; espectadores recebem um identificador temporário e o servidor remove participantes inativos por TTL.
- A interface trata permissões de câmera/microfone, falta de dispositivo, bloqueio pelo navegador, desconexões, encerramento e tentativa de reconexão com linguagem simples.
- O link público é `/watch/:roomId`; o transmissor pode copiá-lo e compartilhá-lo.

## Estrutura do projeto

- `client/src/pages/Home.tsx`: entrada do produto e orientação para iniciar ou assistir.
- `client/src/pages/Broadcast.tsx`: preview local, controles de live, link, status e contagem de espectadores.
- `client/src/pages/Watch.tsx`: player remoto, estado da sala e controles de áudio/tela cheia.
- `client/src/lib/live.ts`: cliente de sinalização HTTP e ciclo de polling.
- `server/live.ts`: estado efêmero das salas e regras de sinalização.
- `server/_core/index.ts`: endpoints HTTP da live e integração com Express.
- `client/src/index.css`: sistema visual editorial, responsivo e acessível.
- `client/public/manus-routes.json`: rotas declaradas para o projeto.

## Direção visual: Sinal Editorial

### Movimento

Jornalismo móvel contemporâneo: informação direta, confiança e urgência controlada, com superfícies claras e blocos de sinalização objetiva.

### Princípios

1. O vídeo e o estado da conexão são sempre a prioridade visual.
2. Controles grandes, legíveis e confortáveis para uso no celular.
3. Hierarquia editorial: rótulos curtos, números úteis e mensagens acionáveis.
4. A estética é pública e confiável, sem aparência de painel técnico complexo.

### Cor

Fundo marfim quente `#F4F1EA` para reduzir o brilho de uma interface branca; azul petróleo `#102A43` para confiança e contraste; vermelho editorial `#D72638` reservado para ao vivo, ações críticas e sinais de atenção; verde `#16866A` para conexão saudável.

### Layout

Composição assimétrica de duas colunas no desktop: um palco de vídeo dominante e uma coluna editorial de contexto/ações. No celular, o palco vem primeiro e os controles se tornam uma faixa inferior fixa. Evitar dashboards em grade; usar uma linha temporal e cartões de informação com bordas nítidas.

### Elementos de assinatura

- Marca `LIVE/CAM` em caixa alta com marcador circular vermelho.
- Faixa “AO VIVO” com ponto pulsante discreto.
- Linhas finas e etiquetas monoespaçadas para estados técnicos, sem transformar a tela em terminal.

### Interação e animação

Feedback imediato após permissões e conexão. O ponto de live pulsa lentamente; mensagens de reconexão deslizam para dentro sem interromper o vídeo. Botões usam estados de foco bem visíveis, pressão curta e nenhuma animação ornamental durante a transmissão.

### Tipografia

IBM Plex Sans para títulos, leitura e controles; IBM Plex Mono para estados, contadores e o link compartilhável. Títulos em pesos 600–700, corpo em 400–500, labels em 11–12px com espaçamento aumentado.

### Essência da marca

LiveCam é a forma mais simples de colocar uma câmera ao vivo diante de um público, sem conta, sem arquivo e sem ruído. Personalidade: direta, pública, confiável.

### Voz

Headlines e CTAs são curtos e ativos. Exemplo: “Coloque sua câmera no ar.” e “Compartilhe o link e deixe o público chegar.”

### Wordmark e cor proprietária

O wordmark usa `LIVE` em azul petróleo, uma barra diagonal vermelha e `CAM` em peso forte; o vermelho editorial `#D72638` é a cor proprietária da marca e aparece somente onde há ação ou sinal de live.
