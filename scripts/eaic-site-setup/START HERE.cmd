@echo off
setlocal
set "PSModulePath=%SystemRoot%\System32\WindowsPowerShell\v1.0\Modules"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Tools\Site-Setup.ps1"
set "EAIC_EXIT=%errorlevel%"
if not "%EAIC_EXIT%"=="0" pause
exit /b %EAIC_EXIT%
