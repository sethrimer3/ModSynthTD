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
call npm run build
if errorlevel 1 goto error
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -Name Win32Window -Namespace TinyBaseIdle -MemberDefinition '[System.Runtime.InteropServices.DllImport(\"kernel32.dll\")] public static extern System.IntPtr GetConsoleWindow(); [System.Runtime.InteropServices.DllImport(\"user32.dll\")] public static extern bool ShowWindow(System.IntPtr hWnd, int nCmdShow);'; $electron = Start-Process -FilePath 'node_modules\\.bin\\electron.cmd' -ArgumentList @('.') -WorkingDirectory (Get-Location).Path -PassThru; Start-Sleep -Seconds 1; [TinyBaseIdle.Win32Window]::ShowWindow([TinyBaseIdle.Win32Window]::GetConsoleWindow(), 0) | Out-Null; Wait-Process -Id $electron.Id; exit $electron.ExitCode"
if errorlevel 1 goto error
popd
exit /b 0

:error
echo.
echo Launcher failed.
pause
popd
exit /b 1
