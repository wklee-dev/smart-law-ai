#!/usr/bin/env python3
"""Compatibility entry point for the page-based examples in the design."""
import sys
from run import main

if __name__ == '__main__':
    sys.exit(main(['crawl', *sys.argv[1:]]))
