#!/usr/bin/env python3
"""
Scrape torrent data from TorrentLeech.

Uses TL's internal JSON API (/torrents/browse/list) directly.

Setup:
    pip3 install requests python-dotenv

    Create a .env file:
        TL_USERNAME="your_username"
        TL_PASSWORD="your_password"

Usage:
    python3 scraper.py freeleech
    python3 scraper.py freeleech --days 90
    python3 scraper.py movies --days 60 --start-page 20
    python3 scraper.py tv --days 30
    python3 scraper.py freeleech --debug
"""

import os
import sys
import json
import time
import argparse
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import quote

try:
    import requests
except ImportError:
    print("Missing dependency. Install with: pip3 install requests")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

BASE_URL = "https://www.torrentleech.org"
LOGIN_URL = BASE_URL + "/user/account/login/"
API_BASE = "/torrents/browse/list"

# Category definitions: facets string and output directory name
CATEGORIES = {
    "freeleech": {
        "facets": quote("tags:FREELEECH", safe=""),
        "output_dir": "freeleech",
    },
    "movies": {
        "facets": quote("cat:Movies", safe=""),
        "output_dir": "movies",
    },
    "tv": {
        "facets": quote("cat:TV", safe=""),
        "output_dir": "tv",
    },
}


# --- Session / Auth ---

def create_session():
    """Create a requests session with browser-like headers."""
    session = requests.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json, text/html, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "X-Requested-With": "XMLHttpRequest",
    })
    return session


def login(session, username, password):
    """Log in to TorrentLeech."""
    print("Logging in as '%s'..." % username)

    # GET login page first for cookies
    session.get(LOGIN_URL, timeout=30)

    resp = session.post(LOGIN_URL, data={
        "username": username,
        "password": password,
    }, timeout=30, allow_redirects=True)
    resp.raise_for_status()

    if "/user/account/login" in resp.url or "Invalid Username" in resp.text:
        print("ERROR: Login failed. Check your username and password.")
        sys.exit(1)

    print("Login successful!\n")


def load_cookies(session, cookies_str):
    """Load cookies from a raw cookie header string."""
    for pair in cookies_str.split(";"):
        pair = pair.strip()
        if "=" in pair:
            name, value = pair.split("=", 1)
            session.cookies.set(name.strip(), value.strip())


def authenticate(session, args):
    """Handle authentication from args/env."""
    cookies = args.cookies or os.environ.get("TL_COOKIES")
    if cookies:
        print("Using provided cookies.\n")
        load_cookies(session, cookies)
    else:
        username = args.username or os.environ.get("TL_USERNAME")
        password = args.password or os.environ.get("TL_PASSWORD")
        if not username or not password:
            print("ERROR: No credentials provided.\n")
            print("Create a .env file with:")
            print('  TL_USERNAME="your_username"')
            print('  TL_PASSWORD="your_password"')
            print()
            print("Or pass --username/--password or --cookies on the command line.")
            sys.exit(1)
        login(session, username, password)


# --- API ---

def build_api_url(facets, orderby, order, page):
    """Build the JSON API URL for given facets, sort, and page."""
    path = "%s/facets/%s/orderby/%s/order/%s/page/%d" % (
        API_BASE, facets, orderby, order, page
    )
    return BASE_URL + path


def send_raw_url(session, url):
    """Send a GET request without requests normalizing/decoding the URL."""
    req = requests.Request("GET", url)
    prepared = session.prepare_request(req)
    prepared.url = url
    return session.send(prepared, timeout=30)


