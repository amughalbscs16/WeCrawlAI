@echo off
echo 🚀 Setting up AI Testing Agent MVP...
echo =====================================
echo.

REM Check Node.js
echo 📋 Checking prerequisites...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18+ first.
    pause
    exit /b 1
)

for /f "tokens=1 delims=." %%i in ('node --version') do set NODE_MAJOR=%%i
set NODE_MAJOR=%NODE_MAJOR:v=%
if %NODE_MAJOR% lss 18 (
    echo ❌ Node.js version 18+ is required. Current version:
    node --version
    pause
    exit /b 1
)

echo ✅ Node.js found:
node --version

REM Check npm
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm is not installed.
    pause
    exit /b 1
)
echo ✅ npm found:
npm --version

REM Check Docker (optional)
docker --version >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Docker found:
    docker --version
    set DOCKER_AVAILABLE=true
) else (
    echo ⚠️  Docker not found. Docker deployment will not be available.
    set DOCKER_AVAILABLE=false
)

REM Create necessary directories
echo.
echo 📁 Creating project directories...
if not exist "backend\logs" mkdir backend\logs
if not exist "backend\screenshots" mkdir backend\screenshots
if not exist "backend\videos" mkdir backend\videos
if not exist "backend\har" mkdir backend\har
if not exist "frontend\src" mkdir frontend\src
echo ✅ Directories created

REM Install root dependencies
echo.
echo 📦 Installing root dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ❌ Failed to install root dependencies
    pause
    exit /b 1
)
echo ✅ Root dependencies installed

REM Install backend dependencies
echo.
echo 📦 Installing backend dependencies...
cd backend
call npm install
if %errorlevel% neq 0 (
    echo ❌ Failed to install backend dependencies
    pause
    exit /b 1
)
echo ✅ Backend dependencies installed

REM Install Playwright browsers
echo.
echo 🎭 Installing Playwright browsers...
call npx playwright install
if %errorlevel% neq 0 (
    echo ❌ Failed to install Playwright browsers
    pause
    exit /b 1
)
echo ✅ Playwright browsers installed

cd ..

REM Install frontend dependencies
echo.
echo 📦 Installing frontend dependencies...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo ❌ Failed to install frontend dependencies
    pause
    exit /b 1
)
echo ✅ Frontend dependencies installed

cd ..

REM Create environment file
echo.
echo ⚙️  Setting up environment configuration...
if not exist "backend\.env" (
    copy "backend\.env.example" "backend\.env"
    echo 📄 Created backend\.env file
    echo ⚠️  Please update the .env file with your API keys:
    echo    - ANTHROPIC_API_KEY (for Claude AI)
    echo    - OPENAI_API_KEY (for OpenAI GPT)
) else (
    echo ✅ Environment file already exists
)

REM Build backend
echo.
echo 🔨 Building backend...
cd backend
call npm run build
if %errorlevel% neq 0 (
    echo ❌ Failed to build backend
    pause
    exit /b 1
)
cd ..
echo ✅ Backend built successfully

REM Setup completion
echo.
echo 🎉 Setup completed successfully!
echo ==============================
echo.
echo 📋 Next steps:
echo 1. Update backend\.env with your AI API keys
echo 2. Start development servers:
echo    npm run dev
echo.
echo 🐳 Docker deployment:
if "%DOCKER_AVAILABLE%"=="true" (
    echo    docker-compose up --build
) else (
    echo    Install Docker first, then run: docker-compose up --build
)
echo.
echo 🌐 Access points:
echo    Frontend: http://localhost:3000
echo    Backend:  http://localhost:3001
echo    API Docs: http://localhost:3001/api/health
echo.
echo 📚 Documentation:
echo    See README.md for detailed usage instructions
echo    Implementation plan: AI_Testing_Agent_Implementation_Plan.md
echo.
pause