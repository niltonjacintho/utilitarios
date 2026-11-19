@echo off
setlocal EnableExtensions

chcp 65001 >nul
set "ROOT_DIR=%~dp0"
set "PID_FILE=%ROOT_DIR%.hub-pids.txt"
set "SILENT=0"
if /i "%~1"=="--silent" set "SILENT=1"

if "%SILENT%"=="0" (
    echo ==================================================
    echo   Hub de Prototipos - Encerrando servicos e CMDs
    echo ==================================================
    echo.
)

if exist "%PID_FILE%" (
    for /f "usebackq delims=" %%P in ("%PID_FILE%") do (
        if not "%%P"=="" (
            taskkill /F /T /PID %%P >nul 2>&1
            if "%SILENT%"=="0" echo [OK] Sessao CMD encerrada ^(PID: %%P^)
        )
    )
    del /f /q "%PID_FILE%" >nul 2>&1
)

taskkill /F /T /FI "WINDOWTITLE eq HUB_PROTOTIPOS_BACKEND*" >nul 2>&1
taskkill /F /T /FI "WINDOWTITLE eq HUB_PROTOTIPOS_FRONTEND*" >nul 2>&1
taskkill /F /T /FI "WINDOWTITLE eq HUB_PROTOTIPOS_MINDMAP*" >nul 2>&1
taskkill /F /T /FI "WINDOWTITLE eq HUB_PROTOTIPOS_FLOWCHART*" >nul 2>&1
taskkill /F /T /FI "WINDOWTITLE eq HUB_PROTOTIPOS_ERSTUDIO*" >nul 2>&1

call :kill_port 3001
call :kill_port 3000
call :kill_port 3002
call :kill_port 3003
call :kill_port 3004

if "%SILENT%"=="0" (
    echo.
    echo ==================================================
    echo   API, Hub, MindMap, Flowchart, ER Studio e CMDs encerrados.
    echo ==================================================
    echo.
)

endlocal
exit /b 0

:kill_port
set "TARGET_PORT=%~1"
for /f "tokens=5" %%A in ('netstat -ano 2^>nul ^| findstr /r /c:":%TARGET_PORT% .*LISTENING"') do (
    if not "%%A"=="0" (
        taskkill /F /T /PID %%A >nul 2>&1
        if "%SILENT%"=="0" echo [OK] Processo na porta %TARGET_PORT% encerrado ^(PID: %%A^)
    )
)
exit /b 0
