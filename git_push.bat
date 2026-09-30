@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo Holle aktuelle Daten aus der Cloud (Sicherheits-Check)...
git pull origin main
if errorlevel 1 (
  echo.
  echo Pull fehlgeschlagen. Nichts wurde hochgeladen.
  pause
  exit /b 1
)

echo.
echo Sammle alle Code-Aenderungen auf der Baustelle...
git add .

git diff --cached --quiet
if errorlevel 1 (
  echo.
  echo Schreibe den digitalen Notizzettel...
  git commit -m "auto: code-update via script"
  if errorlevel 1 (
    echo.
    echo Commit fehlgeschlagen. Nichts wurde hochgeladen.
    pause
    exit /b 1
  )
) else (
  echo Keine neuen Dateien zum Commit.
)

echo.
echo Jage alles hoch zu GitHub und Vercel...
git push -u origin main
if errorlevel 1 (
  echo.
  echo Push fehlgeschlagen. GitHub hat nichts Neues angenommen.
  pause
  exit /b 1
)

echo.
echo FERTIG. Dein Code fliegt jetzt zu Vercel.
pause
