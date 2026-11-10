import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Clipboard, Copy, ExternalLink, Mic, MicOff, Radio, RotateCcw, SwitchCamera, Video, VideoOff, Wifi, X } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { createParticipantId, createRoom, getIceServers, leaveRoom, markRoomReady, pollEvents, sendSignal, type LiveRoomState, type LiveStatus } from "@/lib/live";

type LocalStatus = LiveStatus | "idle" | "connecting" | "error";

const statusCopy: Record<LocalStatus, { label: string; detail: string }> = {
  idle: { label: "aguardando câmera", detail: "Ative sua câmera para começar." },
  waiting: { label: "sala pronta", detail: "Seu link está pronto para receber espectadores." },
  connecting: { label: "conectando", detail: "Abrindo a sala para o público..." },
  live: { label: "ao vivo", detail: "Sua câmera está disponível pelo link." },
  ended: { label: "transmissão encerrada", detail: "Esta sala não aceita novas conexões." },
  error: { label: "atenção necessária", detail: "Confira a permissão da câmera e tente novamente." },
  unavailable: { label: "indisponível", detail: "A sala não está mais disponível." },
};

function humanizeCameraError(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "O acesso foi bloqueado. Permita câmera e microfone nas configurações do navegador e tente novamente.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "Não encontramos uma câmera ou um microfone neste dispositivo.";
  if (name === "NotReadableError") return "A câmera está sendo usada por outro aplicativo. Feche-o e tente novamente.";
  return "Não foi possível acessar a câmera. Verifique o navegador e tente novamente.";
}

