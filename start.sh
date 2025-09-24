#!/bin/bash

# AI Testing Agent Start Script
# Starts the development servers for both frontend and backend

set -e

echo "🚀 Starting AI Testing Agent MVP Development Servers..."
echo "======================================================\n"

# Check if .env file exists
if [ ! -f backend/.env ]; then
    echo "❌ Environment file not found!"
    echo "Please run setup.sh first or create backend/.env file"
    echo "Copy from backend/.env.example and add your API keys"
    exit 1
fi

# Check if node_modules exist
if [ ! -d backend/node_modules ] || [ ! -d frontend/node_modules ]; then
    echo "❌ Dependencies not installed!"
    echo "Please run setup.sh first to install dependencies"
    exit 1
fi

# Create logs directory if it doesn't exist
mkdir -p backend/logs

echo "🔍 Checking environment..."

# Check required API keys
if [ -f backend/.env ]; then
    if grep -q "ANTHROPIC_API_KEY=your_anthropic_api_key_here" backend/.env ||
       grep -q "OPENAI_API_KEY=your_openai_api_key_here" backend/.env; then
        echo "⚠️  Warning: Default API keys detected in .env file"
        echo "Please update your API keys for full functionality"
    fi
fi

echo "✅ Environment check complete"

# Function to cleanup background processes
cleanup() {
    echo "\n🛑 Shutting down servers..."
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    echo "✅ Cleanup complete"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

echo "\n🔧 Starting backend server..."
cd backend
npm run dev &
BACKEND_PID=$!
echo "✅ Backend started (PID: $BACKEND_PID)"

# Wait a moment for backend to start
sleep 3

echo "\n🎨 Starting frontend server..."
cd ../frontend
npm start &
FRONTEND_PID=$!
echo "✅ Frontend started (PID: $FRONTEND_PID)"

cd ..

echo "\n🎉 AI Testing Agent MVP is starting up!"
echo "======================================"
echo ""
echo "🌐 Access Points:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:3001"
echo "   Health:   http://localhost:3001/api/health"
echo ""
echo "📊 Real-time Logs:"
echo "   Backend logs: tail -f backend/logs/combined.log"
echo "   Error logs:   tail -f backend/logs/error.log"
echo ""
echo "🛑 To stop: Press Ctrl+C"
echo ""

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID