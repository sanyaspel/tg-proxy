import re
import json
import socket
import requests
from datetime import datetime
from urllib.parse import urlparse, parse_qs, unquote
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import unescape

CHANNELS = [
    "ProxyMTProto",
    "mtpro_xyz",
    "FreeProxyMTProto",
]

TIMEOUT = 5
MAX_WORKERS = 30


def fetch_channel(channel):
    url = f"https://t.me/s/{channel}"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        return resp.text
    except Exception as e:
        print(f"[{channel}] fetch error: {e}")
        return ""


def parse_proxies(html):
    proxies = []

    # tg://proxy?server=...&port=...&secret=... links in HTML
    links = re.findall(r'tg://proxy\?[^"\'<>\s]+', unescape(html))
    for link in links:
        qs = parse_qs(link.split("?", 1)[1])
        server = qs.get("server", [None])[0]
        port = qs.get("port", [None])[0]
        secret = qs.get("secret", [None])[0]
        if server and port and secret:
            proxies.append({
                "server": unquote(server),
                "port": unquote(port),
                "secret": unquote(secret),
            })

    # Text format: Server: ... Port: ... Secret: ...
    blocks = re.findall(
        r"Server:\s*([^\s<\n]+).*?Port:\s*(\d+).*?Secret:\s*([a-zA-Z0-9+/=]{10,})",
        unescape(html),
        re.DOTALL | re.IGNORECASE,
    )
    for server, port, secret in blocks:
        proxies.append({"server": server.strip(), "port": port.strip(), "secret": secret.strip()})

    return proxies


def check_proxy(proxy):
    server = proxy["server"]
    port = proxy["port"]
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(TIMEOUT)
        result = sock.connect_ex((server, int(port)))
        sock.close()
        return result == 0
    except Exception:
        return False


def tg_link(proxy):
    return f"tg://proxy?server={proxy['server']}&port={proxy['port']}&secret={proxy['secret']}"


def main():
    print("Fetching channels...")
    raw_proxies = []

    for channel in CHANNELS:
        html = fetch_channel(channel)
        found = parse_proxies(html)
        print(f"  @{channel}: {len(found)} proxies found")
        raw_proxies.extend(found)

    # Deduplicate by server:port
    seen = set()
    unique = []
    for p in raw_proxies:
        key = f"{p['server']}:{p['port']}"
        if key not in seen:
            seen.add(key)
            unique.append(p)

    print(f"\nTotal unique: {len(unique)}, checking...")

    working = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {ex.submit(check_proxy, p): p for p in unique}
        for future in as_completed(futures):
            p = futures[future]
            if future.result():
                working.append(p)
                print(f"  ✓ {p['server']}:{p['port']}")

    print(f"\nWorking: {len(working)}/{len(unique)}")

    output = {
        "updated": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(working),
        "proxies": working,
    }

    with open("docs/proxies.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print("Saved to docs/proxies.json")


if __name__ == "__main__":
    main()
