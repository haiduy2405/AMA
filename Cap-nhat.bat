@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Dang cap nhat ban moi nhat tu GitHub ...
git pull --ff-only
echo.
echo Xong. Neu co loi, hay chup man hinh gui cho tro ly.
pause
