#!/bin/bash
# 터미널에서 직접 실행할 때 쓰는 스크립트.
# 서버가 뜨면(server/index.js) 코드가 알아서 기본 브라우저를 자동으로 연다.
#
# 사용법:
#   bash scripts/start.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

if [ ! -d node_modules ]; then
  echo "▶ 처음 실행이라 의존성을 설치합니다 (npm install)..."
  npm install
fi

if [ ! -f .env ]; then
  echo "⚠️  .env 파일이 없습니다. .env.example을 복사해 값을 채워주세요:"
  echo "   cp .env.example .env"
fi

npm start
