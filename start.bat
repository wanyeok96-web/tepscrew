@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  TEPS Crew
echo  ---------
echo  기본 실행: index.html 을 더블클릭하세요.
echo.
echo  로컬 서버가 필요하면 이 창을 유지한 채
echo  http://localhost:5500 으로 접속하세요.
echo  종료: Ctrl+C
echo.

where py >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:5500"
  py -m http.server 5500
  goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:5500"
  python -m http.server 5500
  goto :eof
)

echo Python이 없으면 index.html 을 더블클릭해 주세요.
pause
