@echo off
setlocal

if "%LARK_BRIDGE_SOURCE_REPO%"=="" (
  echo ERROR: set LARK_BRIDGE_SOURCE_REPO to your private runtime repository, for example YOUR_ACCOUNT/lark-chat-bridge-runtime
  exit /b 2
)

if "%LARK_BRIDGE_SOURCE_BRANCH%"=="" set "LARK_BRIDGE_SOURCE_BRANCH=main"

set "TMPFILE=%TEMP%\lark-bridge-install-v2-%RANDOM%.mjs"

echo Fetching latest Lark Bridge v2 installer from %LARK_BRIDGE_SOURCE_REPO%@%LARK_BRIDGE_SOURCE_BRANCH%...
gh api -H "Accept: application/vnd.github.raw+json" "repos/%LARK_BRIDGE_SOURCE_REPO%/contents/bridge/client/install-v2.mjs?ref=%LARK_BRIDGE_SOURCE_BRANCH%" > "%TMPFILE%"
if errorlevel 1 (
  echo FAILED: could not fetch installer from the configured private runtime repository.
  del /q "%TMPFILE%" >nul 2>&1
  exit /b 1
)

node "%TMPFILE%"
set "RC=%ERRORLEVEL%"
del /q "%TMPFILE%" >nul 2>&1
exit /b %RC%
