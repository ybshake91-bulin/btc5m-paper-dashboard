from __future__ import annotations

import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = Path(__file__).resolve().parent
STATIC = ROOT / "dashboard" / "static"
sys.path.insert(0, str(ROOT))

from dashboard.server import dashboard_payload  # noqa: E402


def run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        args, cwd=PUBLIC, text=True, capture_output=True, check=False)


def build() -> None:
    for name in ("index.html", "styles.css", "app.js"):
        shutil.copy2(STATIC / name, PUBLIC / name)
    (PUBLIC / ".nojekyll").touch()
    data_dir = PUBLIC / "data"
    data_dir.mkdir(exist_ok=True)
    payload = dashboard_payload()
    payload["publishedAt"] = datetime.now(timezone.utc).isoformat()
    (data_dir / "dashboard.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def publish() -> bool:
    build()
    run("git", "add", "index.html", "styles.css", "app.js", ".nojekyll",
        "data/dashboard.json")
    if run("git", "diff", "--cached", "--quiet").returncode == 0:
        return False
    stamp = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M")
    commit = run("git", "commit", "-m", f"Update dashboard {stamp}")
    if commit.returncode != 0:
        raise RuntimeError(commit.stderr or commit.stdout)
    pushed = run("git", "push", "origin", "main")
    if pushed.returncode != 0:
        raise RuntimeError(pushed.stderr or pushed.stdout)
    return True


if __name__ == "__main__":
    print("published" if publish() else "unchanged")

