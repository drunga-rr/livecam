import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";

const DEFAULT_STUN_URL = "stun:stun.cloudflare.com:3478";

export type LiveStatus = "waiting" | "live" | "ended";
export type LiveSignalType = "offer" | "answer" | "ice-candidate";

type Role = "broadcaster" | "viewer";

type Participant = {
  id: string;
  role: Role;
  lastSeen: number;
};

type SignalMessage = {
  seq: number;
  to: string;
  from: string;
  type: LiveSignalType;
  data: unknown;
};

type Room = {
  id: string;
  status: LiveStatus;
  broadcasterId: string;
  broadcasterToken: string;
  broadcasterOnline: boolean;
  createdAt: number;
  lastActivity: number;
  nextSeq: number;
  participants: Map<string, Participant>;
  messages: SignalMessage[];
};

const rooms = new Map<string, Room>();
const ROOM_TTL_MS = 1000 * 60 * 60 * 6;
const PARTICIPANT_TTL_MS = 1000 * 30;
const MAX_MESSAGES = 1500;
const MAX_VIEWERS_PER_ROOM = 5;
const MAX_SIGNAL_BYTES = 256 * 1024;

function now() {
  return Date.now();
}

function cleanRooms() {
  const timestamp = now();
  for (const [roomId, room] of rooms) {
    for (const [participantId, participant] of room.participants) {
      if (timestamp - participant.lastSeen > PARTICIPANT_TTL_MS) {
        room.participants.delete(participantId);
        if (participant.role === "broadcaster") {
          room.broadcasterOnline = false;
          if (room.status === "live") room.status = "waiting";
        }
      }
    }
    if (timestamp - room.lastActivity > ROOM_TTL_MS) {
      rooms.delete(roomId);
    }
  }
}

function getRoom(roomId: string) {
  cleanRooms();
  return rooms.get(roomId);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{6,80}$/.test(value);
}

function sendJson(res: Response, status: number, payload: unknown) {
  res.status(status).json(payload);
}

