import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { serveStatic, setupVite } from "./vite";
import {
  createRoom,
  getEvents,
  getIceServers,
  joinRoom,
  leaveRoom,
  setReady,
  signalRoom,
} from "../live";

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "512kb" }));

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/live/ice-servers", getIceServers);
  app.post("/api/live/rooms", createRoom);
  app.post("/api/live/rooms/:roomId/join", joinRoom);
  app.post("/api/live/rooms/:roomId/ready", setReady);
  app.post("/api/live/rooms/:roomId/signal", signalRoom);
  app.get("/api/live/rooms/:roomId/events", getEvents);
  app.post("/api/live/rooms/:roomId/leave", leaveRoom);

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  server.listen(port, "0.0.0.0", () => {
    console.log(`LiveCam listening on port ${port}`);
  });
}

startServer().catch(error => {
  console.error("Could not start LiveCam:", error);
  process.exit(1);
});
