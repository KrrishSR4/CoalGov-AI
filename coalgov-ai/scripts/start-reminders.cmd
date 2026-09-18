@echo off
cd /d "%~dp0..\backend"
.venv\Scripts\python.exe -m app.scheduler_local
