@echo off
echo ============================================================
echo  OpenANPR - Starting Backend + Frontend
echo ============================================================
echo.

REM ── Backend ──────────────────────────────────────────────────
echo [1/2] Starting FastAPI backend on http://127.0.0.1:8000 ...
start "OpenANPR Backend" cmd /k "cd /d C:\Portfolio\open-anpr\backend && venv\Scripts\activate && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

REM Short pause to let backend start
timeout /t 3 /nobreak >nul

REM ── Frontend ─────────────────────────────────────────────────
echo [2/2] Starting React frontend on http://127.0.0.1:5173 ...
start "OpenANPR Frontend" /d "C:\Portfolio\open-anpr\frontend" cmd /k "npm run dev"

echo.
echo Both servers are starting in separate windows.
echo Frontend: http://127.0.0.1:5173
echo Backend:  http://127.0.0.1:8000
echo API Docs: http://127.0.0.1:8000/docs
echo.
pause
