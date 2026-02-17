@echo off

echo Pulling...
git pull origin main

if %errorlevel% neq 0 (
    echo Pull failed.
    pause
    exit /b
)

echo Deleting old dist...
if exist dist (
    rmdir /s /q dist
)

echo Installing deps...
call npm install

echo Building...
call npm run build

if %errorlevel% neq 0 (
    echo Build failed.
    pause
    exit /b
)

echo Committing...
git add .
git commit -m "Auto Deploy"

echo Pushing...
git push origin main

echo Done.
pause
