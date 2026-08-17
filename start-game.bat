@echo off
cd /d "%~dp0"
echo Starting Lorsain...
where pnpm >nul 2>nul
if %ERRORLEVEL%==0 (
  call pnpm game
) else (
  echo Local pnpm not found; using repository packageManager via corepack/npx...
  call npx --yes pnpm@9.15.9 game
)
