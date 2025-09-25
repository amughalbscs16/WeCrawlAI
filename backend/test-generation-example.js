/**
 * Test Generation Example Script
 * This demonstrates how to use the test generation API
 */

const axios = require('axios');

const API_URL = 'http://localhost:15000/api/test-generation';

// Example test scenario
const testScenario = {
  summary: "Test user login flow with email and password",
  actions: [
    "Navigate to the login page",
    "Enter email 'user@example.com' in the email field",
    "Enter password 'SecurePass123' in the password field",
    "Click the 'Sign In' button",
    "Verify successful login by checking for welcome message",
    "Verify user is redirected to dashboard"
  ]
};

async function generateTest() {
  try {
    console.log('🚀 Generating test for scenario:', testScenario.summary);
    console.log('\nActions to perform:');
    testScenario.actions.forEach((action, i) => {
      console.log(`  ${i + 1}. ${action}`);
    });

    // Call the test generation API
    const response = await axios.post(`${API_URL}/generate`, testScenario);

    if (response.data.success) {
      console.log('\n✅ Test generated successfully!\n');
      console.log('Generated Code:');
      console.log('=' . repeat(60));
      console.log(response.data.data.code);
      console.log('=' . repeat(60));

      console.log('\nExtracted Annotations:');
      response.data.data.annotations.forEach((annotation, i) => {
        console.log(`  ${i + 1}. ${annotation}`);
      });

      console.log('\n📝 Full test has been logged to: logs_code.txt');

      // Optionally execute the test
      // await executeTest(response.data.data.code);
    } else {
      console.error('❌ Test generation failed:', response.data.error);
    }
  } catch (error) {
    if (error.response) {
      console.error('❌ API Error:', error.response.data.error || error.message);
    } else {
      console.error('❌ Error:', error.message);
      console.log('\nMake sure:');
      console.log('1. The backend server is running (npm run dev)');
      console.log('2. OPENAI_API_KEY is set in the .env file');
      console.log('3. The API key is valid and has credits');
    }
  }
}

async function executeTest(code) {
  try {
    console.log('\n🏃 Executing generated test...');

    const response = await axios.post(`${API_URL}/execute`, { code });

    if (response.data.success) {
      console.log('✅ Test execution completed!');
      console.log('Output:', response.data.data.output);
    } else {
      console.error('❌ Test execution failed:', response.data.error);
    }
  } catch (error) {
    console.error('❌ Execution error:', error.response?.data?.error || error.message);
  }
}

async function getTestHistory() {
  try {
    console.log('\n📚 Fetching test generation history...');

    const response = await axios.get(`${API_URL}/history?limit=5`);

    if (response.data.success) {
      console.log(`Found ${response.data.data.count} recent test(s)`);
      // History entries would be displayed here
    }
  } catch (error) {
    console.error('❌ Failed to fetch history:', error.message);
  }
}

// Run the example
(async () => {
  console.log('========================================');
  console.log('  Test Generation with GPT-4o-mini');
  console.log('========================================\n');

  await generateTest();
  await getTestHistory();
})();