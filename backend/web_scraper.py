"""
==========================================================
AOS Web Scraper — Extract webpage data to CSV for bot training
==========================================================
Usage:
    python web_scraper.py <url> [--output <filename.csv>] [--mode <all|faq|tables|text>]

Examples:
    python web_scraper.py https://example.com/faq --mode faq
    python web_scraper.py https://en.wikipedia.org/wiki/Airline --mode text
    python web_scraper.py https://example.com/data --mode tables
    python web_scraper.py https://example.com --mode all --output training_data.csv
"""

import requests
from bs4 import BeautifulSoup
import csv
import os
import sys
import argparse
import re
from datetime import datetime
from urllib.parse import urljoin, urlparse


# =========================================================
# Configuration
# =========================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "..", "training_data")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

# Tags to strip from all scraped content
TAGS_TO_REMOVE = [
    "script", "style", "nav", "footer", "header",
    "aside", "form", "noscript", "iframe", "svg",
]


# =========================================================
# Utility helpers
# =========================================================
def clean_text(text: str) -> str:
    """Collapse whitespace and strip a string."""
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def fetch_page(url: str, retries: int = 3, backoff: int = 2) -> BeautifulSoup:
    """Fetch a URL and return a BeautifulSoup object. Retries on connection issues/resets."""
    print(f"\n{'='*60}")
    print(f"  Fetching: {url}")
    print(f"{'='*60}")

    import time
    response = None
    for attempt in range(1, retries + 1):
        try:
            response = requests.get(url, headers=HEADERS, timeout=30)
            response.raise_for_status()
            break
        except requests.exceptions.RequestException as e:
            err_msg = str(e).lower()
            is_conn_reset = "10054" in err_msg or "connection reset" in err_msg or "forcibly closed" in err_msg
            
            if attempt < retries:
                sleep_time = backoff * attempt
                reason = "Connection Reset (WinError 10054)" if is_conn_reset else "Network Error"
                print(f"  [WARNING] Attempt {attempt}/{retries} failed ({reason}): {e}")
                print(f"            Retrying in {sleep_time} seconds...")
                time.sleep(sleep_time)
            else:
                print(f"  [ERROR] All {retries} attempts failed to fetch: {e}")
                return None

    if response is None:
        return None

    soup = BeautifulSoup(response.text, "html.parser")

    # Remove unwanted tags
    for tag_name in TAGS_TO_REMOVE:
        for tag in soup.find_all(tag_name):
            tag.decompose()

    print(f"  [OK] Page fetched successfully ({len(response.text):,} bytes)")
    return soup



# =========================================================
# Extraction strategies
# =========================================================
def extract_text_content(soup: BeautifulSoup, source_url: str) -> list[dict]:
    """
    Extract heading → paragraph pairs.
    Good for articles, Wikipedia pages, documentation.
    """
    records = []
    current_heading = "Introduction"

    for element in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "p"]):
        tag = element.name
        text = clean_text(element.get_text())

        if not text:
            continue

        if tag.startswith("h"):
            current_heading = text
        elif tag == "p" and len(text) > 20:
            records.append({
                "source_url": source_url,
                "category": "text",
                "heading": current_heading,
                "content": text,
                "tag": tag,
            })

    print(f"  [TEXT] Extracted {len(records)} text blocks")
    return records


