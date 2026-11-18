@echo off
chcp 936 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Mingxian Tour - Local Server

echo ============================================
echo   铭贤学堂旧址 · 自由游览
echo ============================================
echo.

if not exist "index.html" goto :noindex

set "PORT=8080"
set "MAXPORT=8099"

:findport
netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul 2>nul
if not errorlevel 1 goto :portused
goto :portok

:portused
set /a PORT+=1
if %PORT% GTR %MAXPORT% goto :noport
goto :findport

:portok
set "URL=http://127.0.0.1:%PORT%/index.html"
echo   地址：%URL%
echo   关闭此窗口即停止服务。
echo.

where py >nul 2>nul
if not errorlevel 1 goto :usepy
where python >nul 2>nul
if not errorlevel 1 goto :usepython
where node >nul 2>nul
if not errorlevel 1 goto :usenode
goto :noruntime

:usepy
echo   使用 Python: py -m http.server
start "" "%URL%"
py -m http.server %PORT% --bind 127.0.0.1
goto :end

:usepython
echo   使用 Python: python -m http.server
start "" "%URL%"
python -m http.server %PORT% --bind 127.0.0.1
goto :end

:usenode
echo   使用 Node.js: tools\serve.mjs
start "" "%URL%"
node "%~dp0tools\serve.mjs" %PORT%
goto :end

:noindex
echo [错误] 当前目录下找不到 index.html。
echo.
echo   请确认整个 mingxian-tour 文件夹是完整的，
echo   不要把本文件单独复制出来运行。
echo.
pause
goto :end

:noport
echo [错误] 端口 8080-8099 都被占用了。
echo.
echo   请关闭一些程序后重试，或手动执行：
echo     python -m http.server 8123 --bind 127.0.0.1
echo.
pause
goto :end

:noruntime
echo [错误] 未找到 Python 或 Node.js。
echo.
echo   这个页面用了 ES Module，浏览器不允许直接双击 html 打开，
echo   必须通过一个本地 HTTP 服务。请任选其一：
echo     1. 安装 Python（python.org）后重新双击本文件；
echo     2. 安装 Node.js（nodejs.org）后重新双击本文件；
echo     3. 用 VS Code 的 Live Server 插件打开本文件夹。
echo.
pause
goto :end

:end
endlocal