export default function Broadcast() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const roomRef = useRef<LiveRoomState | null>(null);
  const participantIdRef = useRef(createParticipantId("b"));
  const broadcasterTokenRef = useRef("");
  const cursorRef = useRef(0);
  const pollTimerRef = useRef<number | null>(null);
  const pollingRef = useRef(false);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [room, setRoom] = useState<LiveRoomState | null>(null);
  const [status, setStatus] = useState<LocalStatus>("idle");
  const [message, setMessage] = useState("Ative câmera e microfone para preparar sua transmissão.");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  const shareUrl = room ? `${window.location.origin}/watch/${room.roomId}` : "";

  const stopPeer = useCallback((viewerId: string) => {
    const peer = peersRef.current.get(viewerId);
    peer?.close();
    peersRef.current.delete(viewerId);
  }, []);

  const sendCandidate = useCallback(async (viewerId: string, candidate: RTCIceCandidate) => {
    if (!roomRef.current) return;
    await sendSignal(roomRef.current.roomId, participantIdRef.current, viewerId, "ice-candidate", candidate.toJSON(), broadcasterTokenRef.current).catch(() => undefined);
  }, []);

  const createPeerForViewer = useCallback(async (viewerId: string) => {
    const currentRoom = roomRef.current;
    const localStream = streamRef.current;
    if (!currentRoom || !localStream) return;
    stopPeer(viewerId);
    const peer = new RTCPeerConnection({ iceServers: await getIceServers(currentRoom.roomId, participantIdRef.current) });
    peersRef.current.set(viewerId, peer);
    localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
    peer.onicecandidate = event => { if (event.candidate) void sendCandidate(viewerId, event.candidate); };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed" || peer.connectionState === "closed") stopPeer(viewerId);
    };
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await sendSignal(currentRoom.roomId, participantIdRef.current, viewerId, "offer", offer, broadcasterTokenRef.current).catch(() => stopPeer(viewerId));
  }, [sendCandidate, stopPeer]);

  const handleEvents = useCallback(async () => {
    const currentRoom = roomRef.current;
    if (!currentRoom || pollingRef.current) return;
    pollingRef.current = true;
    try {
      const result = await pollEvents(currentRoom.roomId, participantIdRef.current, cursorRef.current, broadcasterTokenRef.current);
      cursorRef.current = result.cursor;
      const nextRoom = { ...currentRoom, ...result };
      roomRef.current = nextRoom;
      setRoom(nextRoom);
      if (nextRoom.status === "waiting" && status !== "ended") setStatus("waiting");
      for (const event of result.messages) {
        if (event.type === "offer" && typeof event.data === "object" && event.data && "kind" in event.data && event.data.kind === "viewer-joined") {
          await createPeerForViewer(event.data.viewerId);
        }
        if (event.type === "answer") {
          const peer = peersRef.current.get(event.from);
          if (peer && !peer.currentRemoteDescription) await peer.setRemoteDescription(event.data as RTCSessionDescriptionInit);
        }
        if (event.type === "ice-candidate") {
          const peer = peersRef.current.get(event.from);
          if (peer) await peer.addIceCandidate(event.data as RTCIceCandidateInit).catch(() => undefined);
        }
      }
    } catch {
      if (roomRef.current?.status === "live") setMessage("A conexão com a sala oscilou. Tentando restabelecer...");
    } finally {
      pollingRef.current = false;
    }
  }, [createPeerForViewer, status]);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    void handleEvents();
    pollTimerRef.current = window.setInterval(() => void handleEvents(), 1000);
  }, [handleEvents]);

  const requestCamera = useCallback(async () => {
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      const nextStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = nextStream;
      setStream(nextStream);
      setMicEnabled(true);
      setCameraEnabled(true);
      if (videoRef.current) {
        videoRef.current.srcObject = nextStream;
        await videoRef.current.play().catch(() => undefined);
      }
      setStatus("waiting");
      setMessage("Tudo certo. O áudio está com cancelamento de eco e redução de ruído ativos.");
    } catch (cameraError) {
      setStatus("error");
      setError(humanizeCameraError(cameraError));
    }
  }, [facingMode]);

  const startLive = useCallback(async () => {
    setError("");
    setStatus("connecting");
    try {
      if (!streamRef.current) await requestCamera();
      if (!streamRef.current) throw new Error("camera_missing");
      const created = await createRoom(participantIdRef.current);
      broadcasterTokenRef.current = created.broadcasterToken;
      roomRef.current = created;
      setRoom(created);
      await markRoomReady(created.roomId, participantIdRef.current, broadcasterTokenRef.current);
      const liveRoom = { ...created, status: "live" as const };
      roomRef.current = liveRoom;
      setRoom(liveRoom);
      setStatus("live");
      setMessage("Você está no ar. Compartilhe o link com seu público.");
      startPolling();
    } catch (startError) {
      setStatus("error");
      setError(startError instanceof Error && startError.message === "camera_missing" ? "Ative a câmera antes de iniciar a live." : "Não foi possível abrir a sala. Tente novamente.");
    }
  }, [requestCamera, startPolling]);

  const stopLive = useCallback(() => {
    if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    pollTimerRef.current = null;
    if (roomRef.current) void leaveRoom(roomRef.current.roomId, participantIdRef.current, broadcasterTokenRef.current);
    peersRef.current.forEach(peer => peer.close());
    peersRef.current.clear();
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setStream(null);
    broadcasterTokenRef.current = "";
    setStatus("ended");
    setMessage("A transmissão terminou. Nenhum vídeo foi gravado.");
  }, []);

  const toggleMic = () => {
    const next = !micEnabled;
    streamRef.current?.getAudioTracks().forEach(track => { track.enabled = next; });
    setMicEnabled(next);
  };

  const toggleCamera = () => {
    const next = !cameraEnabled;
    streamRef.current?.getVideoTracks().forEach(track => { track.enabled = next; });
    setCameraEnabled(next);
  };

  const switchCamera = async () => {
    const nextFacingMode = facingMode === "user" ? "environment" : "user";
    setError("");
    if (!streamRef.current) {
      setFacingMode(nextFacingMode);
      setMessage(nextFacingMode === "environment" ? "A câmera traseira será usada ao ativar a câmera." : "A câmera frontal será usada ao ativar a câmera.");
      return;
    }
    try {
      const currentVideoTrack = streamRef.current.getVideoTracks()[0];
      if (!currentVideoTrack) throw new Error("camera_missing");

      // Many mobile browsers can flip the lens on the existing track, but reject
      // a second getUserMedia call while the first camera is still active.
      try {
        await currentVideoTrack.applyConstraints({ facingMode: { exact: nextFacingMode } });
        setFacingMode(nextFacingMode);
        setCameraEnabled(true);
        setMessage(nextFacingMode === "environment" ? "Câmera traseira ativa." : "Câmera frontal ativa.");
        return;
      } catch {
        // Fall through to the release-and-reopen path for browsers without support.
      }

      currentVideoTrack.stop();
      streamRef.current.removeTrack(currentVideoTrack);
      const replacement = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: nextFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      const nextVideoTrack = replacement.getVideoTracks()[0];
      if (!nextVideoTrack) throw new Error("camera_missing");
      peersRef.current.forEach(peer => {
        const sender = peer.getSenders().find(item => item.track?.kind === "video");
        if (sender) void sender.replaceTrack(nextVideoTrack);
      });
      streamRef.current.addTrack(nextVideoTrack);
      if (videoRef.current) videoRef.current.srcObject = streamRef.current;
      setFacingMode(nextFacingMode);
      setCameraEnabled(true);
      setMessage(nextFacingMode === "environment" ? "Câmera traseira ativa." : "Câmera frontal ativa.");
    } catch (cameraError) {
      setError(humanizeCameraError(cameraError));
    }
  };

  const logout = async () => {
    if (roomRef.current && (status === "live" || status === "connecting")) {
      setError("Encerre a transmissão antes de sair.");
      return;
    }
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/");
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      streamRef.current?.getTracks().forEach(track => track.stop());
      peersRef.current.forEach(peer => peer.close());
      if (roomRef.current) void leaveRoom(roomRef.current.roomId, participantIdRef.current, broadcasterTokenRef.current);
    };
  }, []);

  const copy = statusCopy[status];
  const isOnAir = status === "live" || status === "connecting";

  return (
    <main className="app-shell">
      <header className="app-topbar"><Link href="/" className="wordmark"><span className="wordmark-live">LIVE</span><span className="wordmark-slash">/</span>CAM</Link><div className="topbar-context"><span className="context-kicker">painel do transmissor</span><span>área administrativa · sem gravação</span><button onClick={logout} style={{ marginLeft: 16, border: "1px solid #d0d5dd", borderRadius: 8, padding: "7px 11px", background: "transparent", cursor: "pointer" }}>Sair</button></div></header>
      <div className="broadcast-layout">
        <section className="broadcast-main">
          <div className="page-intro"><div><p className="eyebrow"><Radio size={14} /> canal público</p><h1>Coloque sua câmera no ar.</h1></div><span className={`status-chip status-${status}`}><span className="status-chip-dot" /> {copy.label}</span></div>
          <div className={`video-stage ${stream ? "has-stream" : "is-empty"}`}>
            <video ref={videoRef} autoPlay muted playsInline aria-label="Pré-visualização da câmera" />
            {!stream && <div className="empty-video"><div className="empty-icon"><Video size={25} /></div><strong>Seu preview aparece aqui</strong><span>O navegador vai pedir acesso à câmera e ao microfone.</span></div>}
            <div className="video-overlay-top"><span className="camera-label">CAM 01 · MOBILE</span>{isOnAir && <span className="live-pill"><span className="pulse-dot" /> AO VIVO</span>}</div>
            {stream && <div className="video-overlay-bottom"><span>{cameraEnabled ? "câmera ativa" : "câmera pausada"}</span><span>{micEnabled ? "microfone ativo" : "microfone pausado"}</span></div>}
          </div>
          {error && <div className="inline-alert"><AlertCircle size={18} /><span>{error}</span><button aria-label="Fechar mensagem" onClick={() => setError("")}><X size={16} /></button></div>}
          <div className="control-strip">
            <div className="control-group"><Button variant="outline" className="control-button" onClick={toggleCamera} disabled={!stream} aria-label={cameraEnabled ? "Desligar câmera" : "Ligar câmera"}>{cameraEnabled ? <Video size={18} /> : <VideoOff size={18} />}<span>{cameraEnabled ? "Câmera" : "Câmera off"}</span></Button><Button variant="outline" className="control-button" onClick={toggleMic} disabled={!stream} aria-label={micEnabled ? "Desligar microfone" : "Ligar microfone"}>{micEnabled ? <Mic size={18} /> : <MicOff size={18} />}<span>{micEnabled ? "Microfone" : "Mic off"}</span></Button><Button variant="outline" className="control-button" onClick={switchCamera} aria-label="Alternar entre câmera frontal e traseira"><SwitchCamera size={18} /><span>{facingMode === "environment" ? "Traseira" : "Frontal"}</span></Button></div>
            {status === "ended" ? <Button className="button button-primary" onClick={() => { roomRef.current = null; setRoom(null); setStatus("idle"); setMessage("Prepare uma nova transmissão quando quiser."); }}><RotateCcw size={18} /> Nova transmissão</Button> : status === "live" || status === "connecting" ? <Button variant="destructive" className="button button-danger" onClick={stopLive}><span className="stop-square" /> Encerrar live</Button> : <Button className="button button-primary" onClick={stream ? startLive : requestCamera}>{stream ? <><Radio size={18} /> Iniciar live</> : <><CameraIcon /> Ativar câmera</>}</Button>}
          </div>
          <p className="helper-line"><Wifi size={14} /> {message}</p>
        </section>

        <aside className="broadcast-aside">
          <div className="aside-block"><p className="eyebrow">status da sala</p><div className="status-summary"><span className={`status-orb orb-${status}`} /><div><strong>{copy.label}</strong><p>{copy.detail}</p></div></div></div>
          <div className="aside-divider" />
          <div className="aside-block"><div className="aside-heading"><p className="eyebrow">link público</p><ExternalLink size={16} /></div>{shareUrl ? <><div className="share-field"><span>{shareUrl.replace(window.location.origin, "")}</span><button onClick={copyLink} aria-label="Copiar link">{copied ? <Check size={17} /> : <Copy size={17} />}</button></div><Button variant="outline" className="full-button" onClick={copyLink}>{copied ? <><Check size={16} /> Link copiado</> : <><Clipboard size={16} /> Copiar link da live</>}</Button></> : <div className="share-empty">O link aparece aqui assim que você iniciar a transmissão.</div>}</div>
          <div className="aside-divider" />
          <div className="aside-block metrics-block"><div><span className="metric-label">espectadores</span><strong>{room?.viewerCount ?? 0}</strong></div><div><span className="metric-label">arquivo</span><strong className="metric-word">não</strong></div></div>
          <div className="aside-footnote"><ShieldMark /> <span>O LiveCam conecta seu vídeo em tempo real. Ao encerrar, a sala desaparece.</span></div>
        </aside>
      </div>
    </main>
  );
}

function CameraIcon() { return <Video size={18} />; }
function ShieldMark() { return <span className="shield-mark">✓</span>; }
