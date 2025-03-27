const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

// Lambda handler function
exports.handler = async (event, context) => {
  // Configure Chrome to run in Lambda environment
  const executablePath = await chromium.executablePath();

  // Parse the event to get a consistent request object
  let requestData = {};

  // If the event has a body property (API Gateway)
  if (event.body) {
    // Handle both string and object bodies
    requestData =
      typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  }
  // Direct Lambda invocation (treat the whole event as the request data)
  else {
    requestData = event;
  }

  // Extract URL from the request data
  const url = requestData.url;

  // Validate URL
  if (!url) {
    throw new Error("URL parameter is required");
  }

  // Simple URL validation
  try {
    new URL(url); // This will throw if the URL is invalid
  } catch (error) {
    throw new Error("Invalid URL format: " + url);
  }

  // Extract cookies if present
  const cookies = requestData.cookies || [];

  let browser = null;
  let result = null;

  try {
    // Launch the browser with appropriate Lambda settings
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    // Handle cookies if provided
    if (cookies && Array.isArray(cookies) && cookies.length > 0) {
      // Extract the domain from the URL for cookie setting
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      // Log for debugging
      console.log(`Attempting to set ${cookies.length} cookies for ${domain}`);

      // Set each cookie
      for (const cookieData of cookies) {
        // Ensure each cookie has at least name and value
        if (cookieData.name && cookieData.value) {
          try {
            await browser.setCookie({
              domain: cookieData.domain || domain, // Use provided domain or extract from URL
              ...cookieData,
            });
            console.log(`Successfully set cookie: ${cookieData.name}`);
          } catch (error) {
            console.error(
              `Failed to set cookie ${cookieData.name}:`,
              error.message,
            );
          }
        } else {
          console.error(
            `Invalid cookie format. Missing name or value:`,
            JSON.stringify(cookieData),
          );
        }
      }
    }

    // Open a new page
    const page = await browser.newPage();

    // Navigate to the URL
    await page.goto(url, {
      waitUntil: "networkidle2", // Wait until the network is idle (no more than 2 connections for at least 500ms)
    });

    // Extract the full HTML content
    const htmlContent = await page.content();

    // Prepare successful response
    result = {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html",
      },
      body: htmlContent,
    };
  } catch (error) {
    console.error("Error during web scraping:", error);

    // Prepare error response
    result = {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "Failed to scrape the webpage",
        details: error.message,
      }),
    };
  } finally {
    // Always close the browser to clean up resources
    if (browser !== null) {
      await browser.close();
    }
  }

  return result;
};
