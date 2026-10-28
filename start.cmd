@echo off
rem Starts the ordering system on this PC (Windows + Docker Desktop). See docs\RUN_ON_WINDOWS.md.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\start.ps1"
echo.
pause
