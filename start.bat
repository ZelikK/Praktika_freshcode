@echo off
chcp 65001 > nul
cd /d "%~dp0"
title Zenith ToDo List Server
echo ==================================================
echo   🚀 Запуск Zenith ToDo List Server...
echo ==================================================

REM Check standard python
set PYTHON_CMD=python
python --version >nul 2>&1
if %ERRORLEVEL% equ 0 goto FOUND_PYTHON

REM Check AppData python
if exist "%LOCALAPPDATA%\Python\bin\python.exe" (
    set PYTHON_CMD="%LOCALAPPDATA%\Python\bin\python.exe"
    goto FOUND_PYTHON
)

if exist "%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe" (
    set PYTHON_CMD="%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe"
    goto FOUND_PYTHON
)

if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    set PYTHON_CMD="%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    goto FOUND_PYTHON
)

echo [ПОМИЛКА] Python не знайдено в системі!
pause
exit /b 1

:FOUND_PYTHON
echo [OK] Використовується Python: %PYTHON_CMD%
echo.
echo Перевірка залежностей...
%PYTHON_CMD% -m pip install -r requirements.txt --quiet

echo.
echo Відкриття браузера...
start http://127.0.0.1:5000

echo Запуск сервера...
%PYTHON_CMD% app.py
pause
