#!/usr/bin/env python3
"""Parse torrent JSON data and analyze freeleech performance."""

import re
import sys
import json
import csv
from pathlib import Path

BASE_DIR = Path(__file__).parent

# TorrentLeech category ID -> (class, subcategory) mapping
CATEGORY_MAP = {
    # Movies
    1: ("movies", "Movies/Cam"),
    10: ("movies", "Movies/Screener"),
    11: ("movies", "Movies/DVD-R"),
    12: ("movies", "Movies/DVD-Rip"),
    13: ("movies", "Movies/BluRay"),
    14: ("movies", "Movies/XviD"),
    15: ("movies", "Movies/HD"),
    29: ("movies", "Movies/Documentary"),
    36: ("movies", "Movies/WebRip"),
    37: ("movies", "Movies/4K"),
    43: ("movies", "Movies/HDRip"),
    47: ("movies", "Movies/4K-UHD"),
    # TV
    2: ("tv", "TV/Episodes"),
    26: ("tv", "TV/Episodes HD"),
    27: ("tv", "TV/Boxsets"),
    32: ("tv", "TV/Episodes SD"),
    34: ("tv", "TV/Anime"),
    35: ("tv", "TV/Cartoons"),
    44: ("tv", "TV/Foreign"),
    # Games
    17: ("games", "Games/PC"),
    18: ("games", "Games/PS"),
    19: ("games", "Games/Xbox"),
    40: ("games", "Games/Nintendo"),
    42: ("games", "Games/Mac"),
    # Apps
    20: ("apps", "Apps/PC"),
    21: ("apps", "Apps/Mac"),
    22: ("apps", "Apps/Linux"),
    24: ("apps", "Apps/Mobile"),
    # Music
    16: ("music", "Music/Albums"),
    31: ("music", "Music/Singles"),
    46: ("music", "Music/Videos"),
    # Books
    45: ("books", "Books/EBooks"),
    # Education
    23: ("education", "Education"),
    38: ("education", "Education/Foreign"),
    # Other
    5: ("other", "Other/TV-Rips"),
    28: ("other", "Subtitles"),
    33: ("other", "Other/Foreign"),
    41: ("other", "Other/Boxsets"),
}


def bytes_to_gb(size_bytes):
    """Convert bytes to GB."""
    return size_bytes / (1024 ** 3)


def format_size(size_bytes):
    """Format byte size to human readable string."""
    gb = bytes_to_gb(size_bytes)
    if gb >= 1024:
        return "%.1f TiB" % (gb / 1024)
    elif gb >= 1:
        return "%.1f GiB" % gb
    else:
        return "%.1f MiB" % (gb * 1024)


def derive_fields(t):
    """Derive resolution, source, codec, HDR, and release group from the torrent name."""
    name = t.get("name", "") or t.get("filename", "")
    name_upper = name.upper()

    # Resolution
    res_match = re.search(r'(2160|1080|720|480|576|4320)[pPiI]', name)
    if res_match:
        t["resolution"] = res_match.group(1) + "p"
    elif "4K" in name_upper or "UHD" in name_upper:
        t["resolution"] = "2160p"
    else:
        t["resolution"] = "unknown"

    # Source
    if "BLURAY" in name_upper or "BLU-RAY" in name_upper or "BDREMUX" in name_upper:
        if "REMUX" in name_upper:
            t["source"] = "Remux"
        else:
            t["source"] = "BluRay"
    elif "WEB-DL" in name_upper:
        t["source"] = "WEB-DL"
    elif "WEBRIP" in name_upper or "WEB-RIP" in name_upper:
        t["source"] = "WEBRip"
    elif "HDTV" in name_upper:
        t["source"] = "HDTV"
    elif "REMUX" in name_upper:
        t["source"] = "Remux"
    elif "WEB" in name_upper:
        t["source"] = "WEB"
    elif "DVDRIP" in name_upper or "DVD-RIP" in name_upper:
        t["source"] = "DVDRip"
    else:
        t["source"] = "Other"

    # Codec
    if any(x in name_upper for x in ["H 265", "X265", "HEVC", "H.265"]):
        t["codec"] = "H.265"
    elif any(x in name_upper for x in ["H 264", "X264", "AVC", "H.264"]):
        t["codec"] = "H.264"
    elif "AV1" in name_upper:
        t["codec"] = "AV1"
    elif "XVID" in name_upper:
        t["codec"] = "XviD"
    else:
        t["codec"] = "Other"

    # HDR — use word-boundary regex to avoid false positives (e.g., "DVD", "ADVISE")
    has_dv = bool(re.search(r'\bDV\b', name_upper)) or "DOVI" in name_upper
    if has_dv and "HDR" in name_upper:
        t["hdr"] = "DV+HDR"
    elif has_dv:
        t["hdr"] = "DV"
    elif "HDR10+" in name_upper or "HDR10PLUS" in name_upper:
        t["hdr"] = "HDR10+"
    elif "HDR" in name_upper:
        t["hdr"] = "HDR"
    elif "SDR" in name_upper:
        t["hdr"] = "SDR"
    else:
        t["hdr"] = "None"

    # Release group (last segment after -)
    group_match = re.search(r'-([A-Za-z0-9]+?)(?:\.torrent)?$', t.get("filename", ""))
    if not group_match:
        group_match = re.search(r'-([A-Za-z0-9]+)(?:\s|$|\))', name)
    t["release_group"] = group_match.group(1) if group_match else "unknown"

    return t


