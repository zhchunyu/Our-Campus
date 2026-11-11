@echo off
REM ============================================================================
REM  serve.cmd -- start a local static HTTP server for this folder
REM  ---------------------------------------------------------------------------
REM  WHY THIS FILE EXISTS
REM    The 3D preview page (preview.html) loads its script as an ES module.
REM    Browsers apply STRICT CORS checks to module scripts, and the origin of a
REM    file:// page is "null", so opening preview.html by double-clicking it
REM    makes the browser refuse to load the script. The result is a loading
REM    overlay that never goes away, with no obvious clue why.
REM    Serving the folder over http:// fixes it.
REM
REM  WHY THE CONTENT IS PURE ASCII
REM    This project lives in a path containing Chinese characters. If such a
REM    path were written into a .cmd/.bat file, cmd.exe would decode it with the
REM    OEM code page and the bytes would be mangled. So we never hard-code a
REM    path here -- %~dp0 expands to this script's own folder at run time.
REM
REM  PORT
REM    8123 -- already used elsewhere in this project (see src/preview.js and
REM    the error hints in the preview page), so the messages stay consistent.
REM ============================================================================

chcp 65001 >nul
cd /d "%~dp0"

echo.
echo   Local static server
echo   Folder : %CD%
echo   Open   : http://localhost:8123/preview.html
echo   Stop   : press Ctrl+C
echo.

where py >nul 2>nul
if %errorlevel%==0 (
  py -m http.server 8123
) else (
  python -m http.server 8123
)
