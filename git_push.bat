@echo off
echo 🕵️ Holle aktuelle Daten aus der Cloud (Sicherheits-Check)...
git pull origin main

echo.
echo 📦 Sammle alle Code-Anderungen auf der Baustelle...
git add .

echo.
echo ✍️ Schreibe den digitalen Notizzettel...
git commit -m "auto: code-update via script"

echo.
echo 🚀 Jage alles hoch zu GitHub und Vercel...
git push origin main

echo.
echo 🏁 FERTIG! Dein Code fliegt jetzt zu Vercel.
pause