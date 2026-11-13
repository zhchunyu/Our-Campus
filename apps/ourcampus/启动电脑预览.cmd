@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto no_node
node "scripts\start-desktop-preview.mjs"
if errorlevel 1 pause
exit /b 0

:no_node
echo Node.js not found. Install Node.js 22.12 or newer from https://nodejs.org
pause
exit /b 1
