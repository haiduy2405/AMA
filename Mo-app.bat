@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Dang mo Assistant Music AI (offline) ...
node tools\serve.js
pause
