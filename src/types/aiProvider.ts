import { GenerateContentResult } from '@google/generative-ai';

/**
 * Common interface for AI providers (Gemini and Claude)
 * This interface allows for easy switching between providers
 */
export interface AIProvider {
  /**
   * Generate content from a text prompt
   * @param prompt The text prompt to send to the AI
   * @returns Promise resolving to the generated content
   */
  generateContent(prompt: string): Promise<string>;

  /**
   * Generate content from text and media
   * @param prompt The text prompt to send to the AI
   * @param mediaBase64 The base64-encoded media data
   * @param mimeType The MIME type of the media
   * @returns Promise resolving to the generated content
   */
  generateContentFromMedia(prompt: string, mediaBase64: string, mimeType: string): Promise<string>;

  /**
   * Generate content from text and video
   * @param prompt The text prompt to guide the video analysis
   * @param videoBase64 The base64-encoded video data
   * @param mimeType The MIME type of the video
   * @returns Promise resolving to the generated content
   */
  generateContentFromVideo(prompt: string, videoBase64: string, mimeType: string): Promise<GenerateContentResult | string>;

  /**
   * Count tokens in a prompt (or estimate)
   * @param prompt The text to count tokens for
   * @returns Promise resolving to token count
   */
  countTokens(prompt: string): Promise<number>;
}