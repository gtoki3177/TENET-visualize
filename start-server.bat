@echo off
cd /d "%~dp0"
echo Starting preview server at http://localhost:8000
where python >nul 2>nul
if %errorlevel%==0 (
  python serve.py 8000
) else (
  npx -y serve -l 8000 -c-1
)
