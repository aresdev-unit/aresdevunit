import { NextResponse } from 'next/server';

const SCRIPT = `#!/bin/bash
set -e

echo "=== AresDevUnit Hub CLI 설치 ==="

# Node.js 확인
if ! command -v node &> /dev/null; then
  echo "Error: Node.js가 필요합니다 (20 이상)"
  exit 1
fi

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 20 ]; then
  echo "Error: Node.js 20 이상이 필요합니다 (현재: $(node -v))"
  exit 1
fi

# Git 확인
if ! command -v git &> /dev/null; then
  echo "Error: Git이 필요합니다"
  exit 1
fi

# 설치 경로
INSTALL_DIR="\${HOME}/.aresdevunit/cli"

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "→ 기존 설치 감지, 업데이트 중..."
  cd "$INSTALL_DIR"
  git pull
else
  echo "→ 다운로드 중..."
  git clone https://github.com/aresdev-unit/aresdevunit.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

echo "→ 의존성 설치..."
cd packages/cli
npm install --production=false 2>/dev/null || npm install

echo "→ 빌드..."
npm run build

echo "→ 글로벌 등록..."
if npm link 2>/dev/null; then
  :
else
  echo "→ 권한이 필요합니다. sudo로 재시도..."
  sudo npm link
fi

echo ""
echo "=== 설치 완료! ==="
echo "  aresdevhubcli --version"
echo "  aresdevhubcli login"
echo ""
`;

export async function GET() {
  return new NextResponse(SCRIPT, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