export async function getIceServers(req: Request, res: Response) {
  const apiToken = process.env.TURNIX_API_TOKEN;
  if (!apiToken) {
    console.error("[TURN] TURNIX_API_TOKEN is not configured.");
    return sendJson(res, 503, { error: "turn_credentials_unavailable" });
  }

  // Only participants already admitted to a live room may request relay credentials.
  const roomId = typeof req.query.roomId === "string" ? req.query.roomId : "";
  const participantId = typeof req.query.participantId === "string" ? req.query.participantId : "";
  const room = getRoom(roomId);
  const participant = room?.participants.get(participantId);
  if (!room || !participant || room.status === "ended") {
    return sendJson(res, 403, { error: "participant_unavailable" });
  }

  try {
    const clientIp = (req.ip || "").replace(/^::ffff:/, "");
    const response = await fetch("https://turnix.io/api/v1/credentials/ice", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        ...(clientIp ? { "X-TURN-CLIENT-IP": clientIp } : {}),
      },
      body: JSON.stringify({
        ttl: 3600,
        room: roomId,
        initiator_client: participantId,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      // Never log response headers or the API token.
      if (response.status === 401) console.error("[TURN] Turnix rejected TURNIX_API_TOKEN; check the Render environment variable.");
      else if (response.status === 429) console.warn("[TURN] Turnix usage limit reached.");
      else console.error(`[TURN] Turnix credentials request failed with HTTP ${response.status}.`);
      return sendJson(res, response.status === 429 ? 503 : 502, {
        error: response.status === 429 ? "turn_usage_limit_reached" : "turn_credentials_unavailable",
      });
    }

    const payload = await response.json() as { iceServers?: unknown[]; expiresAt?: string };
    if (!Array.isArray(payload.iceServers) || payload.iceServers.length === 0) {
      console.error("[TURN] Turnix returned an invalid ICE server response.");
      return sendJson(res, 502, { error: "turn_credentials_unavailable" });
    }
    return sendJson(res, 200, { iceServers: payload.iceServers, expiresAt: payload.expiresAt });
  } catch (error) {
    console.error("[TURN] Could not obtain ICE credentials:", error instanceof Error ? error.name : "unknown_error");
    return sendJson(res, 502, { error: "turn_credentials_unavailable" });
  }
}

function getBody(req: Request) {
  return req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
}

function touch(room: Room, participantId: string) {
  const participant = room.participants.get(participantId);
  if (!participant) return null;
  participant.lastSeen = now();
  room.lastActivity = now();
  return participant;
}

function enqueue(room: Room, message: Omit<SignalMessage, "seq">) {
  room.messages.push({ ...message, seq: room.nextSeq++ });
  if (room.messages.length > MAX_MESSAGES) room.messages.splice(0, room.messages.length - MAX_MESSAGES);
}

function roomView(room: Room) {
  const viewers = [...room.participants.values()].filter(participant => participant.role === "viewer").length;
  return {
    roomId: room.id,
    broadcasterId: room.broadcasterId,
    status: room.status,
    broadcasterOnline: room.broadcasterOnline,
    viewerCount: viewers,
  };
}

export function createRoom(req: Request, res: Response) {
  cleanRooms();
  const body = getBody(req);
  const broadcasterId = validId(body.broadcasterId) ? body.broadcasterId : randomUUID().replaceAll("-", "");
  const roomId = randomUUID().replaceAll("-", "").slice(0, 12);
  const timestamp = now();
  const room: Room = {
    id: roomId,
    status: "waiting",
    broadcasterId,
    broadcasterToken: randomUUID(),
    broadcasterOnline: true,
    createdAt: timestamp,
    lastActivity: timestamp,
    nextSeq: 1,
    participants: new Map([[broadcasterId, { id: broadcasterId, role: "broadcaster", lastSeen: timestamp }]]),
    messages: [],
  };
  rooms.set(roomId, room);
  sendJson(res, 201, { ...roomView(room), broadcasterToken: room.broadcasterToken });
}

export function joinRoom(req: Request, res: Response) {
  const room = getRoom(req.params.roomId);
  if (!room || room.status === "ended") return sendJson(res, 404, { error: "room_unavailable" });
  const body = getBody(req);
  const participantId = validId(body.participantId) ? body.participantId : randomUUID().replaceAll("-", "");
  const existing = room.participants.get(participantId);
  if (existing && existing.role !== "viewer") return sendJson(res, 409, { error: "participant_conflict" });
  const activeViewers = [...room.participants.values()].filter(participant => participant.role === "viewer").length;
  if (!existing && activeViewers >= MAX_VIEWERS_PER_ROOM) {
    return sendJson(res, 429, { error: "viewer_limit_reached", limit: MAX_VIEWERS_PER_ROOM });
  }

  room.participants.set(participantId, { id: participantId, role: "viewer", lastSeen: now() });
  room.lastActivity = now();
  enqueue(room, { to: room.broadcasterId, from: participantId, type: "offer", data: { kind: "viewer-joined", viewerId: participantId } });
  sendJson(res, 200, { participantId, ...roomView(room) });
}

export function setReady(req: Request, res: Response) {
  const room = getRoom(req.params.roomId);
  if (!room) return sendJson(res, 404, { error: "room_unavailable" });
  const body = getBody(req);
  const participantId = validId(body.participantId) ? body.participantId : "";
  const participant = touch(room, participantId);
  if (!participant || participant.role !== "broadcaster" || participant.id !== room.broadcasterId ||
      body.broadcasterToken !== room.broadcasterToken) {
    return sendJson(res, 403, { error: "not_broadcaster" });
  }
  room.status = "live";
  room.broadcasterOnline = true;
  sendJson(res, 200, roomView(room));
}

export function signalRoom(req: Request, res: Response) {
  const room = getRoom(req.params.roomId);
  if (!room || room.status === "ended") return sendJson(res, 404, { error: "room_unavailable" });
  const body = getBody(req);
  const from = validId(body.from) ? body.from : "";
  const to = validId(body.to) ? body.to : "";
  const type = body.type;
  if (!to || !from || !["offer", "answer", "ice-candidate"].includes(String(type))) {
    return sendJson(res, 400, { error: "invalid_signal" });
  }
  const participant = touch(room, from);
  const recipient = room.participants.get(to);
  if (!participant || !recipient) return sendJson(res, 404, { error: "participant_unavailable" });

  // Only the broadcaster and the addressed viewer may exchange WebRTC signals.
  const validDirection =
    (participant.role === "broadcaster" && recipient.role === "viewer" && body.broadcasterToken === room.broadcasterToken) ||
    (participant.role === "viewer" && recipient.role === "broadcaster");
  if (!validDirection) return sendJson(res, 403, { error: "invalid_signal_direction" });

  let signalSize = 0;
  try { signalSize = Buffer.byteLength(JSON.stringify(body.data ?? null), "utf8"); } catch {}
  if (signalSize > MAX_SIGNAL_BYTES) return sendJson(res, 413, { error: "signal_too_large" });

  enqueue(room, { to, from, type: type as LiveSignalType, data: body.data });
  sendJson(res, 202, { accepted: true });
}

export function getEvents(req: Request, res: Response) {
  const room = getRoom(req.params.roomId);
  if (!room) return sendJson(res, 404, { error: "room_unavailable" });
  const participantId = typeof req.query.participantId === "string" ? req.query.participantId : "";
  const after = Number(req.query.after ?? 0);
  const currentParticipant = room.participants.get(participantId);
  if (!currentParticipant) return sendJson(res, 403, { error: "participant_unavailable" });
  if (currentParticipant.role === "broadcaster" && req.query.token !== room.broadcasterToken) {
    return sendJson(res, 403, { error: "not_broadcaster" });
  }
  const participant = touch(room, participantId);
  if (!participant) return sendJson(res, 403, { error: "participant_unavailable" });

  const messages = room.messages.filter(message => message.to === participantId && message.seq > after);
  const nextCursor = messages.length > 0 ? messages[messages.length - 1].seq : after;
  sendJson(res, 200, { messages, cursor: nextCursor, ...roomView(room) });
}

export function leaveRoom(req: Request, res: Response) {
  const room = getRoom(req.params.roomId);
  if (!room) return sendJson(res, 204, null);
  const participantId = typeof getBody(req).participantId === "string" ? String(getBody(req).participantId) : "";
  const participant = room.participants.get(participantId);
  if (participant?.role === "broadcaster") {
    if (getBody(req).broadcasterToken !== room.broadcasterToken) {
      return sendJson(res, 403, { error: "not_broadcaster" });
    }
    room.status = "ended";
    room.broadcasterOnline = false;
  }
  room.participants.delete(participantId);
  room.lastActivity = now();
  sendJson(res, 200, { ok: true });
}
