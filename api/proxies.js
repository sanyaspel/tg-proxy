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

  const allProxies = [];
  const seen = new Set();

  await Promise.all(
    CHANNELS.map(async (channel) => {
      try {
        const response = await fetch(`https://t.me/s/${channel}`, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        const html = await response.text();
        const found = parseProxies(html);
        found.forEach((p) => {
          const key = `${p.server}:${p.port}`;
          if (!seen.has(key)) {
            seen.add(key);
            allProxies.push(p);
          }
        });
      } catch {}
    })
  );

  res.json({
    updated: new Date().toISOString(),
    count: allProxies.length,
    proxies: allProxies,
  });
}
