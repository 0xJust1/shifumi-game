export interface RateLimitOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryOnError?: (error: any) => boolean;
}

/**
 * A utility function that wraps async operations with rate limiting protection.
 * It implements exponential backoff with jitter for retries.
 * 
 * @param fn The async function to execute with rate limiting
 * @param options Configuration options for retry behavior
 * @returns The result of the function call
 */
export async function withRateLimit<T>(
  fn: () => Promise<T>,
  options: RateLimitOptions = {}
): Promise<T> {
  const {
    maxRetries = 5, // Increase max retries
    baseDelay = 1000,
    maxDelay = 15000, // Increase max delay
    retryOnError = (error) => {
      if (!(error instanceof Error)) return false;
      
      // Check for various rate limiting indicators
      const errorMsg = error.message.toLowerCase();
      return errorMsg.includes('429') || 
        errorMsg.includes('rate limit') ||
        errorMsg.includes('too many requests') ||
        errorMsg.includes('timeout') ||
        errorMsg.includes('exceeded') ||
        errorMsg.includes('requests limited');
    }
  } = options;

  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Check if it's a rate limit error
      if (retryOnError(error)) {
        attempt++;
        
        if (attempt < maxRetries) {
          // Exponential backoff with jitter for better distribution
          const delay = Math.min(
            baseDelay * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5),
            maxDelay
          );
          
          console.log(`Rate limited, retrying in ${Math.round(delay)}ms (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      // If it's not a rate limit error or we're out of retries, throw
      throw error;
    }
  }

  throw lastError || new Error('Rate limit exceeded after all retries');
}

/**
 * Batch processor that handles multiple async operations with rate limiting
 * @param items Array of items to process
 * @param processFn Function to process each item
 * @param options Configuration options for batching
 * @returns Array of processed results
 */
export async function processBatch<T, R>(
  items: T[],
  processFn: (item: T, index: number) => Promise<R>,
  options: {
    batchSize?: number;
    delayBetweenBatches?: number;
    delayBetweenItems?: number;
    onProgress?: (processed: number, total: number) => void;
  } = {}
): Promise<R[]> {
  const {
    batchSize = 5,
    delayBetweenBatches = 1000,
    delayBetweenItems = 200,
    onProgress
  } = options;
  
  const results: R[] = [];
  const totalItems = items.length;
  
  for (let i = 0; i < totalItems; i += batchSize) {
    // Add delay between batches (except first batch)
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
    
    const batch = items.slice(i, i + batchSize);
    const batchPromises: Promise<R>[] = [];
    
    // Process each item in the current batch
    for (let j = 0; j < batch.length; j++) {
      const index = i + j;
      const item = batch[j];
      
      // Add delay between items in the same batch (except first item)
      if (j > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenItems));
      }
      
      // Process the item with rate limiting
      const promise = withRateLimit(() => processFn(item, index));
      batchPromises.push(promise);
    }
    
    // Wait for all items in this batch
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Report progress
    if (onProgress) {
      onProgress(Math.min(i + batchSize, totalItems), totalItems);
    }
  }
  
  return results;
} 