def extract_faq_pairs(soup: BeautifulSoup, source_url: str) -> list[dict]:
    """
    Extract FAQ-style Q&A pairs.
    Looks for: <details>/<summary>, dt/dd, elements with 'question'/'answer' classes,
    and heading + following paragraph patterns.
    """
    records = []

    # --- Strategy 1: <details> / <summary> ---
    for details in soup.find_all("details"):
        summary = details.find("summary")
        if summary:
            question = clean_text(summary.get_text())
            # Remove summary from details to get only the answer
            summary.decompose()
            answer = clean_text(details.get_text())
            if question and answer:
                records.append({
                    "source_url": source_url,
                    "category": "faq",
                    "question": question,
                    "answer": answer,
                })

    # --- Strategy 2: <dl> / <dt> / <dd> ---
    for dl in soup.find_all("dl"):
        dts = dl.find_all("dt")
        dds = dl.find_all("dd")
        for dt, dd in zip(dts, dds):
            q = clean_text(dt.get_text())
            a = clean_text(dd.get_text())
            if q and a:
                records.append({
                    "source_url": source_url,
                    "category": "faq",
                    "question": q,
                    "answer": a,
                })

    # --- Strategy 3: class-based (accordion, faq, question, answer) ---
    faq_patterns = re.compile(r"(faq|question|accordion|toggle)", re.IGNORECASE)

    faq_containers = soup.find_all(
        attrs={"class": faq_patterns}
    ) + soup.find_all(
        attrs={"id": faq_patterns}
    )

    for container in faq_containers:
        # Look for heading + paragraph/div pairs inside
        headings = container.find_all(["h2", "h3", "h4", "h5", "strong", "b"])
        for heading in headings:
            question = clean_text(heading.get_text())
            # Collect sibling text until the next heading
            answer_parts = []
            for sibling in heading.find_next_siblings():
                if sibling.name in ["h2", "h3", "h4", "h5", "strong", "b"]:
                    break
                text = clean_text(sibling.get_text())
                if text:
                    answer_parts.append(text)

            answer = " ".join(answer_parts)
            if question and answer:
                records.append({
                    "source_url": source_url,
                    "category": "faq",
                    "question": question,
                    "answer": answer,
                })

    # --- Strategy 4: heading + paragraph fallback ---
    if not records:
        for heading in soup.find_all(["h2", "h3", "h4"]):
            question = clean_text(heading.get_text())
            if not question or len(question) < 5:
                continue

            # Check if it looks like a question (has ? or starts with who/what/how etc.)
            question_words = ["who", "what", "when", "where", "why", "how",
                              "can", "do", "does", "is", "are", "will", "should"]
            is_question = (
                "?" in question
                or any(question.lower().startswith(w) for w in question_words)
            )

            if is_question:
                next_p = heading.find_next_sibling("p")
                if next_p:
                    answer = clean_text(next_p.get_text())
                    if answer and len(answer) > 15:
                        records.append({
                            "source_url": source_url,
                            "category": "faq",
                            "question": question,
                            "answer": answer,
                        })

    print(f"  [FAQ]  Extracted {len(records)} Q&A pairs")
    return records


def extract_tables(soup: BeautifulSoup, source_url: str) -> list[dict]:
    """
    Extract all HTML tables into row-based records.
    """
    records = []

    tables = soup.find_all("table")
    for table_idx, table in enumerate(tables, start=1):
        # Get table caption or nearby heading for context
        caption = table.find("caption")
        table_name = clean_text(caption.get_text()) if caption else ""

        if not table_name:
            prev_heading = table.find_previous(["h1", "h2", "h3", "h4"])
            table_name = clean_text(prev_heading.get_text()) if prev_heading else f"Table {table_idx}"

        # Extract headers
        header_row = table.find("thead")
        headers = []
        if header_row:
            headers = [clean_text(th.get_text()) for th in header_row.find_all(["th", "td"])]
        else:
            first_row = table.find("tr")
            if first_row:
                th_cells = first_row.find_all("th")
                if th_cells:
                    headers = [clean_text(th.get_text()) for th in th_cells]

        # Extract body rows
        rows = table.find_all("tr")
        for row in rows:
            cells = row.find_all(["td"])
            if not cells:
                continue

            cell_values = [clean_text(c.get_text()) for c in cells]

            # Build a readable string from the row
            if headers and len(headers) == len(cell_values):
                content = " | ".join(
                    f"{h}: {v}" for h, v in zip(headers, cell_values) if v
                )
            else:
                content = " | ".join(v for v in cell_values if v)

            if content:
                records.append({
                    "source_url": source_url,
                    "category": "table",
                    "table_name": table_name,
                    "content": content,
                    "raw_cells": "||".join(cell_values),
                })

    print(f"  [TABLE] Extracted {len(records)} table rows from {len(tables)} table(s)")
    return records


def extract_lists(soup: BeautifulSoup, source_url: str) -> list[dict]:
    """
    Extract ordered and unordered lists with their context headings.
    """
    records = []

    for list_tag in soup.find_all(["ul", "ol"]):
        # Skip nested lists (we'll get them via the parent)
        if list_tag.find_parent(["ul", "ol"]):
            continue

        # Find context heading
        prev_heading = list_tag.find_previous(["h1", "h2", "h3", "h4", "h5"])
        heading = clean_text(prev_heading.get_text()) if prev_heading else "General"

        items = list_tag.find_all("li", recursive=False)
        for item in items:
            text = clean_text(item.get_text())
            if text and len(text) > 10:
                records.append({
                    "source_url": source_url,
                    "category": "list",
                    "heading": heading,
                    "content": text,
                })

    print(f"  [LIST] Extracted {len(records)} list items")
    return records


