@echo off
title BRIAR CHRONICLES
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Python is not installed yet.
  echo   Install it free from https://www.python.org/downloads/
  echo   ^(tick "Add python.exe to PATH" during setup^), then double-click this file again.
  echo.
  pause
  exit /b
)
start "" /b cmd /c "timeout /t 2 >nul & start http://localhost:8666/"
python server.py
pause
