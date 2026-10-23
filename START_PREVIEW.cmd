@echo off
setlocal
cd /d "%~dp0"
py -3 -c "import sys; assert sys.version_info.major == 3" >nul 2>&1
if not errorlevel 1 (
  py -3 "%~dp0preview_server.py"
  goto done
)
python -c "import sys; assert sys.version_info.major == 3" >nul 2>&1
if not errorlevel 1 (
  python "%~dp0preview_server.py"
  goto done
)
echo Python 3 was not found. Open index.html directly, or see START_HERE.html.
:done
pause