# =========================================================
# CSV export
# =========================================================
def save_to_csv(records: list[dict], output_path: str) -> None:
    """Save extracted records to a CSV file."""
    if not records:
        print("\n  [WARNING] No records to save!")
        return

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Collect all unique fieldnames across records
    fieldnames = []
    for rec in records:
        for key in rec:
            if key not in fieldnames:
                fieldnames.append(key)

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(records)

    file_size = os.path.getsize(output_path)
    print(f"\n{'='*60}")
    print(f"  CSV saved successfully!")
    print(f"  Path   : {output_path}")
    print(f"  Records: {len(records)}")
    print(f"  Size   : {file_size:,} bytes")
    print(f"{'='*60}\n")


# =========================================================
# Multi-URL support
# =========================================================
def scrape_multiple_urls(urls: list[str], mode: str = "all") -> list[dict]:
    """Scrape multiple URLs and combine results."""
    all_records = []
    for url in urls:
        url = url.strip()
        if not url:
            continue
        records = scrape_url(url, mode)
        all_records.extend(records)
    return all_records


def scrape_url(url: str, mode: str = "all") -> list[dict]:
    """Scrape a single URL and return extracted records."""
    soup = fetch_page(url)
    if soup is None:
        print(f"  [WARNING] Skipping URL: {url} due to fetch failure.")
        return []
        
    records = []

    if mode in ("all", "text"):
        records.extend(extract_text_content(soup, url))

    if mode in ("all", "faq"):
        records.extend(extract_faq_pairs(soup, url))

    if mode in ("all", "tables"):
        records.extend(extract_tables(soup, url))

    if mode in ("all", "text"):
        records.extend(extract_lists(soup, url))

    return records


# =========================================================
# URL list file support
# =========================================================
def load_urls_from_file(filepath: str) -> list[str]:
    """Load URLs from a text file (one URL per line)."""
    urls = []
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                urls.append(line)
    print(f"  Loaded {len(urls)} URLs from {filepath}")
    return urls


# =========================================================
# Main CLI
# =========================================================
def main():
    parser = argparse.ArgumentParser(
        description="AOS Web Scraper — Extract webpage data to CSV for bot training",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python web_scraper.py https://example.com/faq --mode faq
  python web_scraper.py https://en.wikipedia.org/wiki/Airline --mode text
  python web_scraper.py https://example.com/data --mode tables
  python web_scraper.py https://example.com --mode all --output my_data.csv
  python web_scraper.py --url-file urls.txt --mode all
        """,
    )

    parser.add_argument(
        "url",
        nargs="?",
        help="URL to scrape (or use --url-file for multiple URLs)",
    )
    parser.add_argument(
        "--url-file",
        help="Path to a text file containing URLs (one per line)",
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Output CSV filename (default: auto-generated with timestamp)",
    )
    parser.add_argument(
        "--mode", "-m",
        choices=["all", "faq", "tables", "text"],
        default="all",
        help="Extraction mode (default: all)",
    )

    args = parser.parse_args()

    # Validate inputs
    if not args.url and not args.url_file:
        parser.print_help()
        print("\n  [ERROR] Please provide a URL or --url-file")
        sys.exit(1)

    # Collect URLs
    urls = []
    if args.url_file:
        urls = load_urls_from_file(args.url_file)
    if args.url:
        urls.insert(0, args.url)

    if not urls:
        print("  [ERROR] No URLs to scrape.")
        sys.exit(1)

    # Generate output filename
    if args.output:
        output_filename = args.output
    else:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        domain = urlparse(urls[0]).netloc.replace(".", "_").replace(":", "_")
        output_filename = f"scraped_{domain}_{args.mode}_{timestamp}.csv"

    output_path = os.path.join(OUTPUT_DIR, output_filename)

    # Run scraper
    print(f"\n  Mode  : {args.mode}")
    print(f"  URLs  : {len(urls)}")
    print(f"  Output: {output_path}")

    all_records = scrape_multiple_urls(urls, mode=args.mode)

    # Save to CSV
    save_to_csv(all_records, output_path)

    # Print summary
    categories = {}
    for rec in all_records:
        cat = rec.get("category", "unknown")
        categories[cat] = categories.get(cat, 0) + 1

    print("  Summary by category:")
    for cat, count in sorted(categories.items()):
        print(f"    {cat:10s} : {count} records")


if __name__ == "__main__":
    main()
