const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function testDirect() {
  try {
    console.log('Testing with direct path to ChromeDriver...');

    const service = new chrome.ServiceBuilder('D:\\Claude\\Endeavor_2\\drivers\\chromedriver.exe');
    const options = new chrome.Options();
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--disable-gpu');

    const driver = await new Builder()
      .forBrowser('chrome')
      .setChromeService(service)
      .setChromeOptions(options)
      .build();

    console.log('Success! Chrome launched');
    await driver.get('https://google.com');
    console.log('Navigated to Google');
    await driver.quit();
    console.log('Test complete');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testDirect();