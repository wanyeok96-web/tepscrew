@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Building TEPS Crew standalone bundle...
call npx --yes esbuild scripts.js --bundle --format=iife --outfile=app.bundle.js --legal-comments=none
if errorlevel 1 (
  echo Build failed. Node.js / npm이 필요합니다.
  pause
  exit /b 1
)
echo Done: app.bundle.js
echo index.html 을 더블클릭하면 바로 실행됩니다.
pause
