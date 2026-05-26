// Каналы и сколько страниц брать (1 страница ≈ 20 прокси)
const CHANNELS = [
  { name: "ProxyMTProto", pages: 4 },
  { name: "mtpro_xyz", pages: 2 },
];

function parseProxies(html) {
  const results = [];
  const seen = new Set();

  // https://t.me/proxy?server=...&port=...&secret=... (web format, may be HTML-encoded)
  const webRe = /https?:\/\/t\.me\/proxy\?[^"'\s<>]+/g;
  let m;
  while ((m = webRe.exec(html)) !== null) {
    try {
      const raw = m[0].replace(/&amp;/g, "&");
      const qs = new URLSearchParams(raw.split("?")[1]);
      const server = qs.get("server");
      const port = qs.get("port");
      const secret = qs.get("secret");
      if (server && port && secret) {
        const key = `${server}:${port}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ server, port, secret });
        }
      }
    } catch {}
  }

  // tg://proxy?... links (fallback)
  const tgRe = /tg:\/\/proxy\?[^"'\s<>]+/g;
  while ((m = tgRe.exec(html)) !== null) {
    try {
      const qs = new URLSearchParams(m[0].replace("tg://proxy?", ""));
      const server = qs.get("server");
      const port = qs.get("port");
      const secret = qs.get("secret");
      if (server && port && secret) {
        const key = `${server}:${port}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ server, port, secret });
        }
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
    // Находим минимальный ID сообщения для следующей страницы
    const ids = [...html.matchAll(/data-post="[^/]+\/(\d+)"/g)].map(m => parseInt(m[1]));
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
            debugInfo.push({ channel: name, htmlLength: html.length, found: found.length, minId });
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

  res.json({
    updated: new Date().toISOString(),
    count: allProxies.length,
    proxies: allProxies,
    ...(debug && { debug: debugInfo }),
  });
}
