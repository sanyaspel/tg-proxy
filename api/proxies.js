// Каналы и сколько страниц брать (1 страница ≈ 20 сообщений)
const CHANNELS = [
  { name: "ProxyMTProto", pages: 6 },
  { name: "mtpro_xyz", pages: 3 },
];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

function parseProxiesFromUrl(url) {
  const raw = url.replace(/&amp;amp;/g, "&").replace(/&amp;/g, "&");
  const qs = new URLSearchParams(raw.split("?")[1]);
  const server = qs.get("server");
  const port = qs.get("port");
  const secret = qs.get("secret");
  if (server && port && secret) return { server, port, secret };
  return null;
}

// Парсим сообщения с привязкой прокси к количеству звёзд
function parseMessages(html) {
  const results = [];
  const seen = new Set();

  // Разбиваем на блоки сообщений по data-post
  const blocks = html.split(/(?=<div[^>]+data-post=")/);

  for (const block of blocks) {
    if (!block.includes("data-post=")) continue;

    // Ищем прокси-ссылки в блоке
    const proxies = [];
    const webRe = /https?:\/\/t\.me\/proxy\?[^"'\s<>]+/g;
    const tgRe = /tg:\/\/proxy\?[^"'\s<>]+/g;
    let m;

    while ((m = webRe.exec(block)) !== null) {
      try {
        const p = parseProxiesFromUrl(m[0]);
        if (p) proxies.push(p);
      } catch {}
    }
    while ((m = tgRe.exec(block)) !== null) {
      try {
        const p = parseProxiesFromUrl(m[0].replace("tg://proxy?", "https://t.me/proxy?"));
        if (p) proxies.push(p);
      } catch {}
    }

    if (proxies.length === 0) continue;

    // Извлекаем количество Telegram Stars (платных реакций)
    let stars = 0;
    const starsMatch = block.match(/icon-telegram-stars[^<]*<\/i>\s*<span[^>]*>(\d+)/);
    if (starsMatch) stars = parseInt(starsMatch[1]);

    proxies.forEach((p) => {
      const key = `${p.server}:${p.port}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ ...p, stars });
      }
    });
  }

  return results;
}

async function fetchChannelPage(name, before = null) {
  const url = `https://t.me/s/${name}${before ? `?before=${before}` : ""}`;
  const response = await fetch(url, { headers: HEADERS });
  const html = await response.text();
  const ids = [...html.matchAll(/data-post="[^/]+\/(\d+)"/g)].map((m) => parseInt(m[1]));
  const minId = ids.length ? Math.min(...ids) : null;
  return { html, minId };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const debug = req.query.debug === "1";
  const allMessages = [];
  const seen = new Set();
  const debugInfo = [];

  await Promise.all(
    CHANNELS.map(async ({ name, pages }) => {
      try {
        let before = null;
        for (let i = 0; i < pages; i++) {
          const { html, minId } = await fetchChannelPage(name, before);
          const msgs = parseMessages(html);

          if (debug && i === 0) {
            const starIconCount = (html.match(/icon-telegram-stars/g) || []).length;
            const reactionDivCount = (html.match(/tgme_widget_message_reactions/g) || []).length;
            const reactIdx = html.indexOf("tgme_reaction_paid");
            const starSample = reactIdx > -1 ? html.slice(Math.max(0, reactIdx - 50), reactIdx + 300) : null;
            debugInfo.push({ channel: name, found: msgs.length, minId, starIconCount, reactionDivCount, starSample, starsFound: msgs.filter(m => m.stars > 0).length });
          }

          msgs.forEach((p) => {
            const key = `${p.server}:${p.port}`;
            if (!seen.has(key)) {
              seen.add(key);
              allMessages.push(p);
            }
          });

          if (!minId) break;
          before = minId;
        }
      } catch (e) {
        if (debug) debugInfo.push({ channel: name, error: e.message });
      }
    })
  );

  // Сортируем по звёздам (больше = выше), берём топ 25
  const sorted = allMessages
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 25);

  if (debug) debugInfo.push({ total_found: allMessages.length, with_stars: allMessages.filter(p => p.stars > 0).length });

  res.json({
    updated: new Date().toISOString(),
    count: sorted.length,
    proxies: sorted,
    ...(debug && { debug: debugInfo }),
  });
}
