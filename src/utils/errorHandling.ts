/**
 * Utilities for handling errors consistently across the application
 */

/**
 * Format an error object into a string message
 * @param error - The error object to format
 * @returns A string representation of the error
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  } else if (typeof error === 'string') {
    return error;
  } else if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error);
    } catch {
      return `[Object]: ${String(error)}`;
    }
  }
  return String(error);
} 