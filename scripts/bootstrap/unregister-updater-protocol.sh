#!/bin/sh

set -eu

APP_PATH="$HOME/Applications/OnFrame Updater.app"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [ -x "$LSREGISTER" ] && [ -d "$APP_PATH" ]; then
  "$LSREGISTER" -u "$APP_PATH" >/dev/null 2>&1 || true
fi
rm -rf "$APP_PATH"
printf 'Protocolo onframe-updater://update removido.\n'
