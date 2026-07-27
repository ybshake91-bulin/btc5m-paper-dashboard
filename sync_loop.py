from __future__ import annotations

import time
from datetime import datetime
from pathlib import Path

from publish import publish

LOG = Path(__file__).with_name("sync.log")


def log(message: str) -> None:
    with LOG.open("a", encoding="utf-8") as handle:
        handle.write(f"{datetime.now().isoformat()} {message}\n")


while True:
    try:
        log("published" if publish() else "unchanged")
    except Exception as exc:
        log(f"error {exc!r}")
    time.sleep(600)

