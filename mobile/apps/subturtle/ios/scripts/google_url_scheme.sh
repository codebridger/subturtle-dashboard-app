#!/bin/sh
# Scheme pre-action (Runner.xcscheme, before Build). Writes
# Flutter/DartDefines.xcconfig with GOOGLE_REVERSED_CLIENT_ID, the URL scheme
# Google sign-in returns to (Info.plist reads it). It follows the Dart defines
# of the build, so dev and prod builds each get their own iOS client:
#   GOOGLE_IOS_CLIENT_ID given  -> its reversed form
#   API_BASE_URL is the prod API -> the prod iOS client
#   anything else                -> the dev iOS client (also the default in Debug/Release.xcconfig)
# Keep the ids in step with AppConfig in lib/app/config.dart.

DEV_REVERSED="com.googleusercontent.apps.466506592387-14p1j715ifm1ag1qva3k1dh3ro4c88ci"
PROD_REVERSED="com.googleusercontent.apps.245138511605-5vr7dnonm8rgg56du01v8i430ia7t0g1"
PROD_API="https://subturtle-api-245138511605.europe-west4.run.app"

ios_id=""
api=""
# DART_DEFINES is a comma-separated list of base64 "NAME=value" entries.
for entry in $(echo "${DART_DEFINES:-}" | tr ',' ' '); do
  pair=$(echo "$entry" | base64 --decode 2>/dev/null)
  case "$pair" in
    GOOGLE_IOS_CLIENT_ID=*) ios_id="${pair#*=}" ;;
    API_BASE_URL=*) api="${pair#*=}" ;;
  esac
done

if [ -n "$ios_id" ]; then
  reversed="com.googleusercontent.apps.${ios_id%.apps.googleusercontent.com}"
elif [ "$api" = "$PROD_API" ]; then
  reversed="$PROD_REVERSED"
else
  reversed="$DEV_REVERSED"
fi

echo "GOOGLE_REVERSED_CLIENT_ID=$reversed" > "${SRCROOT:-$(dirname "$0")/..}/Flutter/DartDefines.xcconfig"
