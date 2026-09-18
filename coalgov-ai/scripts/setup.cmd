@echo off
setlocal
cd /d "%~dp0..\backend"
if not exist .env copy .env.example .env >nul
if not exist .venv\Scripts\python.exe python -m venv .venv
if errorlevel 1 exit /b 1
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 exit /b 1
.venv\Scripts\python.exe -m app.migrate
if errorlevel 1 exit /b 1
cd ..\web
if not exist .env copy .env.example .env >nul
call npm ci
if errorlevel 1 exit /b 1
echo Setup complete. Run scripts\start-backend.cmd and scripts\start-web.cmd in separate terminals.
