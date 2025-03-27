# KoaLens Backend API Endpoints

This document provides an overview of the available API endpoints in the KoaLens backend.

## Core Analysis Endpoints

These are the primary endpoints for ingredient analysis:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analyze/text` | POST | Analyze ingredient text or ingredient list |
| `/api/analyze/image` | POST | Analyze ingredient image |

## Frontend Compatibility Endpoints

These endpoints maintain compatibility with the frontend application:

| Endpoint | Method | Description | Maps To |
|----------|--------|-------------|---------|
| `/api/ai/analyze-text` | POST | Analyze ingredient text (frontend compatibility) | Same as `/api/analyze/text` |
| `/api/ai/analyze-image` | POST | Analyze ingredient image (frontend compatibility) | Same as `/api/analyze/image` |

## Testing and Development Endpoints

These endpoints are for testing and development purposes:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/test-gemini` | POST | Test the Gemini AI service directly |
| `/api/ai/test-ingredients` | POST | Test ingredient analysis using Gemini |
| `/api/health` | GET | Health check endpoint |

## Request and Response Formats

### Text Analysis

**Request:**

```json
{
  "ingredients": ["milk", "sugar", "flour", "salt"],
  // OR
  "text": "Ingredients: milk, sugar, flour, salt"
}
```

**Response:**

```json
{
  "isVegan": false,
  "confidence": 0.95,
  "ingredientList": ["milk", "sugar", "flour", "salt"],
  "nonVeganIngredients": ["milk"],
  "reasoning": "Contains milk which is a dairy product and not vegan.",
  "imageQualityIssues": []
}
```

### Image Analysis

**Request:**

```json
{
  "image": "data:image/jpeg;base64,...", // Base64 encoded image data
  "preferredLanguage": "en" // Optional, defaults to Swedish
}
```

**Response:**

```json
{
  "isVegan": false,
  "confidence": 0.9,
  "ingredientList": ["milk", "sugar", "flour", "salt"],
  "nonVeganIngredients": ["milk"],
  "reasoning": "Contains milk which is a dairy product and not vegan.",
  "imageQualityIssues": ["BLUR"] // May be empty if no issues detected
}
```

## Testing the API

You can test the API endpoints using the provided script:

```bash
node scripts/test-api-endpoints.js
```

This script will test both the original analysis endpoints and the frontend compatibility endpoints to ensure everything is working correctly. 