# KoaLens Backend AI Implementation

This document provides an overview of the AI integration implemented in the KoaLens Backend application.

## Architecture Overview

The backend implements a flexible AI service architecture that allows for multiple AI providers to be used interchangeably. The current implementation supports two AI providers:

1. **Claude (Anthropic)** - The original AI provider
2. **Gemini (Google)** - The newly integrated AI provider

The architecture follows these design principles:
- **Provider-agnostic interface** - Common interface for all AI services
- **Factory pattern** for service instantiation
- **Utility classes** for prompt management and output parsing
- **Configuration-driven** provider selection

## Key Components

### 1. AI Provider Interface

The `AIProvider` interface defines the contract that all AI service implementations must follow, ensuring they can be used interchangeably.

**Location:** `src/types/aiProvider.ts`

```typescript
export interface AIProvider {
  generateContent(prompt: string): Promise<any>;
  generateContentFromMedia(prompt: string, mediaBase64: string, mimeType: string): Promise<any>;
  countTokens(prompt: string): Promise<number>;
}
```

### 2. AI Services

#### Gemini Service

**Location:** `src/services/geminiService.ts`

The Gemini service implements the AIProvider interface using Google's Generative AI SDK. It provides:
- Text generation from prompts
- Multimodal content generation from images/media
- Token counting for prompts

Key features:
- Safety settings configuration
- Error handling and logging
- Token usage tracking

#### Claude Service

**Location:** `src/services/claudeService.ts`

The Claude service implements the AIProvider interface using Anthropic's SDK. It provides similar functionality to the Gemini service but uses the Claude API.

### 3. AI Service Factory

**Location:** `src/services/aiServiceFactory.ts`

The factory class provides a single entry point for getting the currently configured AI service.

Key features:
- Dynamic provider selection based on configuration
- Lazy loading of service implementations
- Singleton instances for efficient resource use

### 4. Prompt Manager

**Location:** `src/utils/promptManager.ts`

The prompt manager handles:
- Storage and management of prompt templates
- Variable substitution in templates
- Default templates for common use cases like ingredient analysis

Usage example:
```typescript
// Load default templates (ingredient analysis, etc.)
promptManager.loadDefaultTemplates();

// Format a prompt with variables
const prompt = promptManager.format('ingredientsAnalysis', {
  ingredients: "Water, sugar, flour, eggs"
});
```

### 5. Output Parser

**Location:** `src/utils/outputParser.ts`

The output parser standardizes AI responses:
- Extracts JSON from text responses
- Validates and normalizes the structure
- Provides type safety for parsed results

### 6. Test Endpoints

**Location:** `src/routes/testGemini.ts`

Two test endpoints have been implemented:
- `/api/ai/test-gemini` - A simple endpoint to test the Gemini API with a prompt
- `/api/ai/test-ingredients` - An endpoint to test ingredient analysis

These endpoints demonstrate the full pipeline from request to response, including prompt formatting and output parsing.

## Configuration

The AI services are configured via environment variables and the `ai-config.js` file. Key configuration settings include:

- **AI Provider:** Determines which AI service to use (gemini/claude)
- **API Keys:** Authentication keys for the respective services
- **Model Names:** Specifies which model variant to use
- **Generation Parameters:** Settings like temperature, max tokens, etc.

## Testing

Tests have been implemented to verify the functionality of the Gemini service:
- Service initialization
- Content generation
- Result parsing
- Token counting

Tests can be run with: `npm test -- geminiService`

## API Usage

### Basic Text Generation

```typescript
const aiService = await AIServiceFactory.getService();
const result = await aiService.generateContent("What is Gemini AI?");
```

### Ingredient Analysis

```typescript
// Format the prompt with ingredients
const prompt = promptManager.format('ingredientsAnalysis', {
  ingredients: "Water, sugar, flour, eggs"
});

// Get the AI service
const aiService = await AIServiceFactory.getService();

// Generate content
const result = await aiService.generateContent(prompt);

// Parse the result
const parsedResult = outputParser.parseAnalysisResult(result);
```

## Next Steps

The following features are planned for future implementation:

1. **Text Analysis Enhancements** - Improving ingredient analysis accuracy
2. **Image Analysis** - Processing images of product packaging
3. **Performance Optimizations** - Caching and efficiency improvements
4. **Advanced Error Handling** - More sophisticated error recovery

## API Reference

### AIProvider Interface

```typescript
interface AIProvider {
  // Generate content from a text prompt
  generateContent(prompt: string): Promise<string>;
  
  // Analyze image/video and generate content
  generateContentFromMedia(prompt: string, mediaBase64: string, mimeType: string): Promise<string>;
  
  // Count tokens for a prompt (approximate estimate)
  countTokens(prompt: string): Promise<number>;
}
```

### PromptManager Methods

```typescript
// Add a new template
addTemplate(name: string, template: string): void;

// Get an existing template
getTemplate(name: string): string | null;

// Format a template with variables
format(templateName: string, vars: Record<string, any>): string;

// Load the default templates
loadDefaultTemplates(): void;
```

### OutputParser Methods

```typescript
// Parse and validate an analysis result
parseAnalysisResult(text: string): AnalysisResult;
```

## Conclusion

The AI integration architecture provides a flexible, maintainable, and extendable system for using multiple AI providers. By abstracting the specific provider implementation details, the system allows for easy switching between providers and future additions of new providers.