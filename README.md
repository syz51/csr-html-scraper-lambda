# Headless HTML Resolver

A serverless AWS Lambda function that renders client-side JavaScript applications and returns the fully rendered HTML content. This service is particularly useful for scraping single-page applications (SPAs) or any website that relies heavily on JavaScript for content rendering.

## Overview

This project provides an HTTP API endpoint that:

1. Takes a URL as input
2. Launches a headless Chrome browser in AWS Lambda
3. Navigates to the specified URL and waits for the page to render
4. Returns the fully rendered HTML content

The implementation includes several optimizations to work efficiently within the AWS Lambda environment, including browser instance reuse, page pooling, and resource filtering.

## Features

- **Browser Instance Management**: Reuses browser instances to minimize cold starts while implementing timeouts to prevent resource leaks
- **Page Pooling**: Maintains a pool of page objects to improve performance for subsequent requests
- **Resource Optimization**: Blocks unnecessary resources (images, fonts, media) to speed up page loading
- **Custom Wait Conditions**: Supports waiting for specific DOM elements before considering the page fully loaded
- **Cookie Support**: Ability to set cookies for authenticated scraping scenarios
- **Configurable Timeouts**: Adjustable navigation and selector timeouts

## Deployment

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18.x or higher)
- [Serverless Framework](https://www.serverless.com/) installed globally
- AWS account with appropriate permissions
- [PNPM](https://pnpm.io/) package manager (recommended)

### Deploy to AWS

1. Clone this repository

   ```bash
   git clone https://github.com/yourusername/headless-html-resolver.git
   cd headless-html-resolver
   ```

2. Install dependencies

   ```bash
   pnpm install
   ```

3. Deploy with Serverless Framework

   ```bash
   serverless deploy
   ```

The deployment process will output the HTTP endpoint URL that you can use to access the service.

## Usage

Send a POST request to the deployed API endpoint with a JSON body containing the URL to scrape:

```bash
curl -X POST https://your-api-endpoint.amazonaws.com/html \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

### Request Parameters

| Parameter         | Type   | Required | Description                                          |
| ----------------- | ------ | -------- | ---------------------------------------------------- |
| `url`             | String | Yes      | The URL to navigate to and scrape                    |
| `cookies`         | Array  | No       | Array of cookie objects to set before navigation     |
| `timeout`         | Number | No       | Navigation timeout in milliseconds (default: 29000)  |
| `selector`        | String | No       | CSS selector to wait for before returning the HTML   |
| `selectorTimeout` | Number | No       | Timeout for waiting on the selector (default: 29000) |

### Example Request with All Parameters

```json
{
  "url": "https://example.com/app",
  "cookies": [
    {
      "name": "session",
      "value": "abc123",
      "domain": "example.com"
    }
  ],
  "timeout": 15000,
  "selector": "#main-content",
  "selectorTimeout": 10000
}
```

### Response

For successful requests, the service returns the HTML content with a `200` status code. For errors, it returns a JSON object with error details and an appropriate status code.

## Architecture

The service is built on:

- **AWS Lambda**: Serverless compute service
- **Node.js**: Runtime environment
- **Puppeteer**: High-level API to control Chrome/Chromium
- **@sparticuz/chromium**: Chrome binary compatible with AWS Lambda

The implementation uses:

- **Browser Lifecycle Management**: Tracks browser age and idle time to manage resources efficiently
- **Page Pooling**: Maintains a small pool of browser pages to improve performance
- **Request Interception**: Blocks unnecessary resources to improve rendering speed

## Configuration

The service is configured via the `serverless.yml` file:

- **Memory**: 1024MB (adjust based on your scraping needs)
- **Timeout**: 29 seconds
- **Region**: ap-northeast-1 (Tokyo) - change to your preferred region

## Limitations

- The maximum execution time is limited by AWS Lambda's timeout (up to 15 minutes, but set to 29 seconds by default)
- Heavy websites might require more memory allocation
- The service blocks images, fonts, and media resources by default to improve performance

## Development

### Local Testing

1. Install dependencies

   ```bash
   pnpm install
   ```

2. Run locally using Serverless offline (requires additional plugin)

   ```bash
   pnpm add -D serverless-offline
   ```

   Add to `serverless.yml`:

   ```yaml
   plugins:
     - serverless-offline
   ```

   Then run:

   ```bash
   serverless offline
   ```

### Customization

- Modify `browserArgs` in the `getBrowser` function to optimize Chrome for your specific needs
- Adjust resource blocking in the request interception handler to include/exclude specific resource types

## License

Apache-2.0

## Author

[github.com/syz51](https://github.com/syz51)