def extract_torrents(data):
    """Extract the torrent list from an API response."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ["torrentList", "torrents", "results", "data"]:
            if key in data and isinstance(data[key], list):
                return data[key]
        if "numFound" in data:
            return data.get("torrentList", [])
    return []


def fetch_api_page(session, facets, orderby, order, page):
    """Fetch one page from the JSON API. Returns parsed JSON or None."""
    url = build_api_url(facets, orderby, order, page)
    resp = send_raw_url(session, url)
    resp.raise_for_status()

    if "/user/account/login" in resp.url:
        print("ERROR: Session expired — redirected to login.")
        sys.exit(1)

    try:
        return resp.json()
    except (json.JSONDecodeError, ValueError):
        return None


def parse_torrent_date(torrent):
    """Parse the added date from a torrent. Returns datetime (UTC) or None."""
    added = torrent.get("addedTimestamp") or torrent.get("added")
    if added is None:
        return None

    if isinstance(added, (int, float)):
        return datetime.fromtimestamp(added, tz=timezone.utc)
    elif isinstance(added, str):
        try:
            added_dt = datetime.fromisoformat(added.replace("Z", "+00:00"))
            if added_dt.tzinfo is None:
                added_dt = added_dt.replace(tzinfo=timezone.utc)
            return added_dt
        except ValueError:
            try:
                return datetime.fromtimestamp(float(added), tz=timezone.utc)
            except ValueError:
                return None
    return None


def torrent_is_within_days(torrent, days, reference_date=None):
    """Check if a torrent was added within N days of the reference date.

    If reference_date is None, uses the current time.
    """
    added_dt = parse_torrent_date(torrent)
    if added_dt is None:
        return True

    if reference_date is None:
        reference_date = datetime.now(timezone.utc)

    cutoff = reference_date - timedelta(days=days)
    return added_dt >= cutoff


# --- Scraping ---

def scrape(session, facets, out_dir, days, delay, start_page, debug):
    """Scrape pages sorted by date desc, stopping when torrents exceed --days."""
    # Clear prior results
    if out_dir.exists():
        for old_file in out_dir.glob("*.json"):
            old_file.unlink()
    out_dir.mkdir(parents=True, exist_ok=True)

    all_torrents = []
    page_count = 0
    page = start_page
    reference_date = None  # set from first torrent found

    while True:
        if page > start_page:
            time.sleep(delay)

        data = fetch_api_page(session, facets, "added", "desc", page)

        if data is None:
            print("    Page %2d: no valid response — stopping." % page)
            break

        torrents = extract_torrents(data)

        if not torrents:
            print("    Page %2d: empty — no more results." % page)
            break

        # Set reference date from the first torrent on the first page
        if reference_date is None:
            for t in torrents:
                dt = parse_torrent_date(t)
                if dt is not None:
                    reference_date = dt
                    print("    Reference date (newest torrent): %s" % reference_date.strftime("%Y-%m-%d %H:%M:%S"))
                    print("    Cutoff (%d days back): %s" % (days, (reference_date - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")))
                    break
            if reference_date is None:
                reference_date = datetime.now(timezone.utc)

        if debug:
            first = torrents[0]
            print("    DEBUG p%d first: %s | added: %s | size: %s | seeders: %s | leechers: %s | snatched: %s" % (
                page,
                (first.get("name", "?"))[:60],
                first.get("addedTimestamp", first.get("added", "?")),
                first.get("size", "?"),
                first.get("seeders", "?"),
                first.get("leechers", "?"),
                first.get("completed", "?"),
            ))

        # Filter and stop when we hit old torrents
        kept = []
        hit_old = False
        for t in torrents:
            if torrent_is_within_days(t, days, reference_date):
                kept.append(t)
            else:
                hit_old = True
                break

        all_torrents.extend(kept)
        page_count += 1
        print("    Page %2d: %d torrents (%d kept)" % (page, len(torrents), len(kept)))

        # Save raw JSON per page
        json_path = out_dir / ("p%d.json" % page)
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        if hit_old:
            print("    Reached torrents older than %d days — stopping." % days)
            break

        page += 1

    # Save combined JSON
    combined_path = out_dir / "all_torrents.json"
    with open(combined_path, "w", encoding="utf-8") as f:
        json.dump(all_torrents, f, indent=2, ensure_ascii=False)

    print("    Fetched %d pages, %d torrents total." % (page_count, len(all_torrents)))
    print("    Combined data: %s" % combined_path)

    return all_torrents


def main():
    parser = argparse.ArgumentParser(
        description="Scrape TorrentLeech torrent data"
    )
    parser.add_argument(
        "category", nargs="?", choices=list(CATEGORIES.keys()),
        help="Category to scrape",
    )
    parser.add_argument(
        "--days", type=int, default=30,
        help="Number of days to capture (default: 30)",
    )
    parser.add_argument(
        "--start-page", type=int, default=1,
        help="Page to start from (default: 1, useful for resuming)",
    )
    parser.add_argument(
        "--delay", type=float, default=1.0,
        help="Seconds between requests (default: 1.0)",
    )
    parser.add_argument(
        "--output", type=str, default="torrent-html",
        help="Base output directory (default: torrent-html)",
    )
    parser.add_argument(
        "--username", type=str, default=None,
        help="TL username (or set TL_USERNAME env var)",
    )
    parser.add_argument(
        "--password", type=str, default=None,
        help="TL password (or set TL_PASSWORD env var)",
    )
    parser.add_argument(
        "--cookies", type=str, default=None,
        help="Skip login — use cookie string directly (or set TL_COOKIES env var)",
    )
    parser.add_argument(
        "--debug", action="store_true",
        help="Show first torrent details per page",
    )
    parser.add_argument(
        "--dump-api", action="store_true",
        help="Fetch one page and dump the full raw API response, then exit",
    )
    args = parser.parse_args()

    if not args.category:
        parser.print_help()
        print("\nAvailable categories:")
        for name in CATEGORIES:
            print("  %s" % name)
        sys.exit(1)

    session = create_session()
    authenticate(session, args)

    cat = CATEGORIES[args.category]

    if args.dump_api:
        url = build_api_url(cat["facets"], "added", "desc", args.start_page)
        print("URL: %s\n" % url)
        resp = send_raw_url(session, url)
        print("Status: %d" % resp.status_code)
        print("Content-Type: %s\n" % resp.headers.get("Content-Type", "unknown"))
        try:
            data = resp.json()
            print(json.dumps(data, indent=2, ensure_ascii=False)[:5000])
            if isinstance(data, dict):
                print("\n--- Top-level keys: %s" % list(data.keys()))
                for k, v in data.items():
                    if isinstance(v, list):
                        print("    '%s': list with %d items" % (k, len(v)))
                    elif isinstance(v, (int, float, str, bool)):
                        print("    '%s': %s" % (k, repr(v)))
        except (json.JSONDecodeError, ValueError):
            print(resp.text[:5000])
        sys.exit(0)

    out_dir = Path(args.output) / cat["output_dir"]

    print("--- %s (last %d days) ---" % (args.category, args.days))
    print("    Saving to: %s/" % out_dir)

    scrape(session, cat["facets"], out_dir, args.days, args.delay,
           args.start_page, args.debug)

    print("\nRun: python3 parse_and_analyze.py %s" % args.category)


if __name__ == "__main__":
    main()
