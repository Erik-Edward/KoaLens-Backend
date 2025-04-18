/**
 * Interface for a single ingredient analysis result
 */
export interface IngredientAnalysisResult {
  name: string;
  isVegan: boolean | null;
  isUncertain: boolean;
  confidence: number;
  reason?: string;
  usageInfo?: UsageInfo;
  source: "declared" | "trace";
}

/**
 * Interface for usage information
 */
export interface UsageInfo {
  analysesUsed: number;
  analysesLimit: number;
  remaining: number;
  isPremium?: boolean;
}

/**
 * Interface for video analysis result
 */
export interface VideoAnalysisResult {
  ingredients: IngredientAnalysisResult[];
  isVegan: boolean | null;
  isUncertain: boolean;
  confidence: number;
  reasoning?: string;
  uncertainReasons?: string[];
  uncertainIngredients: string[];
  nonVeganIngredients: string[];
  usageInfo?: UsageInfo;
  videoProcessed?: boolean;
  preferredLanguage?: string;
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
  isVegan: boolean | null;
  isUncertain: boolean;
  confidence: number;
  reason?: string;
  uncertainIngredients?: IngredientAnalysisResult[];
  nonVeganIngredients?: IngredientAnalysisResult[];
}

/**
 * Union type for any analysis result
 */
export type AnalysisResult = VideoAnalysisResult | ImageAnalysisResult; 