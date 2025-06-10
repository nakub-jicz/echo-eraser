// Database import moved to individual functions
import { graphqlRateLimiter, sanitizeProductData } from "./utils.server.js";

// GraphQL query to fetch all products with variants
const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        node {
          id
          title
          handle
          status
          createdAt
          updatedAt
          productType
          vendor
          tags
          variants(first: 250) {
            edges {
              node {
                id
                title
                sku
                barcode
                price
                inventoryQuantity
                inventoryItem {
                  measurement {
                    weight {
                      value
                      unit
                    }
                  }
                }
              }
            }
          }
          images(first: 1) {
            edges {
              node {
                id
                url
                altText
              }
            }
          }
          seo {
            title
            description
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// Fetch all products from Shopify with rate limiting and error handling
export async function fetchAllProducts(admin, maxProducts = 5000) {
    const allProducts = [];
    let hasNextPage = true;
    let cursor = null;
    let requestCount = 0;
    const maxRequests = Math.ceil(maxProducts / 250); // Limit total requests

    console.log(`Starting product fetch... (max ${maxProducts} products)`);

    while (hasNextPage && requestCount < maxRequests) {
        try {
            // Apply rate limiting
            await graphqlRateLimiter.checkLimit('products');

            console.log(`Fetching products batch ${requestCount + 1}...`);

            const response = await admin.graphql(PRODUCTS_QUERY, {
                variables: {
                    first: 250,
                    after: cursor,
                },
            });

            const data = await response.json();

            if (data.errors) {
                console.error('GraphQL Errors:', data.errors);
                throw new Error(`GraphQL Error: ${data.errors[0].message}`);
            }

            if (!data.data?.products) {
                throw new Error('Invalid response structure from Shopify API');
            }

            const products = data.data.products.edges.map(edge => sanitizeProductData(edge.node));
            allProducts.push(...products);

            hasNextPage = data.data.products.pageInfo.hasNextPage;
            cursor = data.data.products.pageInfo.endCursor;
            requestCount++;

            console.log(`Fetched ${products.length} products (total: ${allProducts.length})`);

            // Add a small delay between requests to be more gentle on the API
            if (hasNextPage) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

        } catch (error) {
            console.error(`Error fetching products batch ${requestCount + 1}:`, error);

            // If it's a rate limit error, wait longer and retry
            if (error.message.includes('rate') || error.message.includes('throttl')) {
                console.log('Rate limited, waiting 2 seconds...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue; // Retry the same batch
            }

            throw error; // Re-throw other errors
        }
    }

    console.log(`Product fetch completed! Total products: ${allProducts.length}`);
    return allProducts;
}

// String similarity function using Levenshtein distance
function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    str1 = str1.toLowerCase().trim();
    str2 = str2.toLowerCase().trim();

    if (str1 === str2) return 1;

    const matrix = [];
    const len1 = str1.length;
    const len2 = str2.length;

    for (let i = 0; i <= len2; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= len1; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= len2; i++) {
        for (let j = 1; j <= len1; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    const maxLen = Math.max(len1, len2);
    return (maxLen - matrix[len2][len1]) / maxLen;
}

// Normalize string for better comparison
function normalizeString(str) {
    if (!str) return "";
    return str
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

// Find duplicates by title
export function findDuplicatesByTitle(products, threshold = 0.85) {
    const duplicateGroups = [];
    const processed = new Set();

    for (let i = 0; i < products.length; i++) {
        if (processed.has(products[i].id)) continue;

        const currentProduct = products[i];
        const duplicates = [currentProduct];

        for (let j = i + 1; j < products.length; j++) {
            if (processed.has(products[j].id)) continue;

            const similarity = calculateSimilarity(
                normalizeString(currentProduct.title),
                normalizeString(products[j].title)
            );

            if (similarity >= threshold) {
                duplicates.push(products[j]);
                processed.add(products[j].id);
            }
        }

        if (duplicates.length > 1) {
            duplicateGroups.push({
                rule: 'title',
                products: duplicates,
                similarity: Math.min(...duplicates.slice(1).map(p =>
                    calculateSimilarity(normalizeString(currentProduct.title), normalizeString(p.title))
                ))
            });
            duplicates.forEach(p => processed.add(p.id));
        }
    }

    return duplicateGroups;
}

// Find duplicates by SKU
export function findDuplicatesBySku(products) {
    const skuGroups = {};

    products.forEach(product => {
        // Handle both sanitized and original product structures
        const variants = product.variants || product.variants?.edges?.map(edge => edge.node) || [];

        variants.forEach(variant => {
            if (variant.sku && variant.sku.trim()) {
                const sku = variant.sku.trim();
                if (!skuGroups[sku]) {
                    skuGroups[sku] = [];
                }
                skuGroups[sku].push({
                    product,
                    variant
                });
            }
        });
    });

    return Object.entries(skuGroups)
        .filter(([_, items]) => items.length > 1)
        .map(([sku, items]) => ({
            rule: 'sku',
            sku,
            products: [...new Set(items.map(item => item.product))], // Remove duplicate products
            similarity: 1.0 // Exact match
        }));
}

// Find duplicates by barcode
export function findDuplicatesByBarcode(products) {
    const barcodeGroups = {};

    products.forEach(product => {
        // Handle both sanitized and original product structures
        const variants = product.variants || product.variants?.edges?.map(edge => edge.node) || [];

        variants.forEach(variant => {
            if (variant.barcode && variant.barcode.trim()) {
                const barcode = variant.barcode.trim();
                if (!barcodeGroups[barcode]) {
                    barcodeGroups[barcode] = [];
                }
                barcodeGroups[barcode].push({
                    product,
                    variant
                });
            }
        });
    });

    return Object.entries(barcodeGroups)
        .filter(([_, items]) => items.length > 1)
        .map(([barcode, items]) => ({
            rule: 'barcode',
            barcode,
            products: [...new Set(items.map(item => item.product))],
            similarity: 1.0
        }));
}

// Find duplicates by title + SKU combination
export function findDuplicatesByTitleSku(products, titleThreshold = 0.85) {
    const titleSkuGroups = {};

    products.forEach(product => {
        const normalizedTitle = normalizeString(product.title);
        // Handle both sanitized and original product structures
        const variants = product.variants || product.variants?.edges?.map(edge => edge.node) || [];

        variants.forEach(variant => {
            if (variant.sku && variant.sku.trim()) {
                const key = `${normalizedTitle}|${variant.sku.trim()}`;
                if (!titleSkuGroups[key]) {
                    titleSkuGroups[key] = [];
                }
                titleSkuGroups[key].push({
                    product,
                    variant,
                    normalizedTitle
                });
            }
        });
    });

    const duplicateGroups = [];
    const processed = new Set();

    Object.values(titleSkuGroups).forEach(items => {
        if (items.length > 1) {
            const products = [...new Set(items.map(item => item.product))];
            const groupKey = products.map(p => p.id).sort().join(',');

            if (!processed.has(groupKey)) {
                duplicateGroups.push({
                    rule: 'title_sku',
                    products,
                    similarity: 1.0
                });
                processed.add(groupKey);
            }
        }
    });

    return duplicateGroups;
}

// Find duplicates by title + barcode combination
export function findDuplicatesByTitleBarcode(products, titleThreshold = 0.85) {
    const titleBarcodeGroups = {};

    products.forEach(product => {
        const normalizedTitle = normalizeString(product.title);
        // Handle both sanitized and original product structures
        const variants = product.variants || product.variants?.edges?.map(edge => edge.node) || [];

        variants.forEach(variant => {
            if (variant.barcode && variant.barcode.trim()) {
                const key = `${normalizedTitle}|${variant.barcode.trim()}`;
                if (!titleBarcodeGroups[key]) {
                    titleBarcodeGroups[key] = [];
                }
                titleBarcodeGroups[key].push({
                    product,
                    variant,
                    normalizedTitle
                });
            }
        });
    });

    const duplicateGroups = [];
    const processed = new Set();

    Object.values(titleBarcodeGroups).forEach(items => {
        if (items.length > 1) {
            const products = [...new Set(items.map(item => item.product))];
            const groupKey = products.map(p => p.id).sort().join(',');

            if (!processed.has(groupKey)) {
                duplicateGroups.push({
                    rule: 'title_barcode',
                    products,
                    similarity: 1.0
                });
                processed.add(groupKey);
            }
        }
    });

    return duplicateGroups;
}

// Find duplicates by SKU + barcode combination
export function findDuplicatesBySkuBarcode(products) {
    const skuBarcodeGroups = {};

    products.forEach(product => {
        // Handle both sanitized and original product structures
        const variants = product.variants || product.variants?.edges?.map(edge => edge.node) || [];

        variants.forEach(variant => {
            if (variant.sku && variant.sku.trim() && variant.barcode && variant.barcode.trim()) {
                const key = `${variant.sku.trim()}|${variant.barcode.trim()}`;
                if (!skuBarcodeGroups[key]) {
                    skuBarcodeGroups[key] = [];
                }
                skuBarcodeGroups[key].push({
                    product,
                    variant
                });
            }
        });
    });

    return Object.entries(skuBarcodeGroups)
        .filter(([_, items]) => items.length > 1)
        .map(([key, items]) => ({
            rule: 'sku_barcode',
            key,
            products: [...new Set(items.map(item => item.product))],
            similarity: 1.0
        }));
}

// Main function to find all types of duplicates
export async function findAllDuplicates(products) {
    const allDuplicates = {
        byTitle: findDuplicatesByTitle(products),
        bySku: findDuplicatesBySku(products),
        byBarcode: findDuplicatesByBarcode(products),
        byTitleSku: findDuplicatesByTitleSku(products),
        byTitleBarcode: findDuplicatesByTitleBarcode(products),
        bySkuBarcode: findDuplicatesBySkuBarcode(products)
    };

    return allDuplicates;
}

// Save duplicate groups to database
export async function saveDuplicateGroups(shop, duplicateGroups, rule) {
    const db = (await import("../db.server.js")).default;
    const promises = duplicateGroups.map(group =>
        db.duplicateGroup.create({
            data: {
                shop,
                rule,
                productIds: JSON.stringify(group.products.map(p => p.id)),
                similarity: group.similarity,
            }
        })
    );

    return await Promise.all(promises);
}

// Update duplicate statistics
export async function updateDuplicateStats(shop, duplicates, totalProductsScanned = 0) {
    const db = (await import("../db.server.js")).default;
    const baseStats = {
        byTitle: duplicates.byTitle.length,
        bySku: duplicates.bySku.length,
        byBarcode: duplicates.byBarcode.length,
        byTitleSku: duplicates.byTitleSku.length,
        byTitleBarcode: duplicates.byTitleBarcode.length,
        bySkuBarcode: duplicates.bySkuBarcode.length,
        lastScanAt: new Date(),
    };

    // Try to include totalProductsScanned if the field exists in the schema
    let stats = baseStats;
    try {
        stats = {
            ...baseStats,
            totalProductsScanned,
        };
    } catch (error) {
        console.warn('totalProductsScanned field not available yet, using base stats only');
    }

    return await db.duplicateStats.upsert({
        where: { shop },
        update: stats,
        create: {
            shop,
            ...stats,
        },
    });
}

// Get current duplicate statistics for a shop
export async function getDuplicateStats(shop) {
    const db = (await import("../db.server.js")).default;
    return await db.duplicateStats.findUnique({
        where: { shop },
    });
}

// Create backup of product before deletion
export async function createProductBackup(shop, productId, productData, reason, operation = 'delete') {
    const db = (await import("../db.server.js")).default;
    return await db.productBackup.create({
        data: {
            shop,
            productId,
            productData: JSON.stringify(productData),
            reason,
            operation,
        },
    });
} 