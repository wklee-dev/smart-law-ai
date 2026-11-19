# -*- coding: utf-8 -*-
"""Network / DNS self-check.

Run this first when a collection fails with
    [Errno 11001] getaddrinfo failed  /  Failed to resolve 'tt.go.kr'
It separates "the site is down" from "this PC cannot resolve or reach the site".
"""
from __future__ import annotations

import os
import platform
import socket
import sys
from urllib.parse import urlparse

TIMEOUT = 15

GUIDE = """
----------------------------------------------------------------------------
Troubleshooting checklist
----------------------------------------------------------------------------
1) Open https://tt.go.kr in a web browser on this PC.

2) If the browser ALSO fails, this PC has a DNS / internet problem (not the tool):
     - ipconfig /flushdns
     - nslookup tt.go.kr 8.8.8.8        (test a public DNS server)
     - check VPN, corporate proxy, and security software
     - try another network (mobile hotspot) to isolate the cause

3) If the browser WORKS but this tool fails, the network path of python.exe is
   blocked:
     - Allow python.exe in Windows Defender Firewall (private + public)
     - Allow python.exe in antivirus / endpoint security software
     - Re-run this file after the change

4) Workaround when only one host name resolves: set the other one in config.ini
     [network]
     base_url     = https://www.tt.go.kr
     base_url_alt = https://tt.go.kr

5) Corporate network without direct internet access:
     set HTTPS_PROXY=http://<proxy-host>:<port>
     then run the batch file again.
----------------------------------------------------------------------------
"""


def _resolve(host: str) -> list:
    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
        return sorted({i[4][0] for i in infos})
    except Exception as e:  # noqa: BLE001
        return ["<FAILED: %s>" % e]


def _http_test(url: str) -> str:
    try:
        import requests
    except Exception as e:  # noqa: BLE001
        return "requests not installed (%s)" % e
    try:
        r = requests.get(
            url,
            timeout=TIMEOUT,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Accept-Language": "ko-KR,ko;q=0.9",
            },
        )
        return "HTTP %s  (%s bytes)" % (r.status_code, len(r.content))
    except Exception as e:  # noqa: BLE001
        return "FAILED: %s: %s" % (type(e).__name__, e)


def run_net_check(cfg, logger=None) -> int:
    print("")
    print("=" * 78)
    print(" NETWORK SELF-CHECK")
    print("=" * 78)
    print(" Python   : %s" % sys.version.split()[0])
    print(" Platform : %s" % platform.platform())
    print("")

    print("[Environment]")
    proxy_vars = ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "NO_PROXY")
    found = False
    for v in proxy_vars:
        val = os.environ.get(v)
        if val:
            found = True
            print("   %-12s = %s" % (v, val))
    if not found:
        print("   (no proxy environment variables set)")

    bases = getattr(cfg, "base_urls", None) or [cfg.base_url]
    ok_any = False

    for base in bases:
        host = urlparse(base).hostname or base
        print("")
        print("[Host] %s" % host)
        ips = _resolve(host)
        for ip in ips:
            print("   DNS      : %s" % ip)
        resolved = all(not str(i).startswith("<FAILED") for i in ips)
        if not resolved:
            print("   HTTP     : skipped (DNS resolution failed)")
            continue

        test_url = base.rstrip("/") + "/mUser/dem/demList.do?semok=90&pageNumber=1"
        result = _http_test(test_url)
        print("   HTTP     : %s" % result)
        print("   URL      : %s" % test_url)
        if result.startswith("HTTP 200"):
            ok_any = True

    print("")
    print("=" * 78)
    if ok_any:
        print(" RESULT : OK - at least one host is reachable. Collection can run.")
        print("          If the main base_url fails, the tool switches to base_url_alt")
        print("          automatically (see [network] in config.ini).")
        print("=" * 78)
        return 0

    print(" RESULT : FAILED - no host could be reached from this PC.")
    print(GUIDE)
    return 1
