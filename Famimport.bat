@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ============================================
echo   Famimport - verification codes HS Tarabel
echo ============================================
echo.

set "INPUT=%~1"

if "%INPUT%"=="" (
    echo Glisse-depose un fichier Excel sur ce .bat
    echo OU tape le chemin complet du fichier ci-dessous.
    echo.
    set /p "INPUT=Fichier Excel : "
)

if "%INPUT%"=="" (
    echo Aucun fichier fourni. Sortie.
    pause
    exit /b 1
)

if not exist "%INPUT%" (
    echo Fichier introuvable : %INPUT%
    pause
    exit /b 1
)

REM Construit un nom de sortie avec timestamp
for /f "tokens=2 delims==" %%a in ('"wmic os get localdatetime /value"') do set "DT=%%a"
set "TS=!DT:~0,8!-!DT:~8,6!"

REM Nom du fichier d'entree sans extension
for %%F in ("%INPUT%") do set "BASENAME=%%~nF"

set "OUTPUT=%~dp0output\!BASENAME!.verified-!TS!.xlsx"

echo Fichier d'entree : %INPUT%
echo Fichier de sortie : !OUTPUT!
echo.

if not exist "%~dp0output" mkdir "%~dp0output"

call npm start -- --input "%INPUT%" --output "!OUTPUT!" --concurrency 4

echo.
if exist "!OUTPUT!" (
    echo ============================================
    echo   Termine. Ouverture du dossier de sortie...
    echo ============================================
    start "" explorer "%~dp0output"
) else (
    echo Echec : pas de fichier de sortie produit.
)

pause
