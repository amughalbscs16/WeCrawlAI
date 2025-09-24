const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function testChromeDriver() {
  let driver;
  try {
    console.log('Testing ChromeDriver...');

    // Set Chrome options
    const options = new chrome.Options();
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--disable-gpu');
    options.addArguments('--window-size=1280,720');

    // Set ChromeDriver path
    const service = new chrome.ServiceBuilder('./drivers/chromedriver.exe');

    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .setChromeService(service)
      .build();

    console.log('ChromeDriver started successfully!');

    await driver.get('https://www.google.com');
    console.log('Navigated to Google');

    const title = await driver.getTitle();
    console.log('Page title:', title);

    await driver.quit();
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Error:', error.message);
    if (driver) {
      await driver.quit();
    }
  }
}

testChromeDriver();