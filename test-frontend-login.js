const puppeteer = require('puppeteer');

async function testFrontendLogin() {
  let browser;
  try {
    console.log('🚀 Starting frontend login test...');
    
    browser = await puppeteer.launch({ 
      headless: false, // Set to true for headless mode
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Listen for console messages
    page.on('console', msg => {
      console.log('Browser console:', msg.text());
    });
    
    // Listen for network requests
    page.on('response', response => {
      if (response.url().includes('/api/v1/auth/login')) {
        console.log('Login API response:', response.status());
      }
    });
    
    console.log('📱 Navigating to login page...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
    
    console.log('✍️ Filling login form...');
    await page.type('#identifier', 'testuser@example.com');
    await page.type('#password', 'testpass123');
    
    console.log('🔐 Submitting login form...');
    await page.click('button[type="submit"]');
    
    // Wait for navigation or error message
    try {
      await page.waitForNavigation({ timeout: 5000 });
      console.log('✅ Login successful - redirected to:', page.url());
    } catch (error) {
      // Check for error messages on the page
      const errorMessage = await page.$eval('.text-red-600', el => el.textContent).catch(() => null);
      if (errorMessage) {
        console.log('❌ Login failed with error:', errorMessage);
      } else {
        console.log('⏳ No immediate redirect, checking current page...');
        console.log('Current URL:', page.url());
      }
    }
    
    // Check if user is authenticated by looking for user data
    const isAuthenticated = await page.evaluate(() => {
      return document.cookie.includes('auth-token');
    });
    
    console.log('🔍 Authentication status:', isAuthenticated ? 'Authenticated' : 'Not authenticated');
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'login-test-result.png' });
    console.log('📸 Screenshot saved as login-test-result.png');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Check if puppeteer is available
try {
  testFrontendLogin();
} catch (error) {
  console.log('⚠️ Puppeteer not available. Please test manually in browser:');
  console.log('1. Go to http://localhost:3000/login');
  console.log('2. Enter email: testuser@example.com');
  console.log('3. Enter password: testpass123');
  console.log('4. Click Sign in');
  console.log('5. Check if you are redirected to dashboard');
}
