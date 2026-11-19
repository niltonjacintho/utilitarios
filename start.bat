@echo off
setlocal EnableExtensions

chcp 65001 >nul
set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "FRONTEND_DIR=%ROOT_DIR%frontend"
set "MINDMAP_DIR=%ROOT_DIR%mindmap"
set "FLOWCHART_DIR=%ROOT_DIR%flowchart"
set "ERSTUDIO_DIR=%ROOT_DIR%erstudio"
set "PID_FILE=%ROOT_DIR%.hub-pids.txt"

echo ============================================================
echo   Hub de Prototipos - Inicializacao (API + Hub + Apps)
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado no PATH.
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERRO] npm nao encontrado no PATH.
    pause
    exit /b 1
)

call "%ROOT_DIR%stop.bat" --silent

if not exist "%BACKEND_DIR%\node_modules" (
    echo [INFO] Instalando dependencias do backend...
    call npm --prefix "%BACKEND_DIR%" install
    if errorlevel 1 ( pause & exit /b 1 )
)

if not exist "%FRONTEND_DIR%\node_modules" (
    echo [INFO] Instalando dependencias do frontend (Hub)...
    call npm --prefix "%FRONTEND_DIR%" install
    if errorlevel 1 ( pause & exit /b 1 )
)

if not exist "%MINDMAP_DIR%\node_modules" (
    echo [INFO] Instalando dependencias do MindMap...
    call npm --prefix "%MINDMAP_DIR%" install
    if errorlevel 1 ( pause & exit /b 1 )
)

if not exist "%FLOWCHART_DIR%\node_modules" (
    echo [INFO] Instalando dependencias do Flowchart...
    call npm --prefix "%FLOWCHART_DIR%" install
    if errorlevel 1 ( pause & exit /b 1 )
)

if not exist "%ERSTUDIO_DIR%\node_modules" (
    echo [INFO] Instalando dependencias do ER Studio...
    call npm --prefix "%ERSTUDIO_DIR%" install
    if errorlevel 1 ( pause & exit /b 1 )
)

if exist "%FRONTEND_DIR%\.next\BUILD_ID" (
    rmdir /s /q "%FRONTEND_DIR%\.next"
)
if exist "%FLOWCHART_DIR%\.next\BUILD_ID" (
    rmdir /s /q "%FLOWCHART_DIR%\.next"
)
if exist "%ERSTUDIO_DIR%\.next\BUILD_ID" (
    rmdir /s /q "%ERSTUDIO_DIR%\.next"
)

type nul > "%PID_FILE%"

echo [1/5] Iniciando API NestJS (http://localhost:3001/api)...
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$a=[char]38; $c='/k title HUB_PROTOTIPOS_BACKEND '+$a+' npm run start:dev'; $p=Start-Process -FilePath 'cmd.exe' -ArgumentList $c -WorkingDirectory '%BACKEND_DIR%' -PassThru; $p.Id"`) do (
    echo %%P>> "%PID_FILE%"
    echo       Sessao CMD do backend aberta ^(PID: %%P^)
)

echo [2/5] Iniciando Hub Next.js (http://localhost:3000)...
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$a=[char]38; $c='/k title HUB_PROTOTIPOS_FRONTEND '+$a+' npm run dev'; $p=Start-Process -FilePath 'cmd.exe' -ArgumentList $c -WorkingDirectory '%FRONTEND_DIR%' -PassThru; $p.Id"`) do (
    echo %%P>> "%PID_FILE%"
    echo       Sessao CMD do Hub aberta ^(PID: %%P^)
)

echo [3/5] Iniciando MindMap React (http://localhost:3002)...
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$a=[char]38; $c='/k title HUB_PROTOTIPOS_MINDMAP '+$a+' npm run dev'; $p=Start-Process -FilePath 'cmd.exe' -ArgumentList $c -WorkingDirectory '%MINDMAP_DIR%' -PassThru; $p.Id"`) do (
    echo %%P>> "%PID_FILE%"
    echo       Sessao CMD do MindMap aberta ^(PID: %%P^)
)

echo [4/5] Iniciando Flowchart Next.js (http://localhost:3003)...
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$a=[char]38; $c='/k title HUB_PROTOTIPOS_FLOWCHART '+$a+' npm run dev'; $p=Start-Process -FilePath 'cmd.exe' -ArgumentList $c -WorkingDirectory '%FLOWCHART_DIR%' -PassThru; $p.Id"`) do (
    echo %%P>> "%PID_FILE%"
    echo       Sessao CMD do Flowchart aberta ^(PID: %%P^)
)

echo [5/5] Iniciando ER Studio Next.js (http://localhost:3004)...
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$a=[char]38; $c='/k title HUB_PROTOTIPOS_ERSTUDIO '+$a+' npm run dev'; $p=Start-Process -FilePath 'cmd.exe' -ArgumentList $c -WorkingDirectory '%ERSTUDIO_DIR%' -PassThru; $p.Id"`) do (
    echo %%P>> "%PID_FILE%"
    echo       Sessao CMD do ER Studio aberta ^(PID: %%P^)
)

echo.
echo ============================================================
echo   Servicos iniciados!
echo   - API:       http://localhost:3001/api/hub
echo   - Hub:       http://localhost:3000
echo   - MindMap:   http://localhost:3002
echo   - Flowchart: http://localhost:3003
echo   - ER Studio: http://localhost:3004
echo   - Para parar tudo, execute: stop.bat
echo ============================================================
echo.

endlocal
exit /b 0
