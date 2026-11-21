#!/usr/bin/env python3
"""
Delegates publishing of MAICXEN-flasher and the unified ecosystem
to the root orchestrator (../../../scripts/ecosystem_sync.py --publish).
"""
import os
import subprocess
import sys

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
SYNC_SCRIPT = os.path.join(ROOT_DIR, "scripts", "ecosystem_sync.py")

if __name__ == "__main__":
    subprocess.run([sys.executable, SYNC_SCRIPT, "--publish"], check=True)
