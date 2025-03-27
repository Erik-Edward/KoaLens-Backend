// Script to test API endpoints
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3000/api';
const TEST_IMAGE_PATH = path.join(__dirname, '..', 'src', 'tests', 'test-data', 'test-image.jpg');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

// Test functions
async function testAnalyzeImageEndpoint() {
  console.log(`${colors.blue}Testing /api/ai/analyze-image endpoint...${colors.reset}`);
  
  try {
    // Read test image
    let imageBase64;
    
    if (fs.existsSync(TEST_IMAGE_PATH)) {
      const imageBuffer = fs.readFileSync(TEST_IMAGE_PATH);
      imageBase64 = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
    } else {
      // Create a simple 1x1 pixel image if test image doesn't exist
      imageBase64 = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      console.log(`${colors.yellow}Test image not found, using placeholder image${colors.reset}`);
    }
    
    // Send request
    const response = await fetch(`${API_URL}/ai/analyze-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: imageBase64,
        preferredLanguage: 'en'
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`${colors.green}✓ Endpoint /api/ai/analyze-image is working!${colors.reset}`);
      console.log('Response contains:', Object.keys(data).join(', '));
      return true;
    } else {
      const errorData = await response.text();
      console.log(`${colors.red}✗ Endpoint /api/ai/analyze-image returned ${response.status}${colors.reset}`);
      console.log('Error:', errorData);
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}✗ Error testing /api/ai/analyze-image: ${error.message}${colors.reset}`);
    return false;
  }
}

async function testAnalyzeTextEndpoint() {
  console.log(`${colors.blue}Testing /api/ai/analyze-text endpoint...${colors.reset}`);
  
  try {
    // Send request
    const response = await fetch(`${API_URL}/ai/analyze-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredients: ['milk', 'sugar', 'flour', 'salt']
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`${colors.green}✓ Endpoint /api/ai/analyze-text is working!${colors.reset}`);
      console.log('Response contains:', Object.keys(data).join(', '));
      return true;
    } else {
      const errorData = await response.text();
      console.log(`${colors.red}✗ Endpoint /api/ai/analyze-text returned ${response.status}${colors.reset}`);
      console.log('Error:', errorData);
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}✗ Error testing /api/ai/analyze-text: ${error.message}${colors.reset}`);
    return false;
  }
}

async function testOriginalEndpoints() {
  console.log(`${colors.blue}Testing original endpoints...${colors.reset}`);
  
  try {
    // Test health endpoint
    const healthResponse = await fetch(`${API_URL}/health`);
    if (healthResponse.ok) {
      console.log(`${colors.green}✓ Health endpoint is working!${colors.reset}`);
    } else {
      console.log(`${colors.red}✗ Health endpoint returned ${healthResponse.status}${colors.reset}`);
    }
    
    // Test analyze/image endpoint
    const analyzeImageResponse = await fetch(`${API_URL}/analyze/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' })
    });
    
    if (analyzeImageResponse.ok) {
      console.log(`${colors.green}✓ Original /api/analyze/image endpoint is working!${colors.reset}`);
    } else {
      console.log(`${colors.red}✗ Original /api/analyze/image endpoint returned ${analyzeImageResponse.status}${colors.reset}`);
    }
    
    return healthResponse.ok;
  } catch (error) {
    console.log(`${colors.red}✗ Error testing original endpoints: ${error.message}${colors.reset}`);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log(`${colors.blue}=== API Endpoint Testing ===\n${colors.reset}`);
  console.log(`Testing API at: ${API_URL}`);
  
  // First check if server is running
  const serverRunning = await testOriginalEndpoints();
  
  if (!serverRunning) {
    console.log(`${colors.red}Server doesn't appear to be running. Please start the server before testing.${colors.reset}`);
    return;
  }
  
  // Test new endpoints
  console.log('\n=== Testing New Endpoints ===');
  const imageTestResult = await testAnalyzeImageEndpoint();
  const textTestResult = await testAnalyzeTextEndpoint();
  
  // Summary
  console.log(`\n${colors.blue}=== Test Summary ===\n${colors.reset}`);
  console.log(`Image analysis endpoint: ${imageTestResult ? colors.green + 'PASS' : colors.red + 'FAIL'}${colors.reset}`);
  console.log(`Text analysis endpoint: ${textTestResult ? colors.green + 'PASS' : colors.red + 'FAIL'}${colors.reset}`);
  
  if (imageTestResult && textTestResult) {
    console.log(`\n${colors.green}All tests passed! Frontend compatibility endpoints are working.${colors.reset}`);
  } else {
    console.log(`\n${colors.red}Some tests failed. Please check the logs above.${colors.reset}`);
  }
}

// Run tests
runTests().catch(error => {
  console.error(`${colors.red}Test script error:${colors.reset}`, error);
}); 