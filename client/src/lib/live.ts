export type LiveStatus = "waiting" | "live" | "ended" | "unavailable";
export type SignalType = "offer" | "answer" | "ice-candidate";

export type LiveMessage = {
  seq: number;
  from: string;
  to: string;
  type: SignalType;
  data: RTCSessionDescriptionInit | RTCIceCandidateInit | { kind: "viewer-joined"; viewerId: string };
};

export type LiveRoomState = {
  roomId: string;
  broadcasterId: string;
  status: LiveStatus;
  broadcasterOnline: boolean;
  viewerCount: number;
};

const fallbackIceServers: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];
let iceServersPromise: Promise<RTCIceServer[]> | null = null;

export function getIceServers() {
  if (!iceServersPromise) {
    iceServersPromise = fetch("/api/live/ice-servers", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("ice_config_failed");
        const payload = await response.json() as { iceServers?: RTCIceServer[] };
        return payload.iceServers?.length ? payload.iceServers : fallbackIceServers;
      })
      .catch(() => fallbackIceServers);
  }
  return iceServersPromise;
}

function makeId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.().replaceAll("-", "") ?? Math.random().toString(36).slice(2);
  return `${prefix}${random}`.slice(0, 40);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload.error === "string" ? payload.error : "request_failed");
  }
  return response.json() as Promise<T>;
}

export function createParticipantId(prefix: "b" | "v") {
  return makeId(prefix);
}

export async function createRoom(broadcasterId: string) {
  return request<LiveRoomState & { broadcasterToken: string }>("/api/live/rooms", {
    method: "POST",
    body: JSON.stringify({ broadcasterId }),
  });
}

export async function joinRoom(roomId: string, participantId: string) {
  return request<LiveRoomState & { participantId: string }>(`/api/live/rooms/${roomId}/join`, {
    method: "POST",
    body: JSON.stringify({ participantId }),
  });
}

export async function markRoomReady(roomId: string, participantId: string, broadcasterToken: string) {
  return request<LiveRoomState>(`/api/live/rooms/${roomId}/ready`, {
    method: "POST",
    body: JSON.stringify({ participantId, broadcasterToken }),
  });
}

export async function sendSignal(roomId: string, from: string, to: string, type: SignalType, data: unknown, broadcasterToken?: string) {
  return request<{ accepted: boolean }>(`/api/live/rooms/${roomId}/signal`, {
    method: "POST",
    body: JSON.stringify({ from, to, type, data, broadcasterToken }),
  });
}

export async function pollEvents(roomId: string, participantId: string, after: number, broadcasterToken?: string) {
  const tokenQuery = broadcasterToken ? `&token=${encodeURIComponent(broadcasterToken)}` : "";
  return request<LiveRoomState & { messages: LiveMessage[]; cursor: number }>(
    `/api/live/rooms/${roomId}/events?participantId=${encodeURIComponent(participantId)}&after=${after}${tokenQuery}`,
  );
}

export async function leaveRoom(roomId: string, participantId: string, broadcasterToken?: string) {
  return fetch(`/api/live/rooms/${roomId}/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participantId, broadcasterToken }),
    keepalive: true,
  }).catch(() => undefined);
}
