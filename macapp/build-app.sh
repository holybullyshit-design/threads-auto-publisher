#!/bin/bash
# 이 프로젝트를 바탕화면의 "스레드 자동 게시.app" 아이콘으로 감싸는 스크립트.
# 사용법: bash macapp/build-app.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_NAME="스레드 자동 게시"
DEST="$HOME/Desktop/${APP_NAME}.app"

CONTENTS_DIR="$DEST/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"

echo "▶ ${DEST} 생성 중..."

rm -rf "$DEST"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

# 1) 실행 스크립트: launcher.sh.template의 자리표시자를 실제 경로로 치환
LAUNCHER="$MACOS_DIR/ThreadsAutoPublisher"
sed "s#__PROJECT_DIR__#${PROJECT_DIR}#g" "$SCRIPT_DIR/launcher.sh.template" > "$LAUNCHER"
chmod +x "$LAUNCHER"

# 2) Info.plist
cat > "$CONTENTS_DIR/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key>
  <string>com.local.threads-auto-publisher</string>
  <key>CFBundleVersion</key>
  <string>1.0</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>ThreadsAutoPublisher</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.13</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

# 3) 아이콘 (있으면 사용, 없으면 건너뜀 -> 기본 앱 아이콘으로 표시됨)
if [ -f "$SCRIPT_DIR/AppIcon.icns" ]; then
  cp "$SCRIPT_DIR/AppIcon.icns" "$RESOURCES_DIR/AppIcon.icns"
fi

# Finder가 새 아이콘/앱을 바로 인식하도록 갱신
touch "$DEST"

echo "✅ 완료: 바탕화면에 \"${APP_NAME}.app\" 이 생성되었습니다."
echo "   더블클릭하면 Terminal 창이 열리며 서버가 실행되고, 브라우저가 자동으로 열립니다."
