// Telegram-каналы (1 страница ≈ 20 сообщений)
const CHANNELS = [
  { name: "ProxyMTProto", pages: 6 },
  { name: "mtpro_xyz", pages: 3 },
];

// GitHub-репозитории с готовыми списками прокси (обновляются каждые 12 часов)
const GITHUB_SOURCES = [
  "https://raw.githubusercontent.com/ALIILAPRO/MTProtoProxy/main/mtproto.txt",
  "https://raw.githubusercontent.com/SoliSpirit/mtproto/master/all_proxies.txt",
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

// Парсим Telegram-канал с привязкой прокси к звёздам
function parseMessages(html) {
  const results = [];
  const seen = new Set();
  const blocks = html.split(/(?=<div[^>]+data-post=")/);

  for (const block of blocks) {
    if (!block.includes("data-post=")) continue;

    const proxies = [];
    const webRe = /https?:\/\/t\.me\/proxy\?[^"'\s<>]+/g;
    const tgRe = /tg:\/\/proxy\?[^"'\s<>]+/g;
    let m;

    while ((m = webRe.exec(block)) !== null) {
      try { const p = parseProxiesFromUrl(m[0]); if (p) proxies.push(p); } catch {}
    }
    while ((m = tgRe.exec(block)) !== null) {
      try { const p = parseProxiesFromUrl(m[0].replace("tg://proxy?", "https://t.me/proxy?")); if (p) proxies.push(p); } catch {}
    }

    if (proxies.length === 0) continue;

    let stars = 0;
    const starsMatch = block.match(/icon-telegram-stars[^<]*<\/i>\s*(\d+)/);
    if (starsMatch) stars = parseInt(starsMatch[1]);

    proxies.forEach((p) => {
      const key = `${p.server}:${p.port}`;
      if (!seen.has(key)) { seen.add(key); results.push({ ...p, stars }); }
    });
  }
  return results;
}

// Парсим GitHub-источник (каждая строка — ссылка t.me/proxy?...)
async function fetchGithubSource(url) {
  const res = await fetch(url, { headers: { "User-Agent": HEADERS["User-Agent"] } });
  const text = await res.text();
  const proxies = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.includes("t.me/proxy?")) continue;
    try {
      const p = parseProxiesFromUrl(trimmed);
      if (p) proxies.push({ ...p, stars: 0 });
    } catch {}
  }
  return proxies;
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
  const allProxies = [];
  const seen = new Set();
  const debugInfo = [];

  // Собираем из Telegram-каналов и GitHub параллельно
  const [channelResults, githubResults] = await Promise.all([
    // Telegram каналы
    Promise.all(CHANNELS.map(async ({ name, pages }) => {
      const msgs = [];
      try {
        let before = null;
        for (let i = 0; i < pages; i++) {
          const { html, minId } = await fetchChannelPage(name, before);
          const found = parseMessages(html);
          msgs.push(...found);
          if (debug && i === 0) debugInfo.push({ channel: name, found: found.length, minId });
          if (!minId) break;
          before = minId;
        }
      } catch (e) {
        if (debug) debugInfo.push({ channel: name, error: e.message });
      }
      return msgs;
    })),

    // GitHub источники
    Promise.all(GITHUB_SOURCES.map(async (url) => {
      try {
        const proxies = await fetchGithubSource(url);
        if (debug) debugInfo.push({ github: url.split("/").slice(-3).join("/"), found: proxies.length });
        return proxies;
      } catch (e) {
        if (debug) debugInfo.push({ github: url, error: e.message });
        return [];
      }
    })),
  ]);

  // Telegram-каналы в приоритете (свежие), потом GitHub
  const telegramProxies = channelResults.flat();
  const githubProxies = githubResults.flat();

  for (const p of [...telegramProxies, ...githubProxies]) {
    const key = `${p.server}:${p.port}`;
    if (!seen.has(key)) { seen.add(key); allProxies.push(p); }
  }

  const result = allProxies.slice(0, 40);

  if (debug) debugInfo.push({ total_tg: telegramProxies.length, total_github: githubProxies.length, total_unique: allProxies.length });

  res.json({
    updated: new Date().toISOString(),
    count: result.length,
    proxies: result,
    ...(debug && { debug: debugInfo }),
  });
}
