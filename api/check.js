import net from "net";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { server, port } = req.query;
  if (!server || !port) return res.status(400).json({ ok: false });

  const start = Date.now();
  const result = await new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);
    socket.on("connect", () => {
      const ping = Date.now() - start;
      socket.destroy();
      resolve({ ok: true, ping });
    });
    socket.on("timeout", () => { socket.destroy(); resolve({ ok: false }); });
    socket.on("error", () => { socket.destroy(); resolve({ ok: false }); });
    socket.connect(parseInt(port), server);
  });

  res.json(result);
}
