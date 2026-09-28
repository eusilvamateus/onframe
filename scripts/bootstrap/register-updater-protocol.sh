#!/bin/sh

set -eu

INSTALL_ROOT="${ONFRAME_HOME:-$HOME/Library/Application Support/OnFrame}"
APP_PATH="$HOME/Applications/OnFrame Updater.app"
CONTENTS="$APP_PATH/Contents"
EXECUTABLE="$CONTENTS/MacOS/OnFrameUpdater"

mkdir -p "$CONTENTS/MacOS"
cat > "$CONTENTS/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleExecutable</key><string>OnFrameUpdater</string>
  <key>CFBundleIdentifier</key><string>com.onblide.onframe.updater</string>
  <key>CFBundleName</key><string>OnFrame Updater</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleURLTypes</key><array><dict>
    <key>CFBundleURLName</key><string>OnFrame Updater</string>
    <key>CFBundleURLSchemes</key><array><string>onframe-updater</string></array>
  </dict></array>
</dict></plist>
PLIST
cat > "$EXECUTABLE" <<EOF
#!/bin/sh
set -eu
case "\${1:-onframe-updater://update}" in
  onframe-updater://update*) ;;
  *) exit 1 ;;
esac
exec /bin/sh "$INSTALL_ROOT/scripts/bootstrap/update.sh"
EOF
chmod 700 "$EXECUTABLE"

LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [ -x "$LSREGISTER" ]; then
  "$LSREGISTER" -f "$APP_PATH" >/dev/null 2>&1 || true
fi
printf 'Protocolo onframe-updater://update registrado.\n'
