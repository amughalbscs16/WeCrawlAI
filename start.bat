@echo off
echo 🚀 Starting AI Testing Agent MVP Development Servers...
echo ======================================================
echo.

REM Check if .env file exists
if not exist "backend\.env" (
    echo ❌ Environment file not found!
    echo Please run setup.bat first or create backend\.env file
    echo Copy from backend\.env.example and add your API keys
    pause
    exit /b 1
)

REM Check if node_modules exist
if not exist "backend\node_modules" (
    echo ❌ Backend dependencies not installed!
    echo Please run setup.bat first to install dependencies
    pause
    exit /b 1
)

if not exist "frontend\node_modules" (
    echo ❌ Frontend dependencies not installed!
    echo Please run setup.bat first to install dependencies
    pause
    exit /b 1
)

REM Create logs directory if it doesn't exist
if not exist "backend\logs" mkdir backend\logs

echo 🔍 Checking environment...

REM Check for default API keys
findstr /C:"ANTHROPIC_API_KEY=your_anthropic_api_key_here" backend\.env >nul 2>&1
if %errorlevel% equ 0 (
    echo ⚠️  Warning: Default ANTHROPIC_API_KEY detected in .env file
    echo Please update your API keys for full functionality
)

findstr /C:"OPENAI_API_KEY=your_openai_api_key_here" backend\.env >nul 2>&1
if %errorlevel% equ 0 (
    echo ⚠️  Warning: Default OPENAI_API_KEY detected in .env file
    echo Please update your API keys for full functionality
)

echo ✅ Environment check complete

echo.
echo 🔧 Starting backend server...
start "AI Testing Agent Backend" cmd /k "cd backend && npm run dev"

REM Wait a moment for backend to start
timeout /t 3 >nul

echo ✅ Backend started in new window

echo.
echo 🎨 Starting frontend server...
start "AI Testing Agent Frontend" cmd /k "cd frontend && npm start"

echo ✅ Frontend started in new window

echo.
echo 🎉 AI Testing Agent MVP is starting up!
echo ======================================
echo.
echo 🌐 Access Points:
echo    Frontend: http://localhost:3000
echo    Backend:  http://localhost:3001
echo    Health:   http://localhost:3001/api/health
echo.
echo 📊 Real-time Logs:
echo    Backend logs: backend\logs\combined.log
echo    Error logs:   backend\logs\error.log
echo.
echo 🛑 To stop: Close the terminal windows or press Ctrl+C in each
echo.
echo ✅ Development servers are starting in separate windows
echo Check the opened terminal windows for detailed logs
echo.
pause