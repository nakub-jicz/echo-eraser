// Utility functions for server-side operations

import { json } from "@remix-run/node";

// Error handling helper
export function createErrorResponse(message, status = 400) {
    return json(
        { success: false, error: message },
        { status }
    );
}

// Success response helper
export function createSuccessResponse(data, message = "Operation successful") {
    return json({
        success: true,
        message,
        ...data
    });
}

// Validate required fields
export function validateRequiredFields(data, requiredFields) {
    const missing = requiredFields.filter(field => !data[field]);
    if (missing.length > 0) {
        throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
}

// Safe database operation wrapper
export async function safeDbOperation(operation, errorMessage = "Database operation failed") {
    try {
        return await operation();
    } catch (error) {
        console.error(`Database error: ${error.message}`);
        throw new Error(`${errorMessage}: ${error.message}`);
    }
}

// Validate Shopify product ID format
export function isValidShopifyId(id) {
    return id && typeof id === 'string' && id.startsWith('gid://');
}

// Sanitize product data for safe storage
export function sanitizeProductData(product) {
    return {
        id: product.id,
        title: product.title,
        handle: product.handle,
        status: product.status,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        productType: product.productType,
        vendor: product.vendor,
        tags: product.tags,
        variants: product.variants?.edges?.map(edge => ({
            id: edge.node.id,
            title: edge.node.title,
            sku: edge.node.sku,
            barcode: edge.node.barcode,
            price: edge.node.price,
            inventoryQuantity: edge.node.inventoryQuantity
        })) || [],
        images: product.images?.edges?.map(edge => ({
            id: edge.node.id,
            url: edge.node.url,
            altText: edge.node.altText
        })) || []
    };
}

// Rate limiting helper for API calls
export class RateLimiter {
    constructor(maxRequests = 5, windowMs = 1000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.requests = new Map();
    }

    async checkLimit(key) {
        const now = Date.now();
        const requests = this.requests.get(key) || [];

        // Remove old requests outside the window
        const recentRequests = requests.filter(time => now - time < this.windowMs);

        if (recentRequests.length >= this.maxRequests) {
            const oldestRequest = Math.min(...recentRequests);
            const waitTime = this.windowMs - (now - oldestRequest);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        recentRequests.push(now);
        this.requests.set(key, recentRequests);
    }
}

// Create a rate limiter for GraphQL operations
// Shopify GraphQL Admin API: 2000 points per minute (cost-based rate limiting)
// Most simple queries cost 1 point, complex queries can cost more
export const graphqlRateLimiter = new RateLimiter(30, 1000); // 30 requests per second max (conservative) 