def normalize_torrent(raw):
    """Convert a raw JSON torrent object into our standard analysis format."""
    cat_id = int(raw.get("categoryID", 0))
    cat_class, cat_sub = CATEGORY_MAP.get(cat_id, ("unknown", "Unknown (%d)" % cat_id))

    tags = [tag for tag in raw.get("tags", []) if tag != "FREELEECH"]

    size_bytes = int(raw.get("size", 0))

    t = {
        "torrent_id": int(raw.get("fid", 0)),
        "name": raw.get("name", "unknown"),
        "filename": raw.get("filename", ""),
        "category": cat_class,
        "category_id": cat_id,
        "subcategory": cat_sub,
        "size_bytes": size_bytes,
        "size_gb": bytes_to_gb(size_bytes),
        "size_str": format_size(size_bytes),
        "snatched": int(raw.get("completed", 0)),
        "seeders": int(raw.get("seeders", 0)),
        "leechers": int(raw.get("leechers", 0)),
        "comments": int(raw.get("numComments", 0)),
        "date": raw.get("addedTimestamp", "unknown"),
        "tags": tags,
        "genres": raw.get("genres", ""),
        "rating": float(raw.get("rating", 0)),
        "imdb_id": raw.get("imdbID", ""),
    }

    derive_fields(t)
    return t


def load_all_torrents(subdirs):
    """Load all torrents from JSON files in the given subdirectories."""
    base = BASE_DIR / "torrent-html"
    all_torrents = {}

    for subdir in subdirs:
        dir_path = base / subdir
        if not dir_path.exists():
            continue
        for json_file in sorted(dir_path.glob("p*.json")):
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            torrent_list = []
            if isinstance(data, list):
                torrent_list = data
            elif isinstance(data, dict):
                torrent_list = data.get("torrentList", [])

            for raw in torrent_list:
                t = normalize_torrent(raw)
                if t["torrent_id"] not in all_torrents:
                    all_torrents[t["torrent_id"]] = t

    return list(all_torrents.values())


def analyze(torrents, csv_filename="torrents_data.csv"):
    """Normalize torrents and export to CSV."""
    torrents.sort(key=lambda x: x["snatched"], reverse=True)

    csv_path = BASE_DIR / csv_filename
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "torrent_id", "name", "category", "category_id", "subcategory",
            "resolution", "source", "codec", "hdr", "release_group",
            "size_str", "size_gb", "snatched", "seeders", "leechers",
            "comments", "date", "tags", "genres", "rating", "imdb_id",
        ])
        writer.writeheader()
        for t in torrents:
            row = {k: v for k, v in t.items() if k in writer.fieldnames}
            row["tags"] = ", ".join(t["tags"])
            writer.writerow(row)

    print("Exported %d torrents to %s" % (len(torrents), csv_path))


SOURCES = {
    "freeleech": {
        "subdirs": ["freeleech"],
        "csv": "torrents_data_freeleech.csv",
    },
    "movies": {
        "subdirs": ["movies"],
        "csv": "torrents_data_movies.csv",
    },
    "tv": {
        "subdirs": ["tv"],
        "csv": "torrents_data_tv.csv",
    },
}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Parse and analyze torrent data")
    parser.add_argument(
        "source", nargs="?", choices=list(SOURCES.keys()),
        help="Data source to analyze",
    )
    args = parser.parse_args()

    if not args.source:
        parser.print_help()
        print("\nAvailable sources:")
        for name, cfg in SOURCES.items():
            print("  %-30s csv: %s" % (name, cfg["csv"]))
        sys.exit(1)

    cfg = SOURCES[args.source]
    torrents = load_all_torrents(subdirs=cfg["subdirs"])
    if not torrents:
        print("No torrent data found. Run: python3 scraper.py %s" % args.source)
    else:
        analyze(torrents, csv_filename=cfg["csv"])
