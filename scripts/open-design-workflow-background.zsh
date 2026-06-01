#!/bin/zsh

set -e

PROJECT_DIR="/Users/zhangqiang/ai-design-studio"
PORT="3001"
URL="http://127.0.0.1:${PORT}/"
LOG_FILE="/tmp/ai-design-studio-${PORT}.log"

if lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  open "${URL}"
  exit 0
fi

cd "${PROJECT_DIR}"

if [ ! -d "node_modules" ]; then
  /usr/bin/env npm install >> "${LOG_FILE}" 2>&1
fi

/usr/bin/env nohup npm run dev -- -p "${PORT}" >> "${LOG_FILE}" 2>&1 &

for i in {1..60}; do
  if lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
    open "${URL}"
    exit 0
  fi
  sleep 1
done

open "${URL}"
