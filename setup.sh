#!/bin/bash

# AI Testing Agent Setup Script
# This script sets up the development environment for the AI Testing Agent MVP

set -e

echo "🚀 Setting up AI Testing Agent MVP..."
echo "=====================================\n"

# Check Node.js version
echo "📋 Checking prerequisites..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) found"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    exit 1
fi
echo "✅ npm $(npm -v) found"

# Check Docker (optional)
if command -v docker &> /dev/null; then
    echo "✅ Docker $(docker --version) found"
    DOCKER_AVAILABLE=true
else
    echo "⚠️  Docker not found. Docker deployment will not be available."
    DOCKER_AVAILABLE=false
fi

# Create necessary directories
echo "\n📁 Creating project directories..."
mkdir -p backend/logs
mkdir -p backend/screenshots
mkdir -p backend/videos
mkdir -p backend/har
mkdir -p frontend/src
echo "✅ Directories created"

# Install root dependencies
echo "\n📦 Installing root dependencies..."
npm install
echo "✅ Root dependencies installed"

# Install backend dependencies
echo "\n📦 Installing backend dependencies..."
cd backend
npm install
echo "✅ Backend dependencies installed"

# Install Playwright browsers
echo "\n🎭 Installing Playwright browsers..."
npx playwright install
echo "✅ Playwright browsers installed"

cd ..

# Install frontend dependencies
echo "\n📦 Installing frontend dependencies..."
cd frontend
npm install
echo "✅ Frontend dependencies installed"

cd ..

# Create environment file
echo "\n⚙️  Setting up environment configuration..."
if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env
    echo "📄 Created backend/.env file"
    echo "⚠️  Please update the .env file with your API keys:"
    echo "   - ANTHROPIC_API_KEY (for Claude AI)"
    echo "   - OPENAI_API_KEY (for OpenAI GPT)"
else
    echo "✅ Environment file already exists"
fi

# Build backend
echo "\n🔨 Building backend..."
cd backend
npm run build
cd ..
echo "✅ Backend built successfully"

# Setup completion
echo "\n🎉 Setup completed successfully!"
echo "=============================="
echo ""
echo "📋 Next steps:"
echo "1. Update backend/.env with your AI API keys"
echo "2. Start development servers:"
echo "   npm run dev"
echo ""
echo "🐳 Docker deployment:"
if [ "$DOCKER_AVAILABLE" = true ]; then
    echo "   docker-compose up --build"
else
    echo "   Install Docker first, then run: docker-compose up --build"
fi
echo ""
echo "🌐 Access points:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:3001"
echo "   API Docs: http://localhost:3001/api/health"
echo ""
echo "📚 Documentation:"
echo "   See README.md for detailed usage instructions"
echo "   Implementation plan: AI_Testing_Agent_Implementation_Plan.md"