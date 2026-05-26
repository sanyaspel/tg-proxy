const CHANNELS = ["ProxyMTProto", "mtpro_xyz", "FreeProxyMTProto"];

function parseProxies(html) {
  const results = [];
  const seen = new Set();

  // tg://proxy?... links
  const linkRe = /tg:\/\/proxy\?[^"'\s<>]+/g;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
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

  // Text format: Server: ... Port: ... Secret: ...
  const textRe = /Server:\s*([^\s<\n]+)[\s\S]{0,100}?Port:\s*(\d+)[\s\S]{0,200}?Secret:\s*([a-zA-Z0-9+/=]{10,})/gi;
  while ((m = textRe.exec(html)) !== null) {
    const server = m[1].trim();
    const port = m[2].trim();
    const secret = m[3].trim();
    const key = `${server}:${port}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ server, port, secret });
    }
  }

  return results;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const debug = req.query.debug === "1";
  const allProxies = [];
  const seen = new Set();
  const debugInfo = [];

  await Promise.all(
    CHANNELS.map(async (channel) => {
      try {
        const response = await fetch(`https://t.me/s/${channel}`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
          },
        });
        const html = await response.text();
        const found = parseProxies(html);
        if (debug) {
          debugInfo.push({ channel, status: response.status, htmlLength: html.length, sample: html.slice(0, 500), found: found.length });
        }
        found.forEach((p) => {
          const key = `${p.server}:${p.port}`;
          if (!seen.has(key)) {
            seen.add(key);
            allProxies.push(p);
          }
        });
      } catch (e) {
        if (debug) debugInfo.push({ channel, error: e.message });
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
