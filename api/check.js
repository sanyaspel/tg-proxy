import tls from "tls";
import net from "net";

// Декодирует секрет в hex (поддерживает hex и base64url форматы)
function decodeSecret(secret) {
  if (/^[0-9a-fA-F]{32,}$/.test(secret)) return secret;
  try {
    const buf = Buffer.from(secret.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    return buf.toString("hex");
  } catch { return null; }
}

// Извлекает SNI-домен из fake-TLS секрета (ee-prefix)
function extractSNI(secret) {
  const hex = decodeSecret(secret);
  if (!hex || !hex.startsWith("ee")) return null;
  const domainHex = hex.slice(2 + 32); // пропускаем 'ee' + 16 байт ключа
  if (domainHex.length < 4) return null;
  try {
    const domain = Buffer.from(domainHex, "hex").toString("ascii");
    // Проверяем что похоже на домен
    if (/^[\w.-]+\.[a-z]{2,}$/.test(domain)) return domain;
    return null;
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { server, port, secret } = req.query;
  if (!server || !port) return res.status(400).json({ ok: false });

  const start = Date.now();
  const sni = secret ? extractSNI(secret) : null;

  if (sni) {
    // Fake-TLS: настоящий TLS-хендшейк с правильным SNI
    const result = await new Promise((resolve) => {
      let done = false;
      const finish = (val) => { if (!done) { done = true; resolve(val); } };

      const socket = tls.connect({
        host: server,
        port: parseInt(port),
        servername: sni,
        rejectUnauthorized: false,
      });
      socket.setTimeout(5000);
      socket.on("secureConnect", () => {
        finish({ ok: true, ping: Date.now() - start });
        socket.destroy();
      });
      socket.on("timeout", () => { socket.destroy(); finish({ ok: false }); });
      socket.on("error",   () => { socket.destroy(); finish({ ok: false }); });
    });
    return res.json(result);
  }

  // Обычный TCP для прокси без fake-TLS
  const result = await new Promise((resolve) => {
    let done = false;
    const finish = (val) => { if (!done) { done = true; resolve(val); } };

    const socket = new net.Socket();
    socket.setTimeout(5000);
    socket.on("connect", () => {
      finish({ ok: true, ping: Date.now() - start });
      socket.destroy();
    });
    socket.on("timeout", () => { socket.destroy(); finish({ ok: false }); });
    socket.on("error",   () => { socket.destroy(); finish({ ok: false }); });
    socket.connect(parseInt(port), server);
  });

  res.json(result);
}
