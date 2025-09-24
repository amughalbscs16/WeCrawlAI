# 🚀 Getting Started with AI Testing Agent MVP

Welcome to the AI Testing Agent MVP! This guide will help you set up and start using the system in under 15 minutes.

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **npm 8+** (comes with Node.js)
- **Git** - [Download here](https://git-scm.com/)
- **Docker** (optional) - [Download here](https://www.docker.com/)

### System Requirements

- **Memory**: 4GB RAM minimum, 8GB recommended
- **Storage**: 2GB free space for dependencies and browsers
- **OS**: Windows 10+, macOS 10.15+, or Ubuntu 18.04+

## 🔧 Quick Setup

### Option 1: Automated Setup (Recommended)

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd ai-testing-agent
   ```

2. **Run the setup script:**

   **Windows:**
   ```batch
   setup.bat
   ```

   **macOS/Linux:**
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

3. **Configure API Keys:**
   Edit `backend/.env` and add your AI API keys:
   ```env
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   OPENAI_API_KEY=sk-your-key-here
   ```

4. **Start the application:**

   **Windows:**
   ```batch
   start.bat
   ```

   **macOS/Linux:**
   ```bash
   ./start.sh
   ```

### Option 2: Manual Setup

If you prefer manual setup or the scripts don't work on your system:

1. **Install root dependencies:**
   ```bash
   npm install
   ```

2. **Install backend dependencies:**
   ```bash
   cd backend
   npm install
   npx playwright install
   npm run build
   cd ..
   ```

3. **Install frontend dependencies:**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

4. **Configure environment:**
   ```bash
   cp backend/.env.example backend/.env
   # Edit backend/.env with your API keys
   ```

5. **Start development servers:**
   ```bash
   npm run dev
   ```

### Option 3: Docker Setup

1. **Copy environment file:**
   ```bash
   cp backend/.env.example backend/.env
   # Edit backend/.env with your API keys
   ```

2. **Start with Docker Compose:**
   ```bash
   docker-compose up --build
   ```

## 🎯 Your First Test

1. **Open the application:**
   - Frontend: http://localhost:3000
   - Backend: http://localhost:3001

2. **Navigate to Test Editor:**
   Click "Create New Test" or go to http://localhost:3000/test/new

3. **Write a test scenario:**
   ```gherkin
   Scenario: Google Search Test
   As a user
   I want to search for information
   So that I can find relevant results

   Given I am on the Google homepage
   When I search for "AI testing tools"
   And I click the first result
   Then I should see search results
   And the page should load successfully
   ```

4. **Configure the test:**
   - Target URL: `https://www.google.com`
   - Browser: Chromium (default)
   - Enable Security Testing: ✅
   - Enable Screenshots: ✅

5. **Run the test:**
   Click "🚀 Run Test" (Note: Currently creates execution plan - full automation coming in Phase 2)

## 🔑 API Keys Setup

### Anthropic Claude API Key

1. Visit [Anthropic Console](https://console.anthropic.com/)
2. Create an account or sign in
3. Navigate to API Keys
4. Create a new API key
5. Copy the key starting with `sk-ant-`

### OpenAI API Key

1. Visit [OpenAI Platform](https://platform.openai.com/)
2. Create an account or sign in
3. Navigate to API Keys
4. Create a new API key
5. Copy the key starting with `sk-`

### Adding Keys to the Application

Edit `backend/.env` file:
```env
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
OPENAI_API_KEY=sk-your-actual-key-here
```

**Security Note**: These keys are stored locally and never transmitted to external servers except when making API calls to the respective AI providers.

## 🌐 Access Points

Once running, you can access:

- **Main Application**: http://localhost:3000
- **API Health Check**: http://localhost:3001/api/health
- **Test Execution**: http://localhost:3001/api/tests/execute
- **AI Services**: http://localhost:3001/api/ai/parse-scenario

## 🎛️ Configuration Options

### Browser Settings

Configure in Settings page or `backend/.env`:
- `HEADLESS_BROWSER=false` - Show browser window during tests
- `BROWSER_TIMEOUT=30000` - Default timeout in milliseconds

### AI Model Selection

Available models:
- **Anthropic**: Claude 3 Sonnet (recommended), Claude 3 Haiku
- **OpenAI**: GPT-4, GPT-3.5 Turbo

### Security Testing

Enable/disable specific security tests:
- SQL Injection Detection
- XSS Vulnerability Scanning
- CSRF Protection Checks
- Authentication Bypass Tests
- Information Disclosure
- Transport Security

## 🔍 Testing the Setup

### Health Check

Visit http://localhost:3001/api/health - you should see:
```json
{
  "success": true,
  "data": {
    "uptime": 123,
    "message": "OK",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "environment": "development",
    "version": "1.0.0"
  }
}
```

### AI Integration Test

Test AI parsing at http://localhost:3001/api/ai/parse-scenario:
```bash
curl -X POST http://localhost:3001/api/ai/parse-scenario \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "Given I am on Google\nWhen I search for AI\nThen I should see results"
  }'
```

## 🔧 Troubleshooting

### Common Issues

**Node.js version error:**
- Ensure you have Node.js 18 or higher
- Check with: `node --version`

**npm install fails:**
- Clear npm cache: `npm cache clean --force`
- Delete node_modules and try again

**Playwright browsers not installing:**
- Run manually: `npx playwright install`
- On Linux, install dependencies: `npx playwright install-deps`

**Port already in use:**
- Kill processes on ports 3000/3001
- Or change ports in `.env` files

**API key errors:**
- Verify keys are correctly formatted in `.env`
- Check API key validity with providers
- Ensure no extra spaces or quotes

### Windows-Specific Issues

**PowerShell execution policy:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Long path support:**
Enable in Windows settings or use shorter paths.

### macOS-Specific Issues

**Permission denied on scripts:**
```bash
chmod +x setup.sh start.sh
```

**Homebrew conflicts:**
Use Node.js from official installer instead of Homebrew.

### Linux-Specific Issues

**Missing dependencies:**
```bash
# Ubuntu/Debian
sudo apt-get install -y libnss3-dev libatk-bridge2.0-dev libdrm2 libgtk-3-dev

# CentOS/RHEL
sudo yum install -y nss atk at-spi2-atk gtk3
```

## 📊 Monitoring and Logs

### Log Files

- **Backend logs**: `backend/logs/combined.log`
- **Error logs**: `backend/logs/error.log`
- **Browser console**: Captured in test results

### Real-time Monitoring

```bash
# Backend logs
tail -f backend/logs/combined.log

# Error logs
tail -f backend/logs/error.log
```

### Performance Monitoring

- Memory usage: Check browser task manager
- Response times: Monitor API health endpoint
- Test execution times: Recorded in test results

## 🆘 Getting Help

### Documentation

- **Implementation Plan**: `AI_Testing_Agent_Implementation_Plan.md`
- **API Documentation**: http://localhost:3001/api/health (when running)
- **In-app Documentation**: http://localhost:3000/docs

### Support Channels

1. **GitHub Issues**: Report bugs and feature requests
2. **Documentation**: Check `/docs` folder for detailed guides
3. **Logs**: Check error logs for diagnostic information

### Community

- Share example test scenarios
- Contribute to open-source codebase
- Report security findings responsibly

## 🎉 Next Steps

1. **Explore Examples**: Try the sample test scenarios in Documentation
2. **Security Testing**: Enable all security features and test your applications
3. **Custom Scenarios**: Write tests for your specific use cases
4. **Integration**: Connect with your CI/CD pipeline (coming in future versions)
5. **Feedback**: Report issues and suggest improvements

## 🚦 Current Limitations (MVP)

- Test execution creates plans but doesn't fully automate (Phase 2 feature)
- Limited browser selection (Chromium recommended)
- Security testing is basic (will be enhanced)
- No user authentication (guest mode only)
- No test result persistence (in-memory only)

These limitations will be addressed in future releases as we progress through the implementation plan.

---

**Ready to start testing?** 🚀

Navigate to http://localhost:3000 and click "Create New Test" to begin your AI-powered testing journey!