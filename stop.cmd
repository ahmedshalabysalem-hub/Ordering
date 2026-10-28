@echo off
rem Stops the ordering system. Data is kept; start.cmd brings it back.
cd /d "%~dp0"
docker compose -f docker-compose.prod.yml --env-file .env.production stop
echo.
echo The system is stopped. Your data is kept. Run start.cmd to start it again.
pause
