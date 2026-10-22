@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if not errorlevel 1 (
  py -3 "%~dp0preview_server.py"
  goto done
)
where python >nul 2>&1
if not errorlevel 1 (
  python "%~dp0preview_server.py"
  goto done
)
echo Python 3 was not found. See START_HERE.html for detailed instructions.
:done
pause
