@echo off
chcp 936 >nul
setlocal
cd /d "%~dp0"

set "JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.12.7-hotspot"
set "ANDROID_HOME=E:\Android\Sdk"
set "ANDROID_SDK_ROOT=E:\Android\Sdk"
set "APK_OUT=ÃúÏÍÑ§ÌÃ-È«¾°ÓÎÀÀ-1.0.apk"

echo ============================================
echo   Rebuild APK - Mingxian Tour
echo ============================================
echo.

if not exist "android-app\gradlew.bat" goto :noapp

echo [1/3] copy web assets into android app...
node "tools\build-apk-assets.mjs"
if errorlevel 1 goto :fail

echo.
echo [2/3] gradle assembleDebug...
pushd android-app
call gradlew.bat assembleDebug --no-daemon
set "GR=$errorlevel"
popd
if not "%GR%"=="0" goto :fail

echo.
echo [3/3] copy apk...
copy /Y "android-app\app\build\outputs\apk\debug\app-debug.apk" "%APK_OUT%" >nul
if errorlevel 1 goto :fail

echo.
echo ============================================
echo   DONE
echo   %APK_OUT%
echo ============================================
echo.
pause
goto :eof

:noapp
echo [ERROR] android-app folder or gradlew.bat not found.
echo         This script must sit next to the android-app folder.
echo.
pause
goto :eof

:fail
echo.
echo [ERROR] Build failed. Check the messages above.
echo         If Gradle cannot download, check network / mirror settings
echo         in android-app\gradle\wrapper\gradle-wrapper.properties
echo.
pause
goto :eof