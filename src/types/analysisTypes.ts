/**
 * Interface for a single ingredient analysis result
 */
export interface IngredientAnalysisResult {
  name: string;
  isVegan: boolean;
  confidence: number;
}

/**
 * Interface for video analysis result
 */
export interface VideoAnalysisResult {
  ingredients: IngredientAnalysisResult[];
  isVegan: boolean;
  confidence: number;
}

/**
 * Interface for media analysis request
 */
export interface MediaAnalysisRequest {
  base64Data: string;
  mimeType: string;
  preferredLanguage?: string;
}

/**
 * Interface for image analysis result
 */
export interface ImageAnalysisResult {
  ingredients: IngredientAnalysisResult[];
  isVegan: boolean;
  confidence: number;
}

/**
 * Union type for any analysis result
 */
export type AnalysisResult = VideoAnalysisResult | ImageAnalysisResult; 