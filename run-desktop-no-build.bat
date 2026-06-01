@echo off
setlocal
pushd "%~dp0"
if not exist "package.json" (
  echo package.json not found in repo root.
  goto error
)
if not exist "dist\index.html" (
  echo dist\index.html not found. Run build-game.bat or run-desktop.bat first.
  goto error
)
if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto error
)
call npm run desktop:no-build
if errorlevel 1 goto error
popd
exit /b 0

:error
echo.
echo Launcher failed.
pause
popd
exit /b 1
