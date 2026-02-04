import { AxiosError } from 'axios';

/**
 * Extracts a user-friendly error message from an API error.
 * Handles network errors, timeout errors, and server errors gracefully.
 */
export function getErrorMessage(error: unknown, fallbackMessage: string = 'An error occurred'): string {
  // Check if it's an Axios error
  if (isAxiosError(error)) {
    // Network error (offline, DNS failure, etc.)
    if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
      return 'Unable to connect to the server. Please check your internet connection and try again.';
    }

    // Timeout error
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return 'The request timed out. Please try again.';
    }

    // Server responded with an error
    if (error.response) {
      const status = error.response.status;
      const serverMessage = error.response.data?.error || error.response.data?.message;

      // Return server-provided message if available
      if (serverMessage && typeof serverMessage === 'string') {
        return serverMessage;
      }

      // Default messages based on status code
      switch (status) {
        case 400:
          return 'Invalid request. Please check your input and try again.';
        case 401:
          return 'Your session has expired. Please log in again.';
        case 403:
          return 'You do not have permission to perform this action.';
        case 404:
          return 'The requested resource was not found.';
        case 409:
          return 'A conflict occurred. The data may have been modified by another user.';
        case 422:
          return 'Validation failed. Please check your input.';
        case 429:
          return 'Too many requests. Please wait a moment and try again.';
        case 500:
        case 502:
        case 503:
        case 504:
          return 'The server encountered an error. Please try again later.';
        default:
          return fallbackMessage;
      }
    }

    // Request was made but no response received
    if (error.request) {
      return 'Unable to reach the server. Please check your connection and try again.';
    }
  }

  // Check if error has a message property
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: string }).message;
    if (msg === 'Network Error') {
      return 'Unable to connect to the server. Please check your internet connection and try again.';
    }
    return msg;
  }

  // Fallback
  return fallbackMessage;
}

/**
 * Type guard to check if an error is an Axios error
 */
function isAxiosError(error: unknown): error is AxiosError {
  return (
    error !== null &&
    typeof error === 'object' &&
    'isAxiosError' in error &&
    (error as AxiosError).isAxiosError === true
  );
}

/**
 * Check if an error is a network-related error
 */
export function isNetworkError(error: unknown): boolean {
  if (isAxiosError(error)) {
    return (
      error.code === 'ERR_NETWORK' ||
      error.message === 'Network Error' ||
      !error.response
    );
  }
  return false;
}
