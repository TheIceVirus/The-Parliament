#!/bin/bash
# Mac launcher: double-click (the first time, right-click → Open).
cd "$(dirname "$0")"
( sleep 2; open "http://localhost:8666/" ) &
python3 server.py
