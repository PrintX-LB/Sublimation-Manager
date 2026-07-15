@echo off
setlocal EnableExtensions

title PrintX Beta 1

for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
cd /d "%PROJECT_ROOT%"

echo --------------------------------
echo.
echo PrintX Beta 1
echo.
echo --------------------------------
echo.

if not exist "package.json" (
  echo ERROR: package.json was not found in:
  echo %PROJECT_ROOT%
  echo.
  echo Keep this launcher inside the project's tools folder.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm was not found.
  echo Install Node.js 20 or newer, then try again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo PrintX dependencies are not installed.
  echo.
  echo Open a terminal in this folder and run:
  echo.
  echo   npm install
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.example" (
    echo Creating local configuration from .env.example...
    copy /y ".env.example" ".env" >nul
  ) else (
    echo ERROR: .env and .env.example are both missing.
    echo Restore .env.example, then try again.
    echo.
    pause
    exit /b 1
  )
)

if not exist "data\" mkdir "data" >nul 2>&1
if not exist "data\sublimation.db" type nul > "data\sublimation.db"

echo Preparing the local database...
call npx prisma migrate deploy
if errorlevel 1 (
  echo.
  echo ERROR: The local database could not be prepared.
  echo Review the message above, then try again.
  echo.
  pause
  exit /b 1
)

echo.
echo Starting development server...
echo Waiting for server...
echo.
echo Press Ctrl+C to stop PrintX.
echo --------------------------------
echo.

start "" /b powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$deadline = (Get-Date).AddMinutes(2); while ((Get-Date) -lt $deadline) { try { $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000' -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { Write-Host ''; Write-Host 'Opening browser...'; Start-Process 'http://localhost:3000'; exit 0 } } catch { }; Start-Sleep -Milliseconds 500 }; Write-Host ''; Write-Host 'PrintX did not respond at http://localhost:3000 within two minutes.'"

call npm run dev
set "PRINTX_EXIT_CODE=%ERRORLEVEL%"

echo.
if "%PRINTX_EXIT_CODE%"=="0" (
  echo PrintX has stopped.
) else (
  echo PrintX stopped with exit code %PRINTX_EXIT_CODE%.
)
echo.
pause
exit /b %PRINTX_EXIT_CODE%
