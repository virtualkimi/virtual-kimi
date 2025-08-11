@echo off
REM Starts a Python HTTP server on port 8080
start "" python -m http.server 8080

REM Pause 2 seconds to allow the server to start
timeout /t 2 >nul

REM Opens the homepage in the default browser
start "" http://localhost:8080/index.html