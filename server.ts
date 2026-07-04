import { createServer } from "node:http";
import next from "next";
import { WebSocketServer } from "ws";
import { attachRoomServer } from "./src/server/rooms";

const dev = process.env.NODE_ENV !== "production";
// Bind address: MUST be 0.0.0.0 on container platforms (Render, Fly,
// Railway) so the platform proxy can reach the process. Do NOT read
// process.env.HOSTNAME here — Docker-based runtimes set HOSTNAME to the
// container's name, which hijacks the bind address and causes 502s.
const bindHost = process.env.BIND_HOST ?? "0.0.0.0";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev, hostname: bindHost, port });
const handleRequest = app.getRequestHandler();

async function main() {
  await app.prepare();
  // Must be created after prepare() — getUpgradeHandler eagerly
  // initializes Next's underlying server and throws otherwise.
  const handleUpgrade = app.getUpgradeHandler();

  const server = createServer((req, res) => handleRequest(req, res));
  const wss = new WebSocketServer({ noServer: true });

  attachRoomServer(wss);

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      // Let Next handle its own upgrade requests (e.g. /_next/webpack-hmr)
      handleUpgrade(req, socket, head);
    }
  });

  server.listen(port, bindHost, () => {
    console.log(
      `> Card Room ready on http://localhost:${port} (ws endpoint: /ws)`
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
