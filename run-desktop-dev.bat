@echo off
setlocal
pushd "%~dp0"
if not exist "package.json" (
  echo package.json not found in repo root.
  goto error
)
if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto error
)
echo Starting Webpack dev server for Electron...
start "Tiny Base Idle Webpack Dev Server" cmd /k "cd /d %CD% && call npm run dev"
timeout /t 4 /nobreak >nul
call npm run desktop:dev
if errorlevel 1 goto error
popd
exit /b 0

:error
echo.
echo Launcher failed.
pause
popd
exit /b 1
