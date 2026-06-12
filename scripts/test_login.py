#!/usr/bin/env python3
"""
Schnelltest: Supabase Password-Login (wie TrophyBase-Frontend signInWithPassword).

Verwendung (Passwörter nicht im Skript speichern):
  set TROPHYBASE_MASTER_PASSWORD=dein_master_passwort
  set TROPHYBASE_TESTER_PASSWORD=dein_tester_passwort
  python scripts/test_login.py

Optional einzelne Accounts:
  python scripts/test_login.py --master-password "..." --tester-password "..."
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import requests

# Gleiche Werte wie src/pages/supabaseClient.js
SUPABASE_URL = "https://vnwuelnvzhptjcsleuag.supabase.co"
SUPABASE_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZud3VlbG52emhwdGpjc2xldWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTExNzIsImV4cCI6MjA5NDU4NzE3Mn0."
    "UU-WI1nCr6EHDFb1s3-Hs44kHIIoMrert3V0z22Bqu0"
)

LOGIN_ENDPOINT = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"

ACCOUNTS = [
    ("Master (soll funktionieren)", "master@trophybase.app"),
    ("Tester (manuelle Anlage)", "tester@trophybase.app"),
]


def try_login(label: str, email: str, password: str) -> None:
    print("=" * 72)
    print(f"Account: {label}")
    print(f"E-Mail:  {email}")
    print(f"URL:     {LOGIN_ENDPOINT}")
    print("-" * 72)

    if not password:
        print("HTTP-Status: (übersprungen – kein Passwort gesetzt)")
        print("JSON-Antwort: null")
        print()
        return

    response = requests.post(
        LOGIN_ENDPOINT,
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
        },
        json={"email": email, "password": password},
        timeout=30,
    )

    print(f"HTTP-Status: {response.status_code}")

    try:
        body = response.json()
        print("JSON-Antwort:")
        print(json.dumps(body, indent=2, ensure_ascii=False))
    except ValueError:
        print("JSON-Antwort: (kein JSON)")
        print(response.text)
    print()


def main() -> int:
    parser = argparse.ArgumentParser(description="TrophyBase Supabase Login-Test")
    parser.add_argument(
        "--master-password",
        default=os.environ.get("TROPHYBASE_MASTER_PASSWORD", ""),
        help="Passwort für master@trophybase.app (oder Env TROPHYBASE_MASTER_PASSWORD)",
    )
    parser.add_argument(
        "--tester-password",
        default=os.environ.get("TROPHYBASE_TESTER_PASSWORD", ""),
        help="Passwort für tester@trophybase.app (oder Env TROPHYBASE_TESTER_PASSWORD)",
    )
    args = parser.parse_args()

    passwords = {
        "master@trophybase.app": args.master_password,
        "tester@trophybase.app": args.tester_password,
    }

    missing = [email for email, pw in passwords.items() if not pw]
    if missing:
        print(
            "Hinweis: Passwort fehlt für:",
            ", ".join(missing),
            file=sys.stderr,
        )
        print(
            "Setze TROPHYBASE_MASTER_PASSWORD / TROPHYBASE_TESTER_PASSWORD "
            "oder nutze --master-password / --tester-password.",
            file=sys.stderr,
        )
        print(file=sys.stderr)

    for label, email in ACCOUNTS:
        try_login(label, email, passwords[email])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
