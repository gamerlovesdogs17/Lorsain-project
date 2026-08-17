@echo off
cd /d "%~dp0"
echo Starting Lorsain...
start "" "http://localhost:5173"
call npx --yes pnpm@9.15.9 game
