#!/usr/bin/env python3
"""Read-only Production Auth release gate; never writes Supabase settings.

python3 scripts/validate-production-auth.py --output <evidence.json> --exec <build command>
Existing CLI authentication stays in memory and is never passed to the build command.
"""
import argparse
import base64
import datetime
import http.client
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = "https://addi-gamma.vercel.app/"
PRODUCTION_REF = "joffvlsyxivveqycjrio"


def validate(config, environment):
    if config.get("site_url") != CANONICAL:
        raise ValueError("Production Site URL differs from the canonical URL")
    if environment.get("supabaseUrl") != f"https://{PRODUCTION_REF}.supabase.co":
        raise ValueError("Production Supabase environment differs from the approved project")
    if environment.get("callback") != CANONICAL + "auth/native/callback":
        raise ValueError("Production callback differs from the canonical URL")
    allowlist = set(config.get("uri_allow_list", "").split(","))
    for callback in [CANONICAL + "auth/callback", environment["callback"]]:
        if callback not in allowlist:
            raise ValueError("Required Production callback is missing from the redirect allowlist")
    for provider in ["google", "kakao"]:
        if config.get(f"external_{provider}_enabled") is not True:
            raise ValueError(f"Production {provider} provider is disabled")


def read_auth_config():
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not token:
        for account in ["supabase", "access-token"]:
            result = subprocess.run(
                ["security", "find-generic-password", "-s", "Supabase CLI", "-a", account, "-w"],
                capture_output=True, text=True, timeout=20,
            )
            if result.returncode == 0:
                token = result.stdout.strip()
                if token.startswith("go-keyring-base64:"):
                    token = base64.b64decode(token.split(":", 1)[1]).decode()
                break
    if not token:
        raise ValueError("Existing Supabase CLI authentication is unavailable; release stopped")
    # A fixed host and GET-only connection: no redirects or config mutation route.
    connection = http.client.HTTPSConnection("api.supabase.com", timeout=30)
    try:
        connection.request("GET", f"/v1/projects/{PRODUCTION_REF}/config/auth", headers={"Authorization": "Bearer " + token})
        response = connection.getresponse()
        if response.status != 200:
            response.read()
            raise ValueError(f"Auth config GET returned HTTP {response.status}; release stopped")
        return json.load(response)
    finally:
        connection.close()


def safe_url(value):
    parts = urlsplit(value or "")
    return f"{parts.scheme}://{parts.hostname or ''}{parts.path}"


def self_test():
    environment = {"supabaseUrl": f"https://{PRODUCTION_REF}.supabase.co", "callback": CANONICAL + "auth/native/callback"}
    good = {"site_url": CANONICAL, "uri_allow_list": CANONICAL + "auth/callback," + environment["callback"], "external_google_enabled": True, "external_kakao_enabled": True}
    validate(good, environment)
    failures = [
        ({**good, "site_url": "https://addi-kalummy0427-2332s-projects.vercel.app/"}, environment),
        ({**good, "site_url": CANONICAL.rstrip("/")}, environment),
        ({**good, "uri_allow_list": ""}, environment),
        ({**good, "external_kakao_enabled": False}, environment),
        (good, {**environment, "supabaseUrl": "https://ohobxicxchkaisxxswkk.supabase.co"}),
        (good, {**environment, "callback": "https://preview.invalid/auth/native/callback"}),
    ]
    for config, env in failures:
        try:
            validate(config, env)
        except ValueError:
            continue
        raise AssertionError("Unsafe configuration passed the release gate")
    # Exercise the command boundary without a network request or a real build.
    import contextlib
    import io
    from unittest.mock import patch

    with patch.object(sys, "argv", [__file__, "--exec", "fixture-build"]), \
            patch(__name__ + ".read_auth_config", return_value={**good, "site_url": "https://preview.invalid/"}), \
            patch.object(subprocess, "run") as child, contextlib.redirect_stdout(io.StringIO()):
        assert main() == 1
        child.assert_not_called()
    with patch.object(sys, "argv", [__file__, "--exec", "fixture-build"]), \
            patch(__name__ + ".read_auth_config", return_value=good), \
            patch.dict(os.environ, {"SUPABASE_ACCESS_TOKEN": "fixture-management-token"}), \
            patch.object(subprocess, "run") as child, contextlib.redirect_stdout(io.StringIO()):
        child.return_value.returncode = 0
        assert main() == 0
        assert "SUPABASE_ACCESS_TOKEN" not in child.call_args.kwargs["env"]
    with patch.object(sys, "argv", [__file__, "--native-build"]), \
            patch.dict(os.environ, {"ADDI_NATIVE_STAGE": "development"}), \
            patch(__name__ + ".read_auth_config") as read, contextlib.redirect_stdout(io.StringIO()):
        assert main() == 0
        read.assert_not_called()
    with patch.object(sys, "argv", [__file__, "--native-build"]), \
            patch.dict(os.environ, {"ADDI_NATIVE_STAGE": "unknown"}), \
            patch(__name__ + ".read_auth_config") as read, contextlib.redirect_stdout(io.StringIO()):
        assert main() == 1
        read.assert_not_called()
    print("Production Auth gate: 11/11 contract fixtures PASS; no network or mutation")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--native-build", action="store_true", help="Gate Production Native builds; skip Development builds")
    parser.add_argument("--exec", dest="command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.native_build:
        stage = os.environ.get("ADDI_NATIVE_STAGE")
        if stage == "development":
            print(json.dumps({"status": "SKIP", "stage": stage, "settings_mutations": 0}), flush=True)
            return 0
        if stage != "production":
            print(json.dumps({"status": "FAIL", "reason": "Explicit Native build stage required", "settings_mutations": 0}), flush=True)
            return 1
    report = {"observed_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "canonical_site_url": CANONICAL, "project_ref": PRODUCTION_REF, "method": "GET", "settings_mutations": 0}
    try:
        config = read_auth_config()
        report["site_url"] = safe_url(config.get("site_url"))
        report["redirect_url_count"] = len(config.get("uri_allow_list", "").split(","))
        report["google_enabled"] = config.get("external_google_enabled") is True
        report["kakao_enabled"] = config.get("external_kakao_enabled") is True
        environment = json.loads((ROOT / "apps/native/native-environments.json").read_text())["production"]
        validate(config, environment)
        report["status"] = "PASS"
    except Exception as error:
        report["status"] = "FAIL"
        report["reason"] = str(error) if isinstance(error, ValueError) else type(error).__name__
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False), flush=True)
    if report["status"] != "PASS":
        return 1
    if args.command:
        child_env = os.environ.copy()
        child_env.pop("SUPABASE_ACCESS_TOKEN", None)
        return subprocess.run(args.command, env=child_env, check=False).returncode
    return 0


if __name__ == "__main__":
    sys.exit(main())
