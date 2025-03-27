const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

// Initialize these variables outside the handler
let browser = null;
let browserPromise = null;
let browserLastUsedTime = null;
const BROWSER_MAX_IDLE_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds
const BROWSER_MAX_AGE = 30 * 60 * 1000; // 30 minutes in milliseconds
let browserStartTime = null;

// Function to get or create browser
const getBrowser = async () => {
  const now = Date.now();

  // Check if browser is too old or has been idle too long
  if (browser && (
    (now - browserStartTime > BROWSER_MAX_AGE) ||
    (now - browserLastUsedTime > BROWSER_MAX_IDLE_TIME)
  )) {
    console.log('Closing stale browser instance');
    try {
      await browser.close();
    } catch (e) {
      console.error("Error closing stale browser:", e);
    }
    browser = null;
    browserPromise = null;
  }

  if (browser) {
    browserLastUsedTime = now;
    return browser;
  }

  if (!browserPromise) {
    console.log('Launching new browser instance');
    const executablePath = await chromium.executablePath();

    // Optimize Chromium args for Lambda
    const browserArgs = [
      ...chromium.args,
      '--single-process', // Reduces memory usage
      '--disable-dev-shm-usage', // Prevents crashes in limited memory environments
      '--disable-gpu', // Not needed in Lambda
      '--no-zygote', // Faster startup
      '--no-sandbox', // Required in Lambda
      '--disable-setuid-sandbox'
    ];

    browserPromise = puppeteer.launch({
      args: browserArgs,
      defaultViewport: {
        width: 1280,
        height: 800,
        deviceScaleFactor: 1,
      },
      executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    browserStartTime = now;
  }

  try {
    browser = await browserPromise;
    browserLastUsedTime = now;
    return browser;
  } catch (error) {
    console.error("Error creating browser:", error);
    browserPromise = null;
    throw error;
  }
};

// Page pool implementation
const pagePool = {
  pages: [],
  maxSize: 3, // Maximum pages to keep in the pool

  async acquire() {
    if (this.pages.length > 0) {
      return this.pages.pop();
    }

    const browser = await getBrowser();
    return await browser.newPage();
  },

  release(page) {
    if (this.pages.length < this.maxSize) {
      // Reset page state before returning to pool
      try {
        page.removeAllListeners();
        page.goto('about:blank').catch(() => { });
        this.pages.push(page);
      } catch (e) {
        console.error("Error resetting page:", e);
        page.close().catch(() => { });
      }
    } else {
      page.close().catch(() => { });
    }
  }
};

// Lambda handler function
exports.handler = async (event, context) => {
  // Tell Lambda not to wait for Node.js event loop to be empty
  context.callbackWaitsForEmptyEventLoop = false;

  // Efficient request parsing
  const requestData = event.body
    ? (typeof event.body === "string" ? JSON.parse(event.body) : event.body)
    : event;

  // Extract and validate URL
  const url = requestData.url;
  if (!url) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "URL parameter is required" })
    };
  }

  try {
    new URL(url);
  } catch (error) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: `Invalid URL format: ${url}` })
    };
  }

  const cookies = requestData.cookies || [];
  const timeout = requestData.timeout || 30000; // Default 30s timeout
  const page = await pagePool.acquire();

  try {
    // Set timeout for the entire operation
    const navigationPromise = Promise.race([
      (async () => {
        // Set cookies if needed
        if (cookies.length > 0) {
          const domain = new URL(url).hostname;
          const validCookies = cookies
            .filter(c => c.name && c.value)
            .map(c => ({ ...c, domain: c.domain || domain }));

          if (validCookies.length > 0) {
            await page.setCookie(...validCookies);
          }
        }

        // Set performance options
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          // Block unnecessary resources to speed up loading
          const resourceType = req.resourceType();
          if (resourceType === 'image' || resourceType === 'font' || resourceType === 'media') {
            req.abort();
          } else {
            req.continue();
          }
        });

        // Navigate with optimized settings
        await page.goto(url, {
          waitUntil: 'domcontentloaded', // Faster than networkidle2
          timeout: timeout - 1000 // Leave 1s for content extraction
        });

        // Extract HTML content
        return await page.content();
      })(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Navigation timeout')), timeout)
      )
    ]);

    const htmlContent = await navigationPromise;

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: htmlContent,
    };

  } catch (error) {
    console.error("Scraping error:", error);

    // Check for browser/connection errors
    const errorMsg = error.message.toLowerCase();
    if (errorMsg.includes('protocol') ||
      errorMsg.includes('target closed') ||
      errorMsg.includes('connection') ||
      errorMsg.includes('session closed')) {
      console.log("Browser connection issue detected, resetting");
      if (browser) {
        try {
          await browser.close();
        } catch (e) { }
        browser = null;
        browserPromise = null;
      }
      // Don't return the page to the pool
      try { await page.close(); } catch (e) { }
    } else {
      // Return page to pool for non-connection errors
      pagePool.release(page);
    }

    return {
      statusCode: error.message.includes('timeout') ? 504 : 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to scrape the webpage",
        details: error.message
      }),
    };
  }
};

// Cleanup resources when Lambda container is about to be frozen
process.on('SIGTERM', async () => {
  try {
    if (browser) await browser.close();
  } catch (e) {
    console.error("Error during cleanup:", e);
  }
});
