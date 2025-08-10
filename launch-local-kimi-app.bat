@echo off
REM Démarre un serveur HTTP Python sur le port 8080
start "" python -m http.server 8080

REM Pause 2 secondes pour laisser le serveur démarrer
timeout /t 2 >nul

REM Ouvre la page d'accueil dans le navigateur par défaut
start "" http://localhost:8080/index.html