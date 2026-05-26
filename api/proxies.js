import tls from "tls";
import net from "net";

// Каналы и сколько страниц брать (1 страница ≈ 20 прокси)
const CHANNELS = [
  { name: "ProxyMTProto", pages: 4 },
  { name: "mtpro_xyz", pages: 2 },
];

const CHECK_TIMEOUT = 5000;
const MAX_WORKERS = 40;

function checkProxy(server, port, isTLS) {
  return new Promise((resolve) => {
    const portNum = parseInt(port);

    if (isTLS) {
      const socket = tls.connect(
        { host: server, port: portNum, rejectUnauthorized: false, servername: server },
        () => { socket.destroy(); resolve(true); }
      );
      socket.setTimeout(CHECK_TIMEOUT);
      socket.on("timeout", () => { socket.destroy(); resolve(false); });
      socket.on("error", () => { socket.destroy(); resolve(false); });
    } else {
      const socket = new net.Socket();
      socket.setTimeout(CHECK_TIMEOUT);
      socket.on("connect", () => { socket.destroy(); resolve(true); });
      socket.on("timeout", () => { socket.destroy(); resolve(false); });
      socket.on("error", () => { socket.destroy(); resolve(false); });
      socket.connect(portNum, server);
    }
  });
}

// Проверяем партиями чтобы не перегружать
async function checkAll(proxies) {
  const results = [];
  for (let i = 0; i < proxies.length; i += MAX_WORKERS) {
    const batch = proxies.slice(i, i + MAX_WORKERS);
    const checks = await Promise.all(
      batch.map((p) => {
        const isTLS = p.secret.startsWith("ee");
        return checkProxy(p.server, p.port, isTLS);
      })
    );
    batch.forEach((p, j) => { if (checks[j]) results.push(p); });
  }
  return results;
}

function parseProxies(html) {
  const results = [];
  const seen = new Set();

  const webRe = /https?:\/\/t\.me\/proxy\?[^"'\s<>]+/g;
  let m;
  while ((m = webRe.exec(html)) !== null) {
    try {
      const raw = m[0].replace(/&amp;amp;/g, "&").replace(/&amp;/g, "&");
      const qs = new URLSearchParams(raw.split("?")[1]);
      const server = qs.get("server");
      const port = qs.get("port");
      const secret = qs.get("secret");
      if (server && port && secret) {
        const key = `${server}:${port}`;
        if (!seen.has(key)) { seen.add(key); results.push({ server, port, secret }); }
      }
    } catch {}
  }

  const tgRe = /tg:\/\/proxy\?[^"'\s<>]+/g;
  while ((m = tgRe.exec(html)) !== null) {
    try {
      const qs = new URLSearchParams(m[0].replace("tg://proxy?", ""));
      const server = qs.get("server");
      const port = qs.get("port");
      const secret = qs.get("secret");
      if (server && port && secret) {
        const key = `${server}:${port}`;
        if (!seen.has(key)) { seen.add(key); results.push({ server, port, secret }); }
      }
    } catch {}
  }

  return results;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const debug = req.query.debug === "1";
  const allProxies = [];
  const seen = new Set();
  const debugInfo = [];

  const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };

  async function fetchChannelPage(name, before = null) {
    const url = `https://t.me/s/${name}${before ? `?before=${before}` : ""}`;
    const response = await fetch(url, { headers: HEADERS });
    const html = await response.text();
    const ids = [...html.matchAll(/data-post="[^/]+\/(\d+)"/g)].map((m) => parseInt(m[1]));
    const minId = ids.length ? Math.min(...ids) : null;
    return { html, minId };
  }

  await Promise.all(
    CHANNELS.map(async ({ name, pages }) => {
      try {
        let before = null;
        for (let i = 0; i < pages; i++) {
          const { html, minId } = await fetchChannelPage(name, before);
          const found = parseProxies(html);
          if (debug && i === 0) {
            // Найти первое сообщение с прокси
            const reactIdx = html.indexOf("tgme_widget_message_reactions");
            const starIdx = html.indexOf("⭐");
            const viewsIdx = html.indexOf("tgme_widget_message_views");
            const centerIdx = reactIdx > -1 ? reactIdx : (starIdx > -1 ? starIdx : viewsIdx);
            const sample = centerIdx > -1 ? html.slice(Math.max(0, centerIdx - 200), centerIdx + 1500) : html.slice(0, 2000);
            debugInfo.push({ channel: name, found: found.length, minId, sample });
          }
          found.forEach((p) => {
            const key = `${p.server}:${p.port}`;
            if (!seen.has(key)) { seen.add(key); allProxies.push(p); }
          });
          if (!minId) break;
          before = minId;
        }
      } catch (e) {
        if (debug) debugInfo.push({ channel: name, error: e.message });
      }
    })
  );

  const working = await checkAll(allProxies);

  if (debug) debugInfo.push({ total_found: allProxies.length, total_working: working.length });

  res.json({
    updated: new Date().toISOString(),
    count: working.length,
    proxies: working,
    ...(debug && { debug: debugInfo }),
  });
}
