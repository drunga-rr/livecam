import { useEffect, useRef, useState } from "react";
import { AlertCircle, Maximize, Radio, Volume2, VolumeX, Wifi, X } from "lucide-react";
import { Link, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { createParticipantId, getIceServers, joinRoom, leaveRoom, pollEvents, sendSignal, type LiveRoomState, type LiveStatus } from "@/lib/live";

export default function Watch() {
  const { roomId = "" } = useParams<{ roomId: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const cursorRef = useRef(0);
  const participantIdRef = useRef(createParticipantId("v"));
  const pollTimerRef = useRef<number | null>(null);
  const pollingRef = useRef(false);
  const roomRef = useRef<LiveRoomState | null>(null);
  const hasVideoRef = useRef(false);
  const [room, setRoom] = useState<LiveRoomState | null>(null);
  const [status, setStatus] = useState<LiveStatus | "connecting" | "unavailable">("connecting");
  const [hasVideo, setHasVideo] = useState(false);
  const [muted, setMuted] = useState(true);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const connect = async () => {
      try {
        const joined = await joinRoom(roomId, participantIdRef.current);
        if (!active) return;
        roomRef.current = joined;
        setRoom(joined);
        setStatus(joined.status);

        const peer = new RTCPeerConnection({ iceServers: await getIceServers() });
        peerRef.current = peer;
        peer.ontrack = event => {
          const [remoteStream] = event.streams;
          if (videoRef.current && remoteStream) {
            videoRef.current.srcObject = remoteStream;
            setHasVideo(true);
            hasVideoRef.current = true;
            setStatus("live");
            void videoRef.current.play().catch(() => setNeedsPlay(true));
          }
        };
        peer.onicecandidate = event => {
          if (event.candidate && roomRef.current) void sendSignal(roomId, participantIdRef.current, roomRef.current.broadcasterId, "ice-candidate", event.candidate.toJSON()).catch(() => undefined);
        };
        peer.onconnectionstatechange = () => {
          if (!active) return;
          if (peer.connectionState === "connected") setStatus("live");
          if (peer.connectionState === "disconnected" || peer.connectionState === "failed") setStatus("connecting");
        };

        const poll = async () => {
          if (!active || pollingRef.current) return;
          pollingRef.current = true;
          try {
            const result = await pollEvents(roomId, participantIdRef.current, cursorRef.current);
            cursorRef.current = result.cursor;
            roomRef.current = result;
            setRoom(result);
            if (!hasVideoRef.current) setStatus(result.status);
            for (const event of result.messages) {
              if (event.type === "offer") {
                await peer.setRemoteDescription(event.data as RTCSessionDescriptionInit);
                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);
                await sendSignal(roomId, participantIdRef.current, event.from, "answer", answer);
              }
              if (event.type === "ice-candidate") await peer.addIceCandidate(event.data as RTCIceCandidateInit).catch(() => undefined);
            }
          } catch {
            if (active) setStatus("unavailable");
          } finally {
            pollingRef.current = false;
          }
        };
        await poll();
        pollTimerRef.current = window.setInterval(() => void poll(), 1000);
      } catch (joinError) {
        if (active) {
          setStatus("unavailable");
          const reason = joinError instanceof Error ? joinError.message : "";
          setError(reason === "viewer_limit_reached"
            ? "Esta transmissão já atingiu o limite de 5 espectadores. Tente novamente mais tarde."
            : "Este link não está disponível. A live pode ter sido encerrada ou ainda não foi iniciada.");
        }
      }
    };

    void connect();
    return () => {
      active = false;
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      peerRef.current?.close();
      if (roomRef.current) void leaveRoom(roomId, participantIdRef.current);
    };
  }, [roomId]);

  const toggleMute = () => {
    const next = !muted;
    if (videoRef.current) videoRef.current.muted = next;
    setMuted(next);
  };

  const playVideo = async () => {
    await videoRef.current?.play().then(() => setNeedsPlay(false)).catch(() => undefined);
  };

  const fullscreen = () => {
    if (videoRef.current?.requestFullscreen) void videoRef.current.requestFullscreen();
  };

  const statusLabel = status === "live" ? "ao vivo" : status === "waiting" ? "aguardando transmissão" : status === "ended" ? "transmissão encerrada" : status === "unavailable" ? "live indisponível" : "conectando";
  const waiting = !hasVideo && (status === "waiting" || status === "connecting");

  return (
    <main className="app-shell viewer-shell">
      <header className="app-topbar"><Link href="/" className="wordmark"><span className="wordmark-live">LIVE</span><span className="wordmark-slash">/</span>CAM</Link><span className="viewer-header-label"><span className="status-chip-dot" /> transmissão pública</span></header>
      <div className="viewer-layout">
        <section className="viewer-main">
          <div className="viewer-heading"><div><p className="eyebrow"><Radio size={14} /> livecam · sala {roomId.slice(0, 6)}</p><h1>Você está assistindo.</h1></div><span className={`status-chip status-${status}`}><span className="status-chip-dot" /> {statusLabel}</span></div>
          <div className={`video-stage viewer-stage ${hasVideo ? "has-stream" : "is-empty"}`}>
            <video ref={videoRef} autoPlay playsInline muted={muted} aria-label="Transmissão ao vivo" onClick={playVideo} />
            {waiting && <div className="empty-video"><div className="empty-icon"><Wifi size={25} /></div><strong>{status === "connecting" ? "Conectando à live" : "O transmissor ainda não começou"}</strong><span>{status === "connecting" ? "Estamos procurando o sinal da câmera." : "Aguarde nesta página; ela atualiza sozinha."}</span></div>}
            {!waiting && !hasVideo && <div className="empty-video"><div className="empty-icon"><AlertCircle size={25} /></div><strong>{status === "ended" ? "Esta transmissão acabou" : "Live indisponível"}</strong><span>O link pode ter expirado ou a pessoa encerrou a transmissão.</span></div>}
            {hasVideo && <div className="video-overlay-top"><span className="live-pill"><span className="pulse-dot" /> AO VIVO</span><span className="camera-label">LIVE/CAM</span></div>}
            {needsPlay && <button className="play-overlay" onClick={playVideo}>Toque para assistir</button>}
            {hasVideo && <div className="viewer-controls"><Button variant="ghost" size="icon" className="viewer-control" onClick={toggleMute} aria-label={muted ? "Ativar som" : "Desativar som"}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</Button><Button variant="ghost" size="icon" className="viewer-control" onClick={fullscreen} aria-label="Tela cheia"><Maximize size={18} /></Button></div>}
          </div>
          {error && <div className="inline-alert"><AlertCircle size={18} /><span>{error}</span><button aria-label="Fechar mensagem" onClick={() => setError("")}><X size={16} /></button></div>}
          <p className="helper-line"><Wifi size={14} /> {status === "live" ? (muted ? "Toque no ícone de som para ouvir. O áudio começa desligado para evitar microfonia." : "Conexão direta com o transmissor.") : "A sala é pública por link e não exige login."}</p>
        </section>
        <aside className="viewer-aside"><div className="aside-block"><p className="eyebrow">sobre esta live</p><h2>Um sinal, ao vivo.</h2><p className="aside-description">Você está vendo uma transmissão em tempo real. Não há gravação, replay ou arquivo depois que a sala termina.</p></div><div className="aside-divider" /><div className="aside-block viewer-facts"><div><span className="metric-label">estado</span><strong>{statusLabel}</strong></div><div><span className="metric-label">público</span><strong>{room?.viewerCount ?? 0} {room?.viewerCount === 1 ? "pessoa" : "pessoas"}</strong></div></div><div className="aside-footnote"><span className="shield-mark">✓</span><span>LiveCam conecta você ao vídeo sem pedir conta ou dados pessoais.</span></div></aside>
      </div>
    </main>
  );
}
