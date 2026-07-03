@echo off
rem Starts a local static server for the World Map Quiz.
rem The app must be served over http:// (fetch() of local data files is
rem blocked by browsers on file://).
cd /d "%~dp0"

set PORT=%1
if "%PORT%"=="" set PORT=8000

where python >nul 2>nul
if %errorlevel%==0 (
  echo Serving World Map Quiz at http://localhost:%PORT%  ^(Ctrl+C to stop^)
  python -m http.server %PORT%
  goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
  echo Serving World Map Quiz at http://localhost:%PORT%  ^(Ctrl+C to stop^)
  py -m http.server %PORT%
  goto :eof
)

echo No Python found. Please install Python, or serve this folder with any
echo static file server, e.g.:  python -m http.server %PORT%
pause
