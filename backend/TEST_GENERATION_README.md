# Test Generation with GPT-4o-mini

This feature allows you to generate automated test code using OpenAI's GPT-4o-mini model, which is highly cost-effective at $0.15/1M input tokens and $0.60/1M output tokens.

## Setup

1. **Add your OpenAI API Key to the `.env` file:**
   ```
   OPENAI_API_KEY=your_actual_openai_api_key_here
   ```

2. **Ensure the server is running:**
   ```bash
   npm run dev
   ```

## Features

### 1. Test Generation
Generate test code from a simple scenario description and list of actions.

**Endpoint:** `POST /api/test-generation/generate`

**Request Body:**
```json
{
  "summary": "Test user login flow",
  "actions": [
    "Navigate to login page",
    "Enter email",
    "Enter password",
    "Click submit",
    "Verify successful login"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "code": "// Generated test code...",
    "annotations": ["Step 1 annotation", "Step 2 annotation"],
    "timestamp": "2025-01-24T..."
  }
}
```

### 2. Test Execution
Execute the generated test code.

**Endpoint:** `POST /api/test-generation/execute`

**Request Body:**
```json
{
  "code": "// Your test code here"
}
```

### 3. Test History
Retrieve previously generated tests from the log file.

**Endpoint:** `GET /api/test-generation/history?limit=10`

## Logging

All generated tests are automatically logged to `logs_code.txt` with:
- Timestamp
- Original scenario description
- List of actions
- Extracted annotations
- Complete generated code

## Example Usage

Run the example script:
```bash
cd backend
node test-generation-example.js
```

This will:
1. Generate a test for a login flow scenario
2. Display the generated code and annotations
3. Log everything to `logs_code.txt`
4. Show recent test generation history

## Cost Optimization

GPT-4o-mini is used for optimal cost-efficiency:
- **Input**: $0.15 per 1M tokens (~2500 pages)
- **Output**: $0.60 per 1M tokens
- Average test generation: ~500-1000 tokens (< $0.001 per test)

## API Integration

### JavaScript/TypeScript:
```javascript
const axios = require('axios');

async function generateTest(summary, actions) {
  const response = await axios.post(
    'http://localhost:15000/api/test-generation/generate',
    { summary, actions }
  );
  return response.data;
}
```

### cURL:
```bash
curl -X POST http://localhost:15000/api/test-generation/generate \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "Test checkout flow",
    "actions": ["Add item to cart", "Go to checkout", "Enter payment", "Submit order"]
  }'
```

## Security Notes

- Never commit your actual API key to version control
- The `.env` file is excluded from git via `.gitignore`
- Use `.env.example` as a template for other developers
- Monitor your OpenAI usage at https://platform.openai.com/usage

## Troubleshooting

1. **"OpenAI API key not configured" error:**
   - Check that `OPENAI_API_KEY` is set in `.env`
   - Ensure the key is valid and has credits

2. **Test generation fails:**
   - Verify the backend server is running
   - Check logs in the console for detailed errors
   - Ensure your API key has access to GPT-4o-mini

3. **logs_code.txt not created:**
   - Check file permissions in the backend directory
   - The file is auto-created on first test generation