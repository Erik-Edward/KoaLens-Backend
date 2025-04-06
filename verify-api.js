/**
 * Verification script for KoaLens Backend API
 * Tests API health, configuration, and Gemini API key
 */
require('dotenv').config();
const fetch = require('node-fetch');

// Configuration
const API_HOST = process.env.API_HOST || 'http://localhost:8080';
const API_KEY = process.env.API_KEY || 'test'; // Replace with actual API key if required
let exitCode = 0;

// Function to format output logs
function logHeader(message) {
  console.log('\n' + '='.repeat(message.length));
  console.log(message);
  console.log('='.repeat(message.length));
}

function logSuccess(message) {
  console.log('✅', message);
}

function logWarning(message) {
  console.log('⚠️', message);
}

function logError(message) {
  console.error('❌', message);
  exitCode = 1;
}

// Test functions
async function testApiHealth() {
  logHeader('Testing API Health');
  try {
    const response = await fetch(`${API_HOST}/`);
    const data = await response.json();
    
    if (response.ok && data.status === 'ok') {
      logSuccess(`API is running in ${data.environment} mode`);
      return true;
    } else {
      logError(`API health check failed: ${JSON.stringify(data)}`);
      return false;
    }
  } catch (error) {
    logError(`Failed to connect to API: ${error.message}`);
    return false;
  }
}

async function testGeminiApiKey() {
  logHeader('Testing Gemini API Key');
  
  // Use the test endpoint if available (and enabled)
  try {
    const response = await fetch(`${API_HOST}/test/test-api-key`);
    
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        logSuccess('Gemini API key is valid');
        console.log(`Model: ${data.modelName}`);
        console.log(`Response from Gemini: "${data.response}"`);
        return true;
      } else {
        logError(`Gemini API key test failed: ${data.message}`);
        if (data.apiKeyConfigured) {
          logWarning('API key is configured but may be invalid');
        } else {
          logError('GEMINI_API_KEY is not configured');
        }
        return false;
      }
    } else {
      logWarning('Test endpoint not available or not enabled');
      logWarning('Set ENABLE_TEST_ROUTES=true to enable test endpoints in production');
      
      // Try checking environment variable directly
      if (process.env.GEMINI_API_KEY) {
        logSuccess('GEMINI_API_KEY is set in the environment');
        console.log(`API key length: ${process.env.GEMINI_API_KEY.length} characters`);
        return true;
      } else {
        logError('GEMINI_API_KEY is not set in the environment');
        return false;
      }
    }
  } catch (error) {
    logError(`Error testing Gemini API key: ${error.message}`);
    // Try checking environment variable directly as fallback
    if (process.env.GEMINI_API_KEY) {
      logWarning('GEMINI_API_KEY is set in the environment but test failed');
      console.log(`API key length: ${process.env.GEMINI_API_KEY.length} characters`);
    } else {
      logError('GEMINI_API_KEY is not set in the environment');
    }
    return false;
  }
}

async function testVideoAnalysisEndpoints() {
  logHeader('Testing Video Analysis Endpoints');
  
  try {
    // Test if the video analysis endpoint exists
    const response = await fetch(`${API_HOST}/video/analyze-video`, {
      method: 'OPTIONS'
    });
    
    if (response.ok || response.status === 405) { // 405 = Method Not Allowed, which means endpoint exists
      logSuccess('Video analysis endpoint exists');
      
      // Test video processing capabilities if test endpoint is available
      try {
        const testResponse = await fetch(`${API_HOST}/test/test-video-processing`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({}) // Just test ffmpeg installation
        });
        
        if (testResponse.ok) {
          const testData = await testResponse.json();
          if (testData.success) {
            logSuccess(`Video processing test successful`);
            if (testData.ffmpegInstalled) {
              logSuccess('ffmpeg is installed and available');
            } else {
              logWarning('ffmpeg is not installed - video optimization will be limited');
            }
          } else {
            logWarning(`Video processing test failed: ${testData.message}`);
          }
        } else {
          logWarning('Video processing test endpoint not available or not enabled');
        }
      } catch (error) {
        logWarning(`Error testing video processing: ${error.message}`);
      }
      
      return true;
    } else {
      logError(`Video analysis endpoint check failed: ${response.status} ${response.statusText}`);
      return false;
    }
  } catch (error) {
    logError(`Error testing video analysis endpoint: ${error.message}`);
    return false;
  }
}

// Main function to run all tests
async function runTests() {
  console.log('Starting API verification...');
  
  const apiHealthResult = await testApiHealth();
  if (!apiHealthResult) {
    logError('API health check failed - skipping remaining tests');
    process.exit(1);
    return;
  }
  
  await testGeminiApiKey();
  await testVideoAnalysisEndpoints();
  
  console.log('\n-----------------------------------');
  if (exitCode === 0) {
    console.log('✅ All critical tests passed!');
  } else {
    console.log('❌ Some tests failed - see logs above');
  }
  console.log('-----------------------------------\n');
  
  process.exit(exitCode);
}

// Run the tests
runTests().catch(error => {
  console.error('Unhandled error in test script:', error);
  process.exit(1);
}); 