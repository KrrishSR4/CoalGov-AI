@echo off
cd /d "%~dp0..\backend"
if not exist .venv\Scripts\python.exe (
  echo Run scripts\setup.cmd first.
  exit /b 1
)
.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
