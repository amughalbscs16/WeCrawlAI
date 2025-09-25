# Test Generation MCP Server Setup

This MCP (Model Context Protocol) server allows you to generate tests directly from Claude Desktop using **GPT-5 nano** - OpenAI's cheapest model at just $0.05/1M input tokens, with clean code extraction capabilities.

## Features

### 🚀 Three Main Tools:

1. **`generate_test`** - Generate test code from scenario descriptions
   - `format`: Choose output format (code_only, annotated, full)
   - Returns clean, extractable code

2. **`extract_last_test`** - Get the last generated test in clean format
   - `include_annotations`: Toggle inline comments
   - Perfect for quick copy-paste

3. **`get_test_history`** - View previous test generations
   - `limit`: Number of tests to retrieve
   - `format`: summary or full details

## Setup Instructions

### For Claude Desktop (Windows):

1. **Locate your Claude Desktop config file:**
   ```
   %APPDATA%\Claude\claude_desktop_config.json
   ```

2. **Add this MCP server configuration:**
   ```json
   {
     "mcpServers": {
       "test-generation": {
         "command": "node",
         "args": ["D:\\Claude\\Endeavor_2\\ai-testing-agent\\backend\\mcp-server.js"],
         "env": {
           "OPENAI_API_KEY": "your-api-key-here"
         }
       }
     }
   }
   ```

3. **Restart Claude Desktop**

### For Claude Desktop (Mac/Linux):

1. **Locate config file:**
   ```
   ~/Library/Application Support/Claude/claude_desktop_config.json  # Mac
   ~/.config/Claude/claude_desktop_config.json  # Linux
   ```

2. **Add the configuration** (adjust paths accordingly)

## Usage Examples in Claude

Once configured, you can use these commands directly in Claude:

### Generate a Test:
```
Use the generate_test tool to create a test for:
- Summary: "User login flow"
- Actions: ["Navigate to login page", "Enter email", "Enter password", "Click submit", "Verify redirect to dashboard"]
- Format: code_only
```

### Extract Clean Code:
```
Use the extract_last_test tool to get the last generated test without annotations
```

### View History:
```
Use the get_test_history tool to show the last 5 tests in summary format
```

## Output Formats

### `code_only` (Default)
Returns just the test code, cleaned and ready to use:
```javascript
describe('User Login Flow', () => {
  test('should successfully login', async () => {
    // Your clean test code here
  });
});
```

### `annotated`
Includes detailed inline comments:
```javascript
// Step 1: Navigate to login page
await page.goto('/login');

// Step 2: Enter credentials
await page.fill('#email', 'user@example.com');
// ... etc
```

### `full`
Complete output with metadata, scenario, and formatted code

## Benefits of MCP vs API

1. **Direct Integration** - Works seamlessly within Claude Desktop
2. **Clean Extraction** - Get just the code you need, no JSON parsing
3. **Persistent History** - All tests logged to `logs_code.txt`
4. **Multiple Formats** - Choose how you want the output
5. **Immediate Use** - Copy and paste ready code

## Testing the MCP Server Locally

```bash
cd ai-testing-agent
node backend/mcp-server.js
```

If it starts successfully, you'll see:
```
Test Generation MCP Server running...
```

## Troubleshooting

1. **"Tool not found" error in Claude:**
   - Ensure the config path is correct
   - Restart Claude Desktop after config changes

2. **"OpenAI API key not configured":**
   - Check the OPENAI_API_KEY in your config
   - Verify the key is valid

3. **Server won't start:**
   - Check Node.js is installed: `node --version`
   - Ensure all dependencies are installed: `npm install`

## Cost Optimization

Using **GPT-5 nano** - The cheapest OpenAI model:
- **Input**: $0.05 per 1M tokens ($0.00005 per 1K)
- **Cached Input**: $0.005 per 1M tokens (90% discount!)
- **Output**: $0.40 per 1M tokens ($0.0004 per 1K)
- **Average test**: ~500-1000 tokens (< $0.00008 - less than 1/100th of a penny!)
- **10x cheaper than GPT-3.5-turbo!**
- **3x cheaper than GPT-4o-mini!**

### Pricing Comparison:
| Model | Input (per 1M) | Output (per 1M) |
|-------|----------------|-----------------|
| GPT-5 nano | **$0.05** | **$0.40** |
| GPT-4o-mini | $0.15 | $0.60 |
| GPT-3.5-turbo | $0.50 | $1.50 |

The system automatically falls back to GPT-3.5-turbo if GPT-5 nano is unavailable.

**Note on GPT-5-nano**: This model is optimized for speed and cost, and may not support all parameters like `temperature`. The system automatically adjusts parameters based on the model being used.

## Example Workflow

1. **Describe your test scenario in Claude:**
   "Generate a test for adding items to cart and checking out"

2. **Claude uses the MCP tool to generate the test**

3. **Extract just the code:**
   "Now extract that test code without comments"

4. **Copy and use in your project!**

## Files Created

- `backend/mcp-server.js` - The MCP server implementation
- `logs_code.txt` - History of all generated tests
- `claude_desktop_config.json` - Example configuration

The MCP server provides a much cleaner interface for test generation, with immediate code extraction - perfect for rapid test development!