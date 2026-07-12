@echo off
setlocal
title home_dashboard launcher
cd /d "%~dp0"

set BACKEND_PORT=8473
set FRONTEND_PORT=5473

if not exist "backend\.venv\Scripts\python.exe" (
    echo Python virtualenv missing. Run:
    echo   cd backend
    echo   py -3.10 -m venv .venv
    echo   .venv\Scripts\python.exe -m pip install -r requirements.txt
    pause
    exit /b 1
)
if not exist "frontend\node_modules" (
    echo Frontend deps missing. Run:
    echo   cd frontend
    echo   npm install
    pause
    exit /b 1
)

echo Starting backend on port %BACKEND_PORT%...
start "home_dashboard :backend" cmd /k "cd /d %~dp0backend && .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port %BACKEND_PORT% --reload"

echo Starting frontend on port %FRONTEND_PORT%...
start "home_dashboard :frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ---------------------------------------------
echo   Backend:  http://localhost:%BACKEND_PORT%
echo   Frontend: http://localhost:%FRONTEND_PORT%
echo ---------------------------------------------
echo Close the two spawned windows to stop the servers.
echo.
pause
