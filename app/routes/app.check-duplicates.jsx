import { useState, useEffect, useRef } from "react";
import { useLoaderData, useNavigate, useActionData, useNavigation, useSubmit } from "@remix-run/react";
// Removed redirect import - not needed
import {
    Page,
    Layout,
    Text,
    Card,
    Button,
    BlockStack,
    InlineStack,
    Select,
    Checkbox,
    Thumbnail,
    Badge,
    Banner,
    Icon,
} from "@shopify/polaris";
import {
    RefreshIcon,
    ProductIcon,
    ChevronDownIcon,
    ChevronUpIcon,
} from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
    getDuplicateStats,
    fetchAllProducts,
    findAllDuplicates,
    updateDuplicateStats,
    saveDuplicateGroups
} from "../lib/duplicates.server.js";
// Database import moved to functions that need it

// =============================================================================
// LOADER & ACTION
// =============================================================================
export const loader = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const db = (await import("../db.server.js")).default;

    // Get duplicate statistics
    const stats = await getDuplicateStats(session.shop);

    // Get duplicate groups from database
    const duplicateGroups = await db.duplicateGroup.findMany({
        where: {
            shop: session.shop,
            resolved: false,
        },
        orderBy: {
            createdAt: 'desc',
        },
    });

    // Fetch products for the duplicate groups
    let productsData = [];
    if (duplicateGroups.length > 0) {
        try {
            const allProducts = await fetchAllProducts(admin);

            // Create a map for quick product lookup
            const productMap = new Map();
            allProducts.forEach(product => {
                productMap.set(product.id, product);
            });

            // Build products data with duplicate group information
            duplicateGroups.forEach(group => {
                const productIds = JSON.parse(group.productIds);
                const groupProducts = productIds
                    .map(id => productMap.get(id))
                    .filter(Boolean)
                    .map(product => ({
                        ...product,
                        duplicateRule: group.rule,
                        groupId: group.id,
                        similarity: group.similarity,
                    }));

                productsData.push(...groupProducts);
            });
        } catch (error) {
            console.error("Error fetching products:", error);
        }
    }

    return {
        stats: stats || {
            byTitle: 0,
            bySku: 0,
            byBarcode: 0,
            byTitleSku: 0,
            byTitleBarcode: 0,
            bySkuBarcode: 0,
            totalProductsScanned: 0,
            lastScanAt: null
        },
        duplicateGroups,
        productsData,
        shopDomain: session.shop
    };
};

export const action = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const db = (await import("../db.server.js")).default;
    const formData = await request.formData();
    const action = formData.get("action");

    try {
        if (action === "delete_products") {
            const productIds = JSON.parse(formData.get("productIds"));

            // Delete products from Shopify
            const deletePromises = productIds.map(async (productId) => {
                const response = await admin.graphql(`
                    mutation productDelete($input: ProductDeleteInput!) {
                        productDelete(input: $input) {
                            deletedProductId
                            userErrors {
                                field
                                message
                            }
                        }
                    }
                `, {
                    variables: {
                        input: {
                            id: productId
                        }
                    }
                });

                const result = await response.json();
                if (result.data?.productDelete?.userErrors?.length > 0) {
                    throw new Error(result.data.productDelete.userErrors[0].message);
                }

                return result.data?.productDelete?.deletedProductId;
            });

            const deletedIds = await Promise.all(deletePromises);

            // Mark related duplicate groups as resolved
            // Find all groups that contain any of the deleted products
            const groupsToResolve = await db.duplicateGroup.findMany({
                where: {
                    shop: session.shop,
                    resolved: false
                }
            });

            const groupIdsToResolve = groupsToResolve
                .filter(group => {
                    const groupProductIds = JSON.parse(group.productIds);
                    return productIds.some(deletedId => groupProductIds.includes(deletedId));
                })
                .map(group => group.id);

            if (groupIdsToResolve.length > 0) {
                await db.duplicateGroup.updateMany({
                    where: {
                        id: { in: groupIdsToResolve }
                    },
                    data: {
                        resolved: true,
                        resolvedAt: new Date()
                    }
                });
            }

            return {
                success: true,
                message: `Successfully deleted ${deletedIds.length} products.`,
                deletedCount: deletedIds.length
            };
        }

        if (action === "sync_products") {
            // Create a new scan session
            const scanSession = await db.scanSession.create({
                data: {
                    shop: session.shop,
                    status: 'running',
                    startedAt: new Date()
                }
            });

            // Start the scanning process
            // Fetch all products
            const products = await fetchAllProducts(admin);

            // Update scan session with total products
            await db.scanSession.update({
                where: { id: scanSession.id },
                data: {
                    totalProducts: products.length,
                    scannedProducts: products.length // For now, we scan all at once
                }
            });

            // Clear old unresolved duplicate groups for this shop
            await db.duplicateGroup.deleteMany({
                where: {
                    shop: session.shop,
                    resolved: false
                }
            });

            // Find all types of duplicates
            const duplicates = await findAllDuplicates(products);

            // Calculate total duplicates found
            const totalDuplicates = Object.values(duplicates).reduce((sum, groups) => sum + groups.length, 0);

            // Save duplicate groups to database
            await Promise.all([
                saveDuplicateGroups(session.shop, duplicates.byTitle, 'title'),
                saveDuplicateGroups(session.shop, duplicates.bySku, 'sku'),
                saveDuplicateGroups(session.shop, duplicates.byBarcode, 'barcode'),
                saveDuplicateGroups(session.shop, duplicates.byTitleSku, 'title_sku'),
                saveDuplicateGroups(session.shop, duplicates.byTitleBarcode, 'title_barcode'),
                saveDuplicateGroups(session.shop, duplicates.bySkuBarcode, 'sku_barcode'),
            ]);

            // Update statistics
            await updateDuplicateStats(session.shop, duplicates, products.length);

            // Complete the scan session
            await db.scanSession.update({
                where: { id: scanSession.id },
                data: {
                    status: 'completed',
                    duplicatesFound: totalDuplicates,
                    completedAt: new Date()
                }
            });

            return {
                success: true,
                message: `Sync completed! Found ${totalDuplicates} duplicate groups across ${products.length} products.`,
                duplicates: {
                    byTitle: duplicates.byTitle.length,
                    bySku: duplicates.bySku.length,
                    byBarcode: duplicates.byBarcode.length,
                    byTitleSku: duplicates.byTitleSku.length,
                    byTitleBarcode: duplicates.byTitleBarcode.length,
                    bySkuBarcode: duplicates.bySkuBarcode.length,
                }
            };
        }

        return { success: false, error: "Unknown action" };
    } catch (error) {
        console.error("Action error:", error);

        // Update scan session with error if it exists and this was a sync operation
        if (action === "sync_products") {
            const failedScan = await db.scanSession.findFirst({
                where: {
                    shop: session.shop,
                    status: 'running'
                },
                orderBy: {
                    startedAt: 'desc'
                }
            });

            if (failedScan) {
                await db.scanSession.update({
                    where: { id: failedScan.id },
                    data: {
                        status: 'failed',
                        errorMessage: error?.message || 'Unknown error',
                        completedAt: new Date()
                    }
                });
            }
        }

        return {
            success: false,
            error: `Operation failed: ${error?.message || 'Unknown error'}`
        };
    }
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================
// Meta export for SEO
export const meta = () => {
    return [
        { title: "DC Echo Eraser - Check Duplicates" },
        { name: "description", content: "Find and manage duplicate products in your Shopify store" },
    ];
};

// Error boundary for this route
export function ErrorBoundary({ error }) {
    console.error("Check Duplicates Error:", error);
    return (
        <div style={{ padding: '20px' }}>
            <h1>Something went wrong!</h1>
            <p>Error: {error?.message || 'Unknown error'}</p>
            <a href="/app">Back to Home</a>
        </div>
    );
}

export default function CheckDuplicates() {
    const shopify = useAppBridge();
    const navigate = useNavigate();
    const navigation = useNavigation();
    const submit = useSubmit();
    const mouseRef = useRef({ x: 0, y: 0 });

    // Get real data from loader
    const loaderData = useLoaderData();
    const actionData = useActionData();

    // Safety check for loader data
    if (!loaderData) {
        return (
            <div style={{ padding: '20px' }}>
                <h1>Loading...</h1>
                <p>Please wait while we load the data.</p>
            </div>
        );
    }

    const { stats, duplicateGroups, productsData, shopDomain } = loaderData;

    // =============================================================================
    // STATE MANAGEMENT
    // =============================================================================
    // Real data for duplicates with safety checks
    const duplicateStats = {
        byTitle: stats?.byTitle || 0,
        bySku: stats?.bySku || 0,
        byBarcode: stats?.byBarcode || 0,
        byTitleBarcode: stats?.byTitleBarcode || 0,
        byTitleSku: stats?.byTitleSku || 0,
        bySkuBarcode: stats?.bySkuBarcode || 0
    };

    // Step 2 state - selected duplicate type option
    const [selectedDuplicateType, setSelectedDuplicateType] = useState(null);

    // Step 3 state
    const [selectedRule, setSelectedRule] = useState("");

    // Step 4 state - real duplicate products
    const [selectedProducts, setSelectedProducts] = useState([]);

    // Banner dismissal state
    const [dismissedBanners, setDismissedBanners] = useState(new Set());

    // Step collapse state
    const [collapsedSteps, setCollapsedSteps] = useState(new Set());

    // Convert real product data to display format with safety check
    const duplicateProducts = (productsData || []).map(product => {
        // Handle both sanitized and original product structures
        const firstVariant = product.variants?.[0] || product.variants?.edges?.[0]?.node || {};
        const firstImage = product.images?.[0] || product.images?.edges?.[0]?.node || {};

        return {
            id: product.id,
            image: firstImage.url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-5.png",
            type: "Product",
            title: product.title,
            sku: firstVariant.sku || "",
            barcode: firstVariant.barcode || "",
            price: firstVariant.price || "0.00",
            status: product.status,
            createdAt: new Date(product.createdAt).toLocaleDateString(),
            duplicateRule: product.duplicateRule,
            groupId: product.groupId,
            similarity: product.similarity,
        };
    });

    const totalDuplicatesFound = Object.values(duplicateStats).reduce((sum, count) => sum + count, 0);
    const hasNoDuplicates = totalDuplicatesFound === 0;
    const isScanning = navigation.state === 'submitting' && navigation.formData?.get('action') === 'sync_products';

    // Show toast messages for action results
    useEffect(() => {
        if (actionData?.success && actionData?.message) {
            shopify.toast.show(actionData.message);
        } else if (actionData?.error) {
            shopify.toast.show(actionData.error, { isError: true });
        }
    }, [actionData, shopify]);

    // =============================================================================
    // CONFIGURATION
    // =============================================================================
    const ruleOptions = [
        { label: "Keep the first added", value: "keep_first" },
        { label: "Keep the latest added", value: "keep_latest" },
    ];

    // Duplicate statistics config for rendering cards
    const duplicateTypes = [
        { key: 'byTitle', label: 'Duplicates by title', action: 'title' },
        { key: 'bySku', label: 'Duplicates by SKU', action: 'SKU' },
        { key: 'byBarcode', label: 'Duplicates by barcode', action: 'barcode' },
        { key: 'byTitleBarcode', label: 'Duplicates by title + barcode', action: 'title + barcode' },
        { key: 'byTitleSku', label: 'Duplicates by title + SKU', action: 'title + SKU' },
        { key: 'bySkuBarcode', label: 'Duplicates by SKU + barcode', action: 'SKU + barcode' },
    ];

    // =============================================================================
    // MOUSE TRACKING FOR ADVANCED EFFECTS
    // =============================================================================
    useEffect(() => {
        const handleMouseMove = (e) => {
            mouseRef.current = { x: e.clientX, y: e.clientY };

            // Update CSS custom properties for cursor-following effects
            document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
            document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);

            // Magnetic buttons effect
            const magneticButtons = document.querySelectorAll('.evergreen-magnetic, .evergreen-button-wrapper.evergreen-magnetic, .evergreen-button-wrapper-secondary.evergreen-magnetic');
            magneticButtons.forEach(button => {
                const rect = button.getBoundingClientRect();
                const buttonCenterX = rect.left + rect.width / 2;
                const buttonCenterY = rect.top + rect.height / 2;

                const distance = Math.sqrt(
                    Math.pow(e.clientX - buttonCenterX, 2) + Math.pow(e.clientY - buttonCenterY, 2)
                );

                const maxDistance = 80; // Magnetic field radius

                if (distance < maxDistance) {
                    const pullStrength = (maxDistance - distance) / maxDistance;
                    const pullX = (e.clientX - buttonCenterX) * pullStrength * 0.3;
                    const pullY = (e.clientY - buttonCenterY) * pullStrength * 0.3;

                    if (button.classList.contains('evergreen-button-wrapper') || button.classList.contains('evergreen-button-wrapper-secondary')) {
                        button.style.transform = `translate(${pullX}px, ${pullY}px)`;
                    } else {
                        button.style.setProperty('transform', `translate(${pullX}px, ${pullY}px)`, 'important');
                    }
                } else {
                    if (button.classList.contains('evergreen-button-wrapper') || button.classList.contains('evergreen-button-wrapper-secondary')) {
                        button.style.transform = 'translate(0px, 0px)';
                    } else {
                        button.style.setProperty('transform', 'translate(0px, 0px)', 'important');
                    }
                }
            });

            // Enhanced parallax effect on cards
            const cards = document.querySelectorAll('.evergreen-card-interactive');
            cards.forEach(card => {
                const rect = card.getBoundingClientRect();
                const cardCenterX = rect.left + rect.width / 2;
                const cardCenterY = rect.top + rect.height / 2;

                const deltaX = (e.clientX - cardCenterX) / rect.width;
                const deltaY = (e.clientY - cardCenterY) / rect.height;

                // Different tilt for different card types
                if (card.classList.contains('evergreen-stats-card')) {
                    const maxTilt = 4;
                    const tiltX = deltaY * maxTilt;
                    const tiltY = deltaX * -maxTilt;

                    const mouseXPercent = ((e.clientX - rect.left) / rect.width) * 100;
                    const mouseYPercent = ((e.clientY - rect.top) / rect.height) * 100;

                    if (Math.abs(deltaX) < 0.6 && Math.abs(deltaY) < 0.6) {
                        card.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateZ(10px)`;
                        card.style.setProperty('--mouse-x', `${mouseXPercent}%`);
                        card.style.setProperty('--mouse-y', `${mouseYPercent}%`);

                        if (card.matches(':hover')) {
                            card.style.setProperty('--glow-opacity', '1');
                        }
                    } else {
                        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
                        card.style.setProperty('--glow-opacity', '0');
                    }
                } else {
                    // Other interactive cards
                    const maxTilt = 6;
                    const tiltX = deltaY * maxTilt;
                    const tiltY = deltaX * -maxTilt;

                    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
                        card.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateZ(15px)`;
                    } else {
                        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
                    }
                }
            });
        };

        window.addEventListener('mousemove', handleMouseMove);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    // =============================================================================
    // EVENT HANDLERS
    // =============================================================================
    const handleSyncProducts = () => {
        if (isScanning) {
            shopify.toast.show("Scan is already in progress", { isError: true });
            return;
        }

        // Use Remix's useSubmit hook properly
        const formData = new FormData();
        formData.append('action', 'sync_products');

        submit(formData, { method: 'post' });
    };

    const handleCheckOptions = (type) => {
        // Toggle functionality - if same type clicked, deselect it
        if (selectedDuplicateType === type) {
            setSelectedDuplicateType(null);
        } else {
            setSelectedDuplicateType(type);
        }
    };

    // Navigate back to dashboard
    const handleBack = () => {
        navigate("/app");
    };

    const handleBulkDelete = () => {
        if (!selectedRule) {
            shopify.toast.show("Please select a rule first", { isError: true });
            return;
        }

        if (!selectedDuplicateType) {
            shopify.toast.show("Please select a duplicate type first", { isError: true });
            return;
        }

        const confirmation = confirm(`Are you sure you want to delete all ${selectedDuplicateType} duplicates using rule: ${ruleOptions.find(r => r.value === selectedRule)?.label}? This action cannot be undone.`);
        if (!confirmation) return;

        // Get products matching the selected duplicate type and rule
        const productsToDelete = duplicateProducts
            .filter(product => product.duplicateRule === selectedDuplicateType)
            .map(product => product.id);

        if (productsToDelete.length === 0) {
            shopify.toast.show(`No ${selectedDuplicateType} duplicates found`, { isError: true });
            return;
        }

        // Use useSubmit hook for proper Remix handling
        const formData = new FormData();
        formData.append('action', 'delete_products');
        formData.append('productIds', JSON.stringify(productsToDelete));

        submit(formData, { method: 'post' });
    };

    const handleDeleteSelected = () => {
        if (selectedProducts.length === 0) {
            shopify.toast.show("Please select products to delete", { isError: true });
            return;
        }

        const confirmation = confirm(`Are you sure you want to delete ${selectedProducts.length} selected products? This action cannot be undone.`);
        if (!confirmation) return;

        // Use useSubmit hook for proper Remix handling
        const formData = new FormData();
        formData.append('action', 'delete_products');
        formData.append('productIds', JSON.stringify(selectedProducts));

        submit(formData, { method: 'post' });
    };

    const handleProductSelection = (productId) => {
        if (selectedProducts.includes(productId)) {
            setSelectedProducts(selectedProducts.filter(id => id !== productId));
        } else {
            setSelectedProducts([...selectedProducts, productId]);
        }
    };

    const handleSelectAllProducts = () => {
        if (selectedProducts.length === duplicateProducts.length) {
            setSelectedProducts([]);
        } else {
            setSelectedProducts(duplicateProducts.map(p => p.id));
        }
    };

    const handleDismissBanner = (bannerId) => {
        setDismissedBanners(prev => new Set([...prev, bannerId]));
    };

    const toggleStepCollapse = (stepId) => {
        setCollapsedSteps(prev => {
            const newSet = new Set(prev);
            if (newSet.has(stepId)) {
                newSet.delete(stepId);
            } else {
                newSet.add(stepId);
            }
            return newSet;
        });
    };

    // =============================================================================
    // RENDER
    // =============================================================================
    return (
        <>
            <style>{`
                /* Evergreen Interface Kit Enhanced Styles */
                
                :root {
                    --mouse-x: 0px;
                    --mouse-y: 0px;
                }
                
                .evergreen-page {
                    font-family: -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
                    background-color: #F9FAFB;
                    min-height: 100vh;
                    position: relative;
                    overflow-x: hidden;
                    padding-bottom: 4rem;
                    display: flex;
                    justify-content: center;
                    align-items: flex-start;
                    padding-top: 2rem;
                }
                
                /* Main content centering */
                .Polaris-Page {
                    max-width: 1200px;
                    width: 100%;
                    margin: 0 auto;
                }
                
                /* Steps container centering */
                .Polaris-BlockStack {
                    max-width: 1100px;
                    margin: 0 auto;
                    width: 100%;
                }
                
                /* Individual step cards centering */
                .Polaris-Layout {
                    max-width: 100%;
                    margin: 0 auto;
                    width: 100%;
                }
                
                .Polaris-Layout__Section {
                    display: flex;
                    justify-content: center;
                    width: 100%;
                }
                
                /* Force all cards to have same width */
                .Polaris-Layout__Section > .Polaris-Card {
                    width: 100%;
                    min-width: 1000px;
                    max-width: 1000px;
                    flex: none;
                }
                
                /* Enhanced step card centering */
                .evergreen-card {
                    width: 100% !important;
                    min-width: 1000px !important;
                    max-width: 1000px !important;
                    margin: 0 auto;
                    background: #FFFFFF;
                    border: 1px solid #E5E7EB;
                    border-radius: 12px;
                    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
                    transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    overflow: hidden;
                    z-index: 2;
                }
                
                /* Ensure consistent card structure */
                .Polaris-Card {
                    width: 100% !important;
                    min-width: 1000px !important;
                    max-width: 1000px !important;
                    flex: none !important;
                    margin: 0 auto !important;
                }
                
                .evergreen-card-interactive {
                    transform-style: preserve-3d;
                    transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 250ms ease;
                }
                
                .evergreen-card:hover {
                    box-shadow: 0px 20px 40px -10px rgba(17, 24, 39, 0.15), 0 8px 16px -8px rgba(17, 24, 39, 0.1);
                    transform: translateY(-8px);
                }
                
                .evergreen-button-wrapper {
                    display: inline-block;
                    position: relative;
                    border-radius: 8px;
                    overflow: hidden;
                    transition: all 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
                    background: linear-gradient(120deg, #10B981 0%, #06B6D4 100%);
                    box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.25);
                    cursor: pointer;
                    width: auto;
                    max-width: fit-content;
                }
                
                .evergreen-button-wrapper .Polaris-Button {
                    background: transparent !important;
                    border: none !important;
                    box-shadow: none !important;
                    border-radius: 8px !important;
                    color: #FFFFFF !important;
                    font-weight: 600 !important;
                    margin: 0 !important;
                    padding: 10px 20px !important;
                    font-size: 0.875rem !important;
                    width: auto !important;
                    min-width: auto !important;
                }
                
                .evergreen-button-wrapper-secondary {
                    display: inline-block;
                    position: relative;
                    background: #FFFFFF;
                    border: 1px solid #10B981;
                    border-radius: 8px;
                    overflow: hidden;
                    transition: all 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
                    box-shadow: 0 2px 8px 0 rgba(16, 185, 129, 0.15);
                    cursor: pointer;
                    width: auto;
                    min-width: 100px;
                    max-width: 140px;
                }
                
                /* Responsive button wrapper */
                @media (max-width: 768px) {
                    .evergreen-button-wrapper-secondary {
                        min-width: 90px;
                        max-width: 120px;
                        border-radius: 6px;
                    }
                }
                
                @media (max-width: 480px) {
                    .evergreen-button-wrapper-secondary {
                        min-width: 80px;
                        max-width: 100px;
                        border-radius: 4px;
                    }
                }
                
                .evergreen-button-wrapper-secondary .Polaris-Button {
                    color: #047857 !important;
                    background: transparent !important;
                    border: none !important;
                    box-shadow: none !important;
                    border-radius: 6px !important;
                    margin: 0 !important;
                    padding: 8px 16px !important;
                    position: relative;
                    z-index: 2;
                    font-size: 0.875rem !important;
                    white-space: nowrap !important;
                    overflow: visible !important;
                    width: 100% !important;
                }
                
                /* Responsive button sizing */
                @media (max-width: 768px) {
                    .evergreen-button-wrapper-secondary .Polaris-Button {
                        padding: 6px 12px !important;
                        font-size: 0.8rem !important;
                    }
                }
                
                @media (max-width: 480px) {
                    .evergreen-button-wrapper-secondary .Polaris-Button {
                        padding: 5px 10px !important;
                        font-size: 0.75rem !important;
                    }
                }
                
                .evergreen-button-wrapper:hover {
                    transform: translateY(-2px);
                    box-shadow: 
                        0 8px 25px 0 rgba(16, 185, 129, 0.4),
                        0 0 20px rgba(16, 185, 129, 0.3);
                    filter: brightness(1.1);
                }
                
                .evergreen-stats-card-wrapper {
                    position: relative;
                    cursor: pointer;
                    transition: all 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                
                .evergreen-stats-card-wrapper:hover {
                    transform: translateY(-3px);
                }
                
                .evergreen-stats-card-wrapper:hover .evergreen-stats-content {
                    background: linear-gradient(135deg, #FAFAFA 0%, #F9FAFB 100%);
                    box-shadow: 
                        0px 12px 25px -8px rgba(16, 185, 129, 0.15), 
                        0 4px 12px -2px rgba(17, 24, 39, 0.08),
                        0 0 0 1px rgba(16, 185, 129, 0.1);
                    border: 1px solid rgba(16, 185, 129, 0.2);
                }
                
                .evergreen-stats-card-wrapper .evergreen-stats-content::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: linear-gradient(135deg, rgba(16, 185, 129, 0.03) 0%, rgba(6, 182, 212, 0.03) 100%);
                    opacity: 0;
                    transition: opacity 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
                    pointer-events: none;
                    z-index: 1;
                }
                
                .evergreen-stats-card-wrapper:hover .evergreen-stats-content::before {
                    opacity: 1;
                }
                
                .evergreen-stats-card-wrapper .evergreen-stats-content::after {
                    content: '';
                    position: absolute;
                    top: -50%;
                    left: -50%;
                    width: 200%;
                    height: 200%;
                    background: linear-gradient(
                        45deg,
                        transparent 20%,
                        rgba(16, 185, 129, 0.15) 50%,
                        transparent 80%
                    );
                    transform: translateX(-150%) translateY(-150%) rotate(45deg);
                    transition: transform 800ms cubic-bezier(0.34, 1.56, 0.64, 1);
                    pointer-events: none;
                    z-index: 2;
                    opacity: 0;
                }
                
                .evergreen-stats-card-wrapper:hover .evergreen-stats-content::after {
                    transform: translateX(150%) translateY(150%) rotate(45deg);
                    opacity: 1;
                }
                
                .evergreen-stats-content > * {
                    position: relative;
                    z-index: 3;
                }
                
                .evergreen-stats-content {
                    text-align: center;
                    position: relative;
                    min-height: 180px;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    padding: 20px;
                    background: linear-gradient(135deg, #FFFFFF 0%, #FAFBFB 100%);
                    border-radius: 12px;
                    overflow: hidden;
                }
                
                /* Responsive stats content */
                @media (max-width: 768px) {
                    .evergreen-stats-content {
                        min-height: 160px;
                        padding: 18px 14px;
                    }
                }
                
                @media (max-width: 480px) {
                    .evergreen-stats-content {
                        min-height: 140px;
                        padding: 16px 12px;
                    }
                }
                
                .evergreen-stats-number {
                    font-size: 2.5rem;
                    font-weight: 600;
                    background: linear-gradient(135deg, #10B981 0%, #06B6D4 50%, #10B981 100%);
                    background-size: 200% 200%;
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    line-height: 1;
                    margin: 8px 0;
                    transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    letter-spacing: -0.01em;
                }
                
                /* Responsive stats number */
                @media (max-width: 768px) {
                    .evergreen-stats-number {
                        font-size: 2rem;
                        margin: 6px 0;
                    }
                }
                
                @media (max-width: 480px) {
                    .evergreen-stats-number {
                        font-size: 1.75rem;
                        margin: 4px 0;
                    }
                }
                
                /* Responsive card titles */
                @media (max-width: 768px) {
                    .evergreen-stats-content .Polaris-Text {
                        font-size: 0.875rem !important;
                    }
                }
                
                @media (max-width: 480px) {
                    .evergreen-stats-content .Polaris-Text {
                        font-size: 0.8rem !important;
                        line-height: 1.2 !important;
                    }
                }
                
                .evergreen-magnetic {
                    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                
                /* Step headers enhanced hover */
                .evergreen-step-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    cursor: pointer;
                    padding: 12px 16px;
                    border-radius: 8px;
                    transition: all 250ms ease;
                    margin-bottom: 16px;
                    background: linear-gradient(135deg, rgba(16, 185, 129, 0.03) 0%, rgba(6, 182, 212, 0.02) 100%);
                    border: 1px solid rgba(16, 185, 129, 0.1);
                }

                .evergreen-step-header:hover {
                    background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(6, 182, 212, 0.05) 100%);
                    border-color: rgba(16, 185, 129, 0.2);
                    transform: translateX(4px);
                    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15);
                }
                
                .evergreen-step-title {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    flex: 1;
                }
                
                .evergreen-step-number {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 28px;
                    height: 28px;
                    background: linear-gradient(135deg, #10B981 0%, #059669 100%);
                    color: white;
                    border-radius: 50%;
                    font-weight: 700;
                    font-size: 12px;
                    flex-shrink: 0;
                    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
                }
                
                .evergreen-step-toggle {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 12px;
                    border-radius: 6px;
                    background: rgba(16, 185, 129, 0.1);
                    border: 1px solid rgba(16, 185, 129, 0.2);
                    transition: all 250ms ease;
                    font-size: 12px;
                    font-weight: 500;
                    color: #059669;
                    min-width: 80px;
                    justify-content: center;
                }
                
                .evergreen-step-content {
                    overflow: hidden;
                    transition: all 400ms cubic-bezier(0.4, 0, 0.2, 1);
                    transform-origin: top;
                }

                .evergreen-step-content.collapsed {
                    max-height: 0;
                    opacity: 0;
                    margin-top: 0;
                    margin-bottom: 0;
                    transform: translateY(-10px) scaleY(0.8);
                }

                .evergreen-step-content.expanded {
                    max-height: 2000px;
                    opacity: 1;
                    margin-top: 0;
                    margin-bottom: 0;
                    transform: translateY(0) scaleY(1);
                }
                
                .evergreen-button-epic {
                    position: relative;
                    overflow: hidden;
                    background: linear-gradient(135deg, #10B981 0%, #059669 100%);
                    border: none;
                    border-radius: 8px;
                    padding: 10px 20px;
                    color: white;
                    font-weight: 600;
                    font-size: 0.875rem;
                    cursor: pointer;
                    transition: all 200ms ease;
                    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
                }
                
                .evergreen-button-epic:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.35);
                    background: linear-gradient(135deg, #059669 0%, #047857 100%);
                }
                
                .evergreen-warning-card {
                    background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%);
                    border: 1px solid #F3D898;
                    border-radius: 8px;
                    padding: 16px;
                    position: relative;
                    overflow: hidden;
                    margin: 16px 0;
                    transition: all 250ms ease;
                    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.1);
                }
                
                .evergreen-select-wrapper {
                    position: relative;
                    background: #FFFFFF;
                    border: 1px solid #E5E7EB;
                    border-radius: 8px;
                    overflow: hidden;
                    transition: all 200ms ease;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
                }
                
                .evergreen-product-table {
                    background: linear-gradient(135deg, #FFFFFF 0%, #F9FAFB 100%);
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
                    border: 1px solid #E5E7EB;
                    position: relative;
                }
                
                .evergreen-table-header {
                    background: linear-gradient(135deg, #F9FAFB 0%, #F3F4F6 100%);
                    border-bottom: 2px solid #E5E7EB;
                    position: relative;
                }
                
                .evergreen-table-header th {
                    padding: 16px 12px !important;
                    font-weight: 600 !important;
                    color: #374151 !important;
                    text-transform: uppercase;
                    font-size: 0.75rem !important;
                    letter-spacing: 0.05em;
                    position: relative;
                    transition: all 200ms ease;
                }
                
                .evergreen-product-row {
                    transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    background: #FFFFFF;
                    border-bottom: 1px solid #F3F4F6;
                }
                
                .evergreen-product-row:hover {
                    transform: translateX(4px);
                    box-shadow: 
                        -4px 0 20px rgba(16, 185, 129, 0.1),
                        0 4px 20px rgba(0, 0, 0, 0.08);
                    border-left: 3px solid #10B981;
                    background: linear-gradient(135deg, #FFFFFF 0%, #ECFDF5 100%);
                }
                
                .evergreen-product-row td {
                    padding: 16px 12px !important;
                    position: relative;
                    z-index: 2;
                    transition: all 200ms ease;
                }
                
                .evergreen-epic-checkbox {
                    position: relative;
                    transform: scale(1.2);
                    transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                
                .evergreen-product-image {
                    transition: all 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
                    position: relative;
                    overflow: hidden;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                }
                
                .evergreen-status-badge {
                    position: relative;
                    overflow: hidden;
                    transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
                    border-radius: 6px !important;
                    font-weight: 600 !important;
                    text-transform: uppercase;
                    font-size: 0.75rem !important;
                    letter-spacing: 0.05em;
                }
                
                .evergreen-price-text {
                    font-weight: 600;
                    color: #059669;
                    transition: all 300ms ease;
                    position: relative;
                }
                
                .evergreen-product-title {
                    font-weight: 500;
                    color: #1F2937;
                    transition: all 300ms ease;
                    position: relative;
                }
                
                .evergreen-animation-entrance {
                    animation: evergreenEntrance 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                
                @keyframes evergreenEntrance {
                    from {
                        opacity: 0;
                        transform: translateY(20px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
                
                /* Enhanced hover effects */
                .evergreen-stats-card-wrapper:hover .evergreen-stats-number {
                    transform: scale(1.1) rotateY(5deg);
                    filter: 
                        drop-shadow(0 0 10px rgba(16, 185, 129, 0.6))
                        drop-shadow(0 0 20px rgba(6, 182, 212, 0.4))
                        drop-shadow(0 0 30px rgba(16, 185, 129, 0.2));
                    animation: pulseGlow 1.5s ease-in-out infinite alternate;
                }
                
                @keyframes pulseGlow {
                    0% { 
                        filter: 
                            drop-shadow(0 0 10px rgba(16, 185, 129, 0.6))
                            drop-shadow(0 0 20px rgba(6, 182, 212, 0.4));
                        transform: scale(1.1) rotateY(5deg);
                    }
                    100% { 
                        filter: 
                            drop-shadow(0 0 15px rgba(16, 185, 129, 0.8))
                            drop-shadow(0 0 30px rgba(6, 182, 212, 0.6))
                            drop-shadow(0 0 45px rgba(16, 185, 129, 0.3));
                        transform: scale(1.15) rotateY(-2deg);
                    }
                }
                
                /* Text hover animations */
                .evergreen-stats-card-wrapper:hover .Polaris-Text {
                    animation: textShimmer 2s ease-in-out infinite;
                    transform: translateY(-1px);
                }
                
                @keyframes textShimmer {
                    0%, 100% { 
                        text-shadow: 0 0 5px rgba(16, 185, 129, 0.3);
                    }
                    50% { 
                        text-shadow: 
                            0 0 10px rgba(16, 185, 129, 0.5),
                            0 0 20px rgba(6, 182, 212, 0.3);
                    }
                }
                
                /* Button epic hover effects */
                .evergreen-stats-card-wrapper:hover .evergreen-button-wrapper-secondary {
                    transform: translateY(-3px) rotateZ(1deg);
                    box-shadow: 
                        0 10px 30px rgba(16, 185, 129, 0.3),
                        0 0 0 2px rgba(16, 185, 129, 0.2),
                        inset 0 1px 0 rgba(255, 255, 255, 0.5);
                    background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 50%, #ECFDF5 100%);
                    border-color: #10B981;
                }
                
                .evergreen-stats-card-wrapper:hover .evergreen-button-wrapper-secondary .Polaris-Button {
                    color: #047857 !important;
                    font-weight: 700 !important;
                    text-shadow: 0 0 10px rgba(4, 120, 87, 0.5);
                }
                
                /* Floating particles effect on hover */
                .evergreen-stats-card-wrapper::before {
                    content: '';
                    position: absolute;
                    top: 10%;
                    left: 10%;
                    width: 3px;
                    height: 3px;
                    background: #10B981;
                    border-radius: 50%;
                    opacity: 0;
                    transition: all 400ms ease;
                    box-shadow: 
                        20px 10px 0 1px #06B6D4,
                        40px 20px 0 0px #10B981,
                        60px 5px 0 1px #06B6D4,
                        80px 15px 0 0px #10B981,
                        100px 25px 0 1px #06B6D4,
                        -20px 30px 0 0px #10B981,
                        -40px 10px 0 1px #06B6D4,
                        -60px 25px 0 0px #10B981;
                    animation: floatingParticles 3s ease-in-out infinite;
                    pointer-events: none;
                    z-index: 0;
                }
                
                .evergreen-stats-card-wrapper:hover::before {
                    opacity: 0.7;
                    animation-duration: 2s;
                }
                
                @keyframes floatingParticles {
                    0%, 100% { 
                        transform: translateY(0px) rotate(0deg) scale(1);
                        opacity: 0.3;
                    }
                    25% { 
                        transform: translateY(-5px) rotate(90deg) scale(1.2);
                        opacity: 0.7;
                    }
                    50% { 
                        transform: translateY(-10px) rotate(180deg) scale(0.8);
                        opacity: 1;
                    }
                    75% { 
                        transform: translateY(-5px) rotate(270deg) scale(1.1);
                        opacity: 0.5;
                    }
                }
                
                /* Card rotation and scale effects */
                .evergreen-stats-card-wrapper:hover .evergreen-card {
                    transform: 
                        perspective(1000px) 
                        rotateX(2deg) 
                        rotateY(-1deg) 
                        scale(1.02)
                        translateZ(10px);
                    box-shadow: 
                        0 25px 50px -10px rgba(16, 185, 129, 0.2),
                        0 15px 30px -5px rgba(6, 182, 212, 0.15),
                        0 0 0 3px rgba(16, 185, 129, 0.1),
                        inset 0 1px 0 rgba(255, 255, 255, 0.6);
                    background: linear-gradient(135deg, #FFFFFF 0%, #FAFFFE 50%, #F8FFFE 100%);
                }
                
                /* Enhanced card glow */
                .evergreen-stats-card-wrapper:hover .evergreen-card::before {
                    content: '';
                    position: absolute;
                    top: -5px;
                    left: -5px;
                    right: -5px;
                    bottom: -5px;
                    background: linear-gradient(45deg, #10B981, #06B6D4, #10B981, #06B6D4);
                    background-size: 400% 400%;
                    border-radius: 16px;
                    z-index: -1;
                    animation: gradientGlow 3s ease-in-out infinite;
                    opacity: 0.8;
                    filter: blur(8px);
                }
                
                @keyframes gradientGlow {
                    0%, 100% { 
                        background-position: 0% 50%;
                        filter: blur(8px) brightness(1);
                    }
                    25% { 
                        background-position: 100% 0%;
                        filter: blur(10px) brightness(1.2);
                    }
                    50% { 
                        background-position: 100% 100%;
                        filter: blur(12px) brightness(1.4);
                    }
                    75% { 
                        background-position: 0% 100%;
                        filter: blur(10px) brightness(1.2);
                    }
                }
                
                /* Ripple effect on click */
                .evergreen-stats-card-wrapper {
                    overflow: hidden;
                }
                
                .evergreen-stats-card-wrapper::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 0;
                    height: 0;
                    background: radial-gradient(circle, rgba(16, 185, 129, 0.6) 0%, transparent 70%);
                    border-radius: 50%;
                    transform: translate(-50%, -50%);
                    transition: width 800ms ease, height 800ms ease, opacity 800ms ease;
                    opacity: 0;
                    pointer-events: none;
                    z-index: 1;
                }
                
                .evergreen-stats-card-wrapper:active::after {
                    width: 300px;
                    height: 300px;
                    opacity: 1;
                    transition: width 0ms, height 0ms, opacity 200ms;
                }
                
                /* Magnetic field visualization */
                .evergreen-stats-card-wrapper:hover {
                    animation: magneticPulse 2s ease-in-out infinite;
                }
                
                @keyframes magneticPulse {
                    0%, 100% { 
                        box-shadow: 
                            0 0 0 0px rgba(16, 185, 129, 0.4),
                            0 0 0 5px rgba(16, 185, 129, 0.1);
                    }
                    50% { 
                        box-shadow: 
                            0 0 0 8px rgba(16, 185, 129, 0.2),
                            0 0 0 15px rgba(16, 185, 129, 0.05);
                    }
                }
                
                /* Enhanced disabled state */
                .evergreen-stats-card-wrapper:has(.Polaris-Button[disabled]) {
                    opacity: 0.6;
                    filter: grayscale(0.3);
                    pointer-events: none;
                }
                
                .evergreen-stats-card-wrapper:has(.Polaris-Button[disabled]) .evergreen-stats-number {
                    color: #9CA3AF;
                    background: linear-gradient(135deg, #9CA3AF 0%, #6B7280 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }
                
                /* Grid wave effect */
                .evergreen-duplicate-grid {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(200px, 1fr));
                    gap: 24px;
                    max-width: 800px;
                    margin: 0 auto;
                }
                
                /* Responsive grid for smaller screens */
                @media (max-width: 900px) {
                    .evergreen-duplicate-grid {
                        grid-template-columns: repeat(2, minmax(180px, 1fr));
                        gap: 20px;
                        max-width: 600px;
                    }
                }
                
                @media (max-width: 550px) {
                    .evergreen-duplicate-grid {
                        grid-template-columns: 1fr;
                        gap: 16px;
                        max-width: 300px;
                    }
                }
                
                .evergreen-duplicate-grid .evergreen-stats-card-wrapper:nth-child(1) {
                    animation-delay: 0ms;
                }
                .evergreen-duplicate-grid .evergreen-stats-card-wrapper:nth-child(2) {
                    animation-delay: 100ms;
                }
                .evergreen-duplicate-grid .evergreen-stats-card-wrapper:nth-child(3) {
                    animation-delay: 200ms;
                }
                .evergreen-duplicate-grid .evergreen-stats-card-wrapper:nth-child(4) {
                    animation-delay: 50ms;
                }
                .evergreen-duplicate-grid .evergreen-stats-card-wrapper:nth-child(5) {
                    animation-delay: 150ms;
                }
                .evergreen-duplicate-grid .evergreen-stats-card-wrapper:nth-child(6) {
                    animation-delay: 250ms;
                }
                
                /* Sequential hover effect - wave across grid */
                .evergreen-duplicate-grid:hover .evergreen-stats-card-wrapper:nth-child(1) {
                    animation: cardWave 0.6s ease-out 0s;
                }
                .evergreen-duplicate-grid:hover .evergreen-stats-card-wrapper:nth-child(2) {
                    animation: cardWave 0.6s ease-out 0.1s;
                }
                .evergreen-duplicate-grid:hover .evergreen-stats-card-wrapper:nth-child(3) {
                    animation: cardWave 0.6s ease-out 0.2s;
                }
                .evergreen-duplicate-grid:hover .evergreen-stats-card-wrapper:nth-child(4) {
                    animation: cardWave 0.6s ease-out 0.05s;
                }
                .evergreen-duplicate-grid:hover .evergreen-stats-card-wrapper:nth-child(5) {
                    animation: cardWave 0.6s ease-out 0.15s;
                }
                .evergreen-duplicate-grid:hover .evergreen-stats-card-wrapper:nth-child(6) {
                    animation: cardWave 0.6s ease-out 0.25s;
                }
                
                @keyframes cardWave {
                    0% { 
                        transform: translateY(0px) scale(1);
                    }
                    50% { 
                        transform: translateY(-10px) scale(1.05);
                    }
                    100% { 
                        transform: translateY(0px) scale(1);
                    }
                }
                
                /* Keyboard accessibility enhancements */
                .evergreen-stats-card-wrapper:focus-within {
                    outline: 3px solid rgba(16, 185, 129, 0.6);
                    outline-offset: 3px;
                    transform: translateY(-5px) scale(1.02);
                    animation: focusGlow 2s ease-in-out infinite;
                }
                
                @keyframes focusGlow {
                    0%, 100% { 
                        box-shadow: 
                            0 0 0 3px rgba(16, 185, 129, 0.3),
                            0 10px 25px rgba(16, 185, 129, 0.2);
                    }
                    50% { 
                        box-shadow: 
                            0 0 0 6px rgba(16, 185, 129, 0.5),
                            0 15px 35px rgba(16, 185, 129, 0.3);
                    }
                }
                
                /* Enhanced button states */
                .evergreen-stats-card-wrapper .evergreen-button-wrapper-secondary:focus-within {
                    animation: buttonFocusPulse 1.5s ease-in-out infinite;
                }
                
                @keyframes buttonFocusPulse {
                    0%, 100% { 
                        transform: translateY(-3px) rotateZ(0deg) scale(1);
                        box-shadow: 
                            0 8px 25px rgba(16, 185, 129, 0.25),
                            0 0 0 2px rgba(16, 185, 129, 0.3);
                    }
                    50% { 
                        transform: translateY(-5px) rotateZ(1deg) scale(1.05);
                        box-shadow: 
                            0 12px 35px rgba(16, 185, 129, 0.35),
                            0 0 0 4px rgba(16, 185, 129, 0.5);
                    }
                }
                
                /* Advanced number animation on hover */
                .evergreen-stats-card-wrapper:hover .evergreen-stats-number {
                    animation: numberDance 1.5s ease-in-out infinite;
                }
                
                @keyframes numberDance {
                    0%, 100% { 
                        transform: scale(1.1) rotateY(5deg) rotateZ(0deg);
                    }
                    25% { 
                        transform: scale(1.15) rotateY(-2deg) rotateZ(1deg);
                    }
                    50% { 
                        transform: scale(1.12) rotateY(3deg) rotateZ(-0.5deg);
                    }
                    75% { 
                        transform: scale(1.14) rotateY(-1deg) rotateZ(0.5deg);
                    }
                }
                
                /* Rainbow edge effect on active cards */
                .evergreen-stats-card-wrapper:active {
                    animation: rainbowEdge 0.8s ease-out;
                }
                
                @keyframes rainbowEdge {
                    0% { 
                        box-shadow: 
                            0 0 0 2px #ff0000,
                            0 0 20px rgba(255, 0, 0, 0.5);
                    }
                    16% { 
                        box-shadow: 
                            0 0 0 2px #ff8000,
                            0 0 20px rgba(255, 128, 0, 0.5);
                    }
                    33% { 
                        box-shadow: 
                            0 0 0 2px #ffff00,
                            0 0 20px rgba(255, 255, 0, 0.5);
                    }
                    50% { 
                        box-shadow: 
                            0 0 0 2px #00ff00,
                            0 0 20px rgba(0, 255, 0, 0.5);
                    }
                    66% { 
                        box-shadow: 
                            0 0 0 2px #0080ff,
                            0 0 20px rgba(0, 128, 255, 0.5);
                    }
                    83% { 
                        box-shadow: 
                            0 0 0 2px #8000ff,
                            0 0 20px rgba(128, 0, 255, 0.5);
                    }
                    100% { 
                        box-shadow: 
                            0 0 0 2px #10B981,
                            0 0 20px rgba(16, 185, 129, 0.5);
                    }
                }
                
                /* Step buttons and controls enhanced hover effects */
                
                /* Select dropdown spectacular hover */
                .Polaris-Select {
                    transition: all 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                
                .Polaris-Select:hover {
                    transform: translateY(-2px) scale(1.02);
                    box-shadow: 
                        0 8px 25px rgba(16, 185, 129, 0.2),
                        0 0 0 2px rgba(16, 185, 129, 0.3),
                        inset 0 1px 0 rgba(255, 255, 255, 0.5);
                    background: linear-gradient(135deg, #FFFFFF 0%, #F0FDF4 100%);
                }
                
                .Polaris-Select:hover .Polaris-Select__Content {
                    color: #047857;
                    font-weight: 600;
                    text-shadow: 0 0 10px rgba(4, 120, 87, 0.3);
                }
                
                .Polaris-Select:focus-within {
                    animation: selectFocusGlow 2s ease-in-out infinite;
                    outline: none;
                }
                
                @keyframes selectFocusGlow {
                    0%, 100% { 
                        box-shadow: 
                            0 0 0 3px rgba(16, 185, 129, 0.4),
                            0 8px 25px rgba(16, 185, 129, 0.2);
                        }
                        50% { 
                            box-shadow: 
                                0 0 0 6px rgba(16, 185, 129, 0.6),
                                0 12px 35px rgba(16, 185, 129, 0.3);
                            }
                        }
                        
                        /* Bulk Delete button epic effects */
                        .Polaris-Button--primary {
                            position: relative;
                            overflow: hidden;
                            transition: all 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
                        }
                        
                        .Polaris-Button--primary::before {
                            content: '';
                            position: absolute;
                            top: 0;
                            left: -100%;
                            width: 100%;
                            height: 100%;
                            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
                            transition: left 600ms ease;
                        }
                        
                        .Polaris-Button--primary:hover::before {
                            left: 100%;
                        }
                        
                        .Polaris-Button--primary:hover {
                            transform: translateY(-3px) scale(1.05);
                            box-shadow: 
                                0 15px 35px rgba(220, 38, 38, 0.3),
                                0 0 0 3px rgba(220, 38, 38, 0.2),
                                inset 0 1px 0 rgba(255, 255, 255, 0.3);
                            background: linear-gradient(135deg, #DC2626 0%, #B91C1C 50%, #991B1B 100%);
                            animation: buttonPulse 1.5s ease-in-out infinite;
                        }
                        
                        @keyframes buttonPulse {
                            0%, 100% { 
                                box-shadow: 
                                    0 15px 35px rgba(220, 38, 38, 0.3),
                                    0 0 0 3px rgba(220, 38, 38, 0.2);
                                }
                                50% { 
                                    box-shadow: 
                                        0 20px 45px rgba(220, 38, 38, 0.4),
                                        0 0 0 6px rgba(220, 38, 38, 0.3);
                                }
                            }
                            
                            .Polaris-Button--primary:active {
                                animation: buttonRipple 0.6s ease-out;
                            }
                            
                            @keyframes buttonRipple {
                                0% {
                                    box-shadow: 
                                        0 0 0 0 rgba(220, 38, 38, 0.7),
                                        0 15px 35px rgba(220, 38, 38, 0.3);
                                }
                                100% {
                                    box-shadow: 
                                        0 0 0 20px rgba(220, 38, 38, 0),
                                        0 15px 35px rgba(220, 38, 38, 0.3);
                                }
                            }
                            
                            /* Hide/Show buttons elegant hover */
                            .evergreen-step-toggle {
                                transition: all 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
                                position: relative;
                                overflow: hidden;
                            }
                            
                            .evergreen-step-toggle::after {
                                content: '';
                                position: absolute;
                                top: 50%;
                                left: 50%;
                                width: 0;
                                height: 0;
                                background: radial-gradient(circle, rgba(16, 185, 129, 0.3) 0%, transparent 70%);
                                border-radius: 50%;
                                transform: translate(-50%, -50%);
                                transition: all 400ms ease;
                                pointer-events: none;
                            }
                            
                            .evergreen-step-toggle:hover {
                                transform: translateY(-2px) rotateZ(2deg);
                                box-shadow: 
                                    0 8px 20px rgba(16, 185, 129, 0.25),
                                    0 0 0 2px rgba(16, 185, 129, 0.3);
                                background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
                            }
                            
                            .evergreen-step-toggle:hover::after {
                                width: 100px;
                                height: 100px;
                            }
                            
                            .evergreen-step-toggle:hover .Polaris-Icon {
                                animation: iconSpin 1s ease-in-out infinite;
                                filter: drop-shadow(0 0 8px rgba(16, 185, 129, 0.6));
                            }
                            
                            @keyframes iconSpin {
                                0%, 100% { 
                                    transform: rotate(0deg) scale(1);
                                }
                                50% { 
                                    transform: rotate(180deg) scale(1.2);
                                }
                            }
                            
                            /* Step headers enhanced hover */
                            .evergreen-step-header {
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                cursor: pointer;
                                padding: 12px 16px;
                                border-radius: 8px;
                                transition: all 250ms ease;
                                margin-bottom: 16px;
                                background: linear-gradient(135deg, rgba(16, 185, 129, 0.03) 0%, rgba(6, 182, 212, 0.02) 100%);
                                border: 1px solid rgba(16, 185, 129, 0.1);
                            }

                            .evergreen-step-header:hover {
                                background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(6, 182, 212, 0.05) 100%);
                                border-color: rgba(16, 185, 129, 0.2);
                                transform: translateX(4px);
                                box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15);
                            }
                            
                            .evergreen-step-title {
                                display: flex;
                                align-items: center;
                                gap: 12px;
                                flex: 1;
                            }
                            
                            .evergreen-step-number {
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                width: 28px;
                                height: 28px;
                                background: linear-gradient(135deg, #10B981 0%, #059669 100%);
                                color: white;
                                border-radius: 50%;
                                font-weight: 700;
                                font-size: 12px;
                                flex-shrink: 0;
                                box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
                            }
                            
                            .evergreen-step-toggle {
                                display: flex;
                                align-items: center;
                                gap: 8px;
                                padding: 6px 12px;
                                border-radius: 6px;
                                background: rgba(16, 185, 129, 0.1);
                                border: 1px solid rgba(16, 185, 129, 0.2);
                                transition: all 250ms ease;
                                font-size: 12px;
                                font-weight: 500;
                                color: #059669;
                                min-width: 80px;
                                justify-content: center;
                            }
                            
                            /* Enhanced card consistency - all same width */
                            .evergreen-card {
                                width: 100%;
                                max-width: 1000px;
                                margin: 0 auto;
                                background: #FFFFFF;
                                border: 1px solid #E5E7EB;
                                border-radius: 12px;
                                box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
                                transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
                                position: relative;
                                overflow: hidden;
                                z-index: 2;
                            }
                            
                            .evergreen-step-content {
                                overflow: hidden;
                                transition: all 400ms cubic-bezier(0.4, 0, 0.2, 1);
                                transform-origin: top;
                            }

                            .evergreen-step-content.collapsed {
                                max-height: 0;
                                opacity: 0;
                                margin-top: 0;
                                margin-bottom: 0;
                                transform: translateY(-10px) scaleY(0.8);
                            }

                            .evergreen-step-content.expanded {
                                max-height: 2000px;
                                opacity: 1;
                                margin-top: 0;
                                margin-bottom: 0;
                                transform: translateY(0) scaleY(1);
                            }
                            
                            .evergreen-button-epic {
                                position: relative;
                                overflow: hidden;
                                background: linear-gradient(135deg, #10B981 0%, #059669 100%);
                                border: none;
                                border-radius: 8px;
                                padding: 10px 20px;
                                color: white;
                                font-weight: 600;
                                font-size: 0.875rem;
                                cursor: pointer;
                                transition: all 200ms ease;
                                box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
                                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
                            }
                            
                            .evergreen-button-epic:hover {
                                transform: translateY(-2px);
                                box-shadow: 0 6px 20px rgba(16, 185, 129, 0.35);
                                background: linear-gradient(135deg, #059669 0%, #047857 100%);
                            }
                            
                            .evergreen-warning-card {
                                background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%);
                                border: 1px solid #F3D898;
                                border-radius: 8px;
                                padding: 16px;
                                position: relative;
                                overflow: hidden;
                                margin: 16px 0;
                                transition: all 250ms ease;
                                box-shadow: 0 2px 8px rgba(245, 158, 11, 0.1);
                            }
                            
                            .evergreen-select-wrapper {
                                position: relative;
                                background: #FFFFFF;
                                border: 1px solid #E5E7EB;
                                border-radius: 8px;
                                overflow: hidden;
                                transition: all 200ms ease;
                                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
                            }
                            
                            .evergreen-product-table {
                                background: linear-gradient(135deg, #FFFFFF 0%, #F9FAFB 100%);
                                border-radius: 12px;
                                overflow: hidden;
                                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
                                border: 1px solid #E5E7EB;
                                position: relative;
                            }
                            
                            .evergreen-table-header {
                                background: linear-gradient(135deg, #F9FAFB 0%, #F3F4F6 100%);
                                border-bottom: 2px solid #E5E7EB;
                                position: relative;
                            }
                            
                            .evergreen-table-header th {
                                padding: 16px 12px !important;
                                font-weight: 600 !important;
                                color: #374151 !important;
                                text-transform: uppercase;
                                font-size: 0.75rem !important;
                                letter-spacing: 0.05em;
                                position: relative;
                                transition: all 200ms ease;
                            }
                            
                            .evergreen-product-row {
                                transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
                                position: relative;
                                background: #FFFFFF;
                                border-bottom: 1px solid #F3F4F6;
                            }
                            
                            .evergreen-product-row:hover {
                                transform: translateX(4px);
                                box-shadow: 
                                    -4px 0 20px rgba(16, 185, 129, 0.1),
                                    0 4px 20px rgba(0, 0, 0, 0.08);
                                border-left: 3px solid #10B981;
                                background: linear-gradient(135deg, #FFFFFF 0%, #ECFDF5 100%);
                            }
                            
                            .evergreen-product-row td {
                                padding: 16px 12px !important;
                                position: relative;
                                z-index: 2;
                                transition: all 200ms ease;
                            }
                            
                            .evergreen-epic-checkbox {
                                position: relative;
                                transform: scale(1.2);
                                transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
                            }
                            
                            .evergreen-product-image {
                                transition: all 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
                                position: relative;
                                overflow: hidden;
                                border-radius: 8px;
                                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                            }
                            
                            .evergreen-status-badge {
                                position: relative;
                                overflow: hidden;
                                transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
                                border-radius: 6px !important;
                                font-weight: 600 !important;
                                text-transform: uppercase;
                                font-size: 0.75rem !important;
                                letter-spacing: 0.05em;
                            }
                            
                            .evergreen-price-text {
                                font-weight: 600;
                                color: #059669;
                                transition: all 300ms ease;
                                position: relative;
                            }
                            
                            .evergreen-product-title {
                                font-weight: 500;
                                color: #1F2937;
                                transition: all 300ms ease;
                                position: relative;
                            }
                            
                            .evergreen-animation-entrance {
                                animation: evergreenEntrance 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
                            }
                            
                            @keyframes evergreenEntrance {
                                from {
                                    opacity: 0;
                                    transform: translateY(20px) scale(0.95);
                                }
                                to {
                                    opacity: 1;
                                    transform: translateY(0) scale(1);
                                }
                            }
                            
                            /* Enhanced hover effects */
                            .evergreen-stats-card-wrapper:hover .evergreen-stats-number {
                                transform: scale(1.1) rotateY(5deg);
                                filter: 
                                    drop-shadow(0 0 10px rgba(16, 185, 129, 0.6))
                                    drop-shadow(0 0 20px rgba(6, 182, 212, 0.4))
                                    drop-shadow(0 0 30px rgba(16, 185, 129, 0.2));
                                animation: pulseGlow 1.5s ease-in-out infinite alternate;
                            }
                            
                            @keyframes pulseGlow {
                                0% { 
                                    filter: 
                                        drop-shadow(0 0 10px rgba(16, 185, 129, 0.6))
                                        drop-shadow(0 0 20px rgba(6, 182, 212, 0.4));
                                    transform: scale(1.1) rotateY(5deg);
                                }
                                100% { 
                                    filter: 
                                        drop-shadow(0 0 15px rgba(16, 185, 129, 0.8))
                                        drop-shadow(0 0 30px rgba(6, 182, 212, 0.6))
                                        drop-shadow(0 0 45px rgba(16, 185, 129, 0.3));
                                    transform: scale(1.15) rotateY(-2deg);
                                }
                            }
                            
                            /* Text hover animations */
                            .evergreen-stats-card-wrapper:hover .Polaris-Text {
                                animation: textShimmer 2s ease-in-out infinite;
                                transform: translateY(-1px);
                            }
                            
                            @keyframes textShimmer {
                                0%, 100% { 
                                    text-shadow: 0 0 5px rgba(16, 185, 129, 0.3);
                                }
                                50% { 
                                    text-shadow: 
                                        0 0 10px rgba(16, 185, 129, 0.5),
                                        0 0 20px rgba(6, 182, 212, 0.3);
                                }
                            }
                            
                            /* Button epic hover effects */
                            .evergreen-stats-card-wrapper:hover .evergreen-button-wrapper-secondary {
                                transform: translateY(-3px) rotateZ(1deg);
                                box-shadow: 
                                    0 10px 30px rgba(16, 185, 129, 0.3),
                                    0 0 0 2px rgba(16, 185, 129, 0.2),
                                    inset 0 1px 0 rgba(255, 255, 255, 0.5);
                                background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 50%, #ECFDF5 100%);
                                border-color: #10B981;
                            }
                            
                            .evergreen-stats-card-wrapper:hover .evergreen-button-wrapper-secondary .Polaris-Button {
                                color: #047857 !important;
                                font-weight: 700 !important;
                                text-shadow: 0 0 10px rgba(4, 120, 87, 0.5);
                            }
                            
                            /* Floating particles effect on hover */
                            .evergreen-stats-card-wrapper::before {
                                content: '';
                                position: absolute;
                                top: 10%;
                                left: 10%;
                                width: 3px;
                                height: 3px;
                                background: #10B981;
                                border-radius: 50%;
                                opacity: 0;
                                transition: all 400ms ease;
                                box-shadow: 
                                    20px 10px 0 1px #06B6D4,
                                    40px 20px 0 0px #10B981,
                                    60px 5px 0 1px #06B6D4,
                                    80px 15px 0 0px #10B981,
                                    100px 25px 0 1px #06B6D4,
                                    -20px 30px 0 0px #10B981,
                                    -40px 10px 0 1px #06B6D4,
                                    -60px 25px 0 0px #10B981;
                                animation: floatingParticles 3s ease-in-out infinite;
                                pointer-events: none;
                                z-index: 0;
                            }
                            
                            .evergreen-stats-card-wrapper:hover::before {
                                opacity: 0.7;
                                animation-duration: 2s;
                            }
                            
                            @keyframes floatingParticles {
                                0%, 100% { 
                                    transform: translateY(0px) rotate(0deg) scale(1);
                                    opacity: 0.3;
                                }
                                25% { 
                                    transform: translateY(-5px) rotate(90deg) scale(1.2);
                                    opacity: 0.7;
                                }
                                50% { 
                                    transform: translateY(-10px) rotate(180deg) scale(0.8);
                                    opacity: 1;
                                }
                                75% { 
                                    transform: translateY(-5px) rotate(270deg) scale(1.1);
                                    opacity: 0.5;
                                }
                            }
                            
                            /* Card rotation and scale effects */
                            .evergreen-stats-card-wrapper:hover .evergreen-card {
                                transform: 
                                    perspective(1000px) 
                                    rotateX(2deg) 
                                    rotateY(-1deg) 
                                    scale(1.02)
                                    translateZ(10px);
                                box-shadow: 
                                    0 25px 50px -10px rgba(16, 185, 129, 0.2),
                                    0 15px 30px -5px rgba(6, 182, 212, 0.15),
                                    0 0 0 3px rgba(16, 185, 129, 0.1),
                                    inset 0 1px 0 rgba(255, 255, 255, 0.6);
                                background: linear-gradient(135deg, #FFFFFF 0%, #FAFFFE 50%, #F8FFFE 100%);
                            }
                            
                            /* Enhanced card glow */
                            .evergreen-stats-card-wrapper:hover .evergreen-card::before {
                                content: '';
                                position: absolute;
                                top: -5px;
                                left: -5px;
                                right: -5px;
                                bottom: -5px;
                                background: linear-gradient(45deg, #10B981, #06B6D4, #10B981, #06B6D4);
                                background-size: 400% 400%;
                                border-radius: 16px;
                                z-index: -1;
                                animation: gradientGlow 3s ease-in-out infinite;
                                opacity: 0.8;
                                filter: blur(8px);
                            }
                            
                            @keyframes gradientGlow {
                                0%, 100% { 
                                    background-position: 0% 50%;
                                    filter: blur(8px) brightness(1);
                                }
                                25% { 
                                    background-position: 100% 0%;
                                    filter: blur(10px) brightness(1.2);
                                }
                                50% { 
                                    background-position: 100% 100%;
                                    filter: blur(12px) brightness(1.4);
                                }
                                75% { 
                                    background-position: 0% 100%;
                                    filter: blur(10px) brightness(1.2);
                                }
                            }
                            
                            /* Ripple effect on click */
                            .evergreen-stats-card-wrapper {
                                overflow: hidden;
                            }
                            
                            .evergreen-stats-card-wrapper::after {
                                content: '';
                                position: absolute;
                                top: 50%;
                                left: 50%;
                                width: 0;
                                height: 0;
                                background: radial-gradient(circle, rgba(16, 185, 129, 0.6) 0%, transparent 70%);
                                border-radius: 50%;
                                transform: translate(-50%, -50%);
                                transition: width 800ms ease, height 800ms ease, opacity 800ms ease;
                                opacity: 0;
                                pointer-events: none;
                                z-index: 1;
                            }
                            
                            .evergreen-stats-card-wrapper:active::after {
                                width: 300px;
                                height: 300px;
                                opacity: 1;
                                transition: width 0ms, height 0ms, opacity 200ms;
                            }
                            
                            /* Magnetic field visualization */
                            .evergreen-stats-card-wrapper:hover {
                                animation: magneticPulse 2s ease-in-out infinite;
                            }
                            
                            @keyframes magneticPulse {
                                0%, 100% { 
                                    box-shadow: 
                                        0 0 0 0px rgba(16, 185, 129, 0.4),
                                        0 0 0 5px rgba(16, 185, 129, 0.1);
                                }
                                50% { 
                                    box-shadow: 
                                        0 0 0 8px rgba(16, 185, 129, 0.2),
                                        0 0 0 15px rgba(16, 185, 129, 0.05);
                                }
                            }
                            
                            /* Enhanced disabled state */
                            .evergreen-stats-card-wrapper:has(.Polaris-Button[disabled]) {
                                opacity: 0.6;
                                filter: grayscale(0.3);
                                pointer-events: none;
                            }
                            
                            .evergreen-stats-card-wrapper:has(.Polaris-Button[disabled]) .evergreen-stats-number {
                                color: #9CA3AF;
                                background: linear-gradient(135deg, #9CA3AF 0%, #6B7280 100%);
                                -webkit-background-clip: text;
                                -webkit-text-fill-color: transparent;
                                background-clip: text;
                            }
                            
                            /* Fallback for browsers without :has() support */
                            .Polaris-Button[disabled] {
                                opacity: 0.5 !important;
                                cursor: not-allowed !important;
                                pointer-events: none !important;
                            }
                            
                            .evergreen-button-wrapper-secondary:has(.Polaris-Button[disabled]) {
                                opacity: 0.6 !important;
                                filter: grayscale(0.3) !important;
                                pointer-events: none !important;
                            }
                            
                            /* Force disabled state visually */
                            .evergreen-stats-card-wrapper .Polaris-Button[disabled],
                            .evergreen-button-wrapper-secondary .Polaris-Button[disabled] {
                                background: #F3F4F6 !important;
                                color: #9CA3AF !important;
                                border-color: #E5E7EB !important;
                                opacity: 0.6 !important;
                                cursor: not-allowed !important;
                            }
                            
                            /* Disabled cards with class-based selectors */
                            .evergreen-stats-card-wrapper.disabled {
                                opacity: 0.6;
                                filter: grayscale(0.3);
                                pointer-events: none;
                            }
                            
                            .evergreen-stats-number.disabled {
                                color: #9CA3AF !important;
                                background: linear-gradient(135deg, #9CA3AF 0%, #6B7280 100%);
                                -webkit-background-clip: text;
                                -webkit-text-fill-color: transparent;
                                background-clip: text;
                            }
                            
                            .evergreen-button-wrapper-secondary.disabled {
                                opacity: 0.6;
                                filter: grayscale(0.3);
                                pointer-events: none;
                                background: #F3F4F6 !important;
                                border-color: #E5E7EB !important;
                            }
                            
                            /* Selected state for cards */
                            .evergreen-stats-card-wrapper.selected {
                                transform: scale(1.02);
                                box-shadow: 0 8px 25px rgba(16, 185, 129, 0.2), 0 0 0 2px rgba(16, 185, 129, 0.3);
                                background: linear-gradient(135deg, #ECFDF5 0%, #F0FDF4 100%);
                                border-radius: 12px;
                            }
                            
                            .evergreen-stats-card-wrapper.selected .evergreen-card {
                                border: 2px solid #10B981;
                                background: linear-gradient(135deg, #FFFFFF 0%, #F0FDF4 100%);
                            }
                            
                            .evergreen-stats-number.selected {
                                color: #047857 !important;
                                background: linear-gradient(135deg, #10B981 0%, #059669 100%);
                                -webkit-background-clip: text;
                                -webkit-text-fill-color: transparent;
                                background-clip: text;
                                text-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
                            }
                            
                            .evergreen-button-wrapper-secondary.selected {
                                background: linear-gradient(120deg, #10B981 0%, #06B6D4 100%) !important;
                                border: none !important;
                                box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.25);
                            }
                            
                            /* Grid wave effect */
                            .evergreen-duplicate-grid {
                                display: grid;
                                grid-template-columns: repeat(3, minmax(200px, 1fr));
                                gap: 24px;
                                max-width: 800px;
                                margin: 0 auto;
                            }
                            
                            /* Responsive grid for smaller screens */
                            @media (max-width: 900px) {
                                .evergreen-duplicate-grid {
                                    grid-template-columns: repeat(2, minmax(180px, 1fr));
                                    gap: 20px;
                                    max-width: 600px;
                                }
                            }
                            
                            @media (max-width: 550px) {
                                .evergreen-duplicate-grid {
                                    grid-template-columns: 1fr;
                                    gap: 16px;
                                    max-width: 300px;
                                }
                            }
                            
                            .evergreen-duplicate-grid .evergreen-stats-card-wrapper:nth-child(1) {
                                animation-delay: 0ms;
                            }
                            .evergreen-duplicate-grid .evergreen-stats-card-wrapper:nth-child(2) {
                                animation-delay: 100ms;
                            }
                            .evergreen-duplicate-grid .evergreen-stats-card-wrapper:nth-child(3) {
                                animation-delay: 200ms;
                            }
                            .evergreen-duplicate-grid .evergreen-stats-card-wrapper:nth-child(4) {
                                animation-delay: 50ms;
                            }
                            .evergreen-duplicate-grid .evergreen-stats-card-wrapper:nth-child(5) {
                                animation-delay: 150ms;
                            }
                            .evergreen-duplicate-grid .evergreen-stats-card-wrapper:nth-child(6) {
                                animation-delay: 250ms;
                            }
                            
                            /* Sequential hover effect - wave across grid */
                            .evergreen-duplicate-grid:hover .evergreen-stats-card-wrapper:nth-child(1) {
                                animation: cardWave 0.6s ease-out 0s;
                            }
                            .evergreen-duplicate-grid:hover .evergreen-stats-card-wrapper:nth-child(2) {
                                animation: cardWave 0.6s ease-out 0.1s;
                            }
                            .evergreen-duplicate-grid:hover .evergreen-stats-card-wrapper:nth-child(3) {
                                animation: cardWave 0.6s ease-out 0.2s;
                            }
                            .evergreen-duplicate-grid:hover .evergreen-stats-card-wrapper:nth-child(4) {
                                animation: cardWave 0.6s ease-out 0.05s;
                            }
                            .evergreen-duplicate-grid:hover .evergreen-stats-card-wrapper:nth-child(5) {
                                animation: cardWave 0.6s ease-out 0.15s;
                            }
                            .evergreen-duplicate-grid:hover .evergreen-stats-card-wrapper:nth-child(6) {
                                animation: cardWave 0.6s ease-out 0.25s;
                            }
                            
                            @keyframes cardWave {
                                0% { 
                                    transform: translateY(0px) scale(1);
                                }
                                50% { 
                                    transform: translateY(-10px) scale(1.05);
                                }
                                100% { 
                                    transform: translateY(0px) scale(1);
                                }
                            }
                            
                            /* Keyboard accessibility enhancements */
                            .evergreen-stats-card-wrapper:focus-within {
                                outline: 3px solid rgba(16, 185, 129, 0.6);
                                outline-offset: 3px;
                                transform: translateY(-5px) scale(1.02);
                                animation: focusGlow 2s ease-in-out infinite;
                            }
                            
                            @keyframes focusGlow {
                                0%, 100% { 
                                    box-shadow: 
                                        0 0 0 3px rgba(16, 185, 129, 0.3),
                                        0 10px 25px rgba(16, 185, 129, 0.2);
                                }
                                50% { 
                                    box-shadow: 
                                        0 0 0 6px rgba(16, 185, 129, 0.5),
                                        0 15px 35px rgba(16, 185, 129, 0.3);
                                }
                            }
                            
                            /* Enhanced button states */
                            .evergreen-stats-card-wrapper .evergreen-button-wrapper-secondary:focus-within {
                                animation: buttonFocusPulse 1.5s ease-in-out infinite;
                            }
                            
                            @keyframes buttonFocusPulse {
                                0%, 100% { 
                                    transform: translateY(-3px) rotateZ(0deg) scale(1);
                                    box-shadow: 
                                        0 8px 25px rgba(16, 185, 129, 0.25),
                                        0 0 0 2px rgba(16, 185, 129, 0.3);
                                }
                                50% { 
                                    transform: translateY(-5px) rotateZ(1deg) scale(1.05);
                                    box-shadow: 
                                        0 12px 35px rgba(16, 185, 129, 0.35),
                                        0 0 0 4px rgba(16, 185, 129, 0.5);
                                }
                            }
                            
                            /* Advanced number animation on hover */
                            .evergreen-stats-card-wrapper:hover .evergreen-stats-number {
                                animation: numberDance 1.5s ease-in-out infinite;
                            }
                            
                            @keyframes numberDance {
                                0%, 100% { 
                                    transform: scale(1.1) rotateY(5deg) rotateZ(0deg);
                                }
                                25% { 
                                    transform: scale(1.15) rotateY(-2deg) rotateZ(1deg);
                                }
                                50% { 
                                    transform: scale(1.12) rotateY(3deg) rotateZ(-0.5deg);
                                }
                                75% { 
                                    transform: scale(1.14) rotateY(-1deg) rotateZ(0.5deg);
                                }
                            }
                            
                            /* Rainbow edge effect on active cards */
                            .evergreen-stats-card-wrapper:active {
                                animation: rainbowEdge 0.8s ease-out;
                            }
                            
                            @keyframes rainbowEdge {
                                0% { 
                                    box-shadow: 
                                        0 0 0 2px #ff0000,
                                        0 0 20px rgba(255, 0, 0, 0.5);
                                }
                                16% { 
                                    box-shadow: 
                                        0 0 0 2px #ff8000,
                                        0 0 20px rgba(255, 128, 0, 0.5);
                                }
                                33% { 
                                    box-shadow: 
                                        0 0 0 2px #ffff00,
                                        0 0 20px rgba(255, 255, 0, 0.5);
                                }
                                50% { 
                                    box-shadow: 
                                        0 0 0 2px #00ff00,
                                        0 0 20px rgba(0, 255, 0, 0.5);
                                }
                                66% { 
                                    box-shadow: 
                                        0 0 0 2px #0080ff,
                                        0 0 20px rgba(0, 128, 255, 0.5);
                                }
                                83% { 
                                    box-shadow: 
                                        0 0 0 2px #8000ff,
                                        0 0 20px rgba(128, 0, 255, 0.5);
                                }
                                100% { 
                                    box-shadow: 
                                        0 0 0 2px #10B981,
                                        0 0 20px rgba(16, 185, 129, 0.5);
                                }
                            }
                            
                            /* Step buttons and controls enhanced hover effects */
                            
                            /* Select dropdown spectacular hover */
                            .Polaris-Select {
                                transition: all 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
                            }
                            
                            .Polaris-Select:hover {
                                transform: translateY(-2px) scale(1.02);
                                box-shadow: 
                                    0 8px 25px rgba(16, 185, 129, 0.2),
                                    0 0 0 2px rgba(16, 185, 129, 0.3),
                                    inset 0 1px 0 rgba(255, 255, 255, 0.5);
                                background: linear-gradient(135deg, #FFFFFF 0%, #F0FDF4 100%);
                            }
                            
                            .Polaris-Select:hover .Polaris-Select__Content {
                                color: #047857;
                                font-weight: 600;
                                text-shadow: 0 0 10px rgba(4, 120, 87, 0.3);
                            }
                            
                            .Polaris-Select:focus-within {
                                animation: selectFocusGlow 2s ease-in-out infinite;
                                outline: none;
                            }
                            
                            @keyframes selectFocusGlow {
                                0%, 100% { 
                                    box-shadow: 
                                        0 0 0 3px rgba(16, 185, 129, 0.4),
                                        0 8px 25px rgba(16, 185, 129, 0.2);
                                    }
                                    50% { 
                                        box-shadow: 
                                            0 0 0 6px rgba(16, 185, 129, 0.6),
                                            0 12px 35px rgba(16, 185, 129, 0.3);
                                    }
                                }
                                
                                /* Bulk Delete button epic effects */
                                .Polaris-Button--primary {
                                    position: relative;
                                    overflow: hidden;
                                    transition: all 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
                                }
                                
                                .Polaris-Button--primary::before {
                                    content: '';
                                    position: absolute;
                                    top: 0;
                                    left: -100%;
                                    width: 100%;
                                    height: 100%;
                                    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
                                    transition: left 600ms ease;
                                }
                                
                                .Polaris-Button--primary:hover::before {
                                    left: 100%;
                                }
                                
                                .Polaris-Button--primary:hover {
                                    transform: translateY(-3px) scale(1.05);
                                    box-shadow: 
                                        0 15px 35px rgba(220, 38, 38, 0.3),
                                        0 0 0 3px rgba(220, 38, 38, 0.2),
                                        inset 0 1px 0 rgba(255, 255, 255, 0.3);
                                    background: linear-gradient(135deg, #DC2626 0%, #B91C1C 50%, #991B1B 100%);
                                    animation: buttonPulse 1.5s ease-in-out infinite;
                                }
                                
                                @keyframes buttonPulse {
                                    0%, 100% { 
                                        box-shadow: 
                                            0 15px 35px rgba(220, 38, 38, 0.3),
                                            0 0 0 3px rgba(220, 38, 38, 0.2);
                                        }
                                        50% { 
                                            box-shadow: 
                                                0 20px 45px rgba(220, 38, 38, 0.4),
                                                0 0 0 6px rgba(220, 38, 38, 0.3);
                                        }
                                    }
                                    
                                    .Polaris-Button--primary:active {
                                        animation: buttonRipple 0.6s ease-out;
                                    }
                                    
                                    @keyframes buttonRipple {
                                        0% {
                                            box-shadow: 
                                                0 0 0 0 rgba(220, 38, 38, 0.7),
                                                0 15px 35px rgba(220, 38, 38, 0.3);
                                        }
                                        100% {
                                            box-shadow: 
                                                0 0 0 20px rgba(220, 38, 38, 0),
                                                0 15px 35px rgba(220, 38, 38, 0.3);
                                        }
                                    }
                                    
                                    /* Hide/Show buttons elegant hover */
                                    .evergreen-step-toggle {
                                        transition: all 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
                                        position: relative;
                                        overflow: hidden;
                                    }
                                    
                                    .evergreen-step-toggle::after {
                                        content: '';
                                        position: absolute;
                                        top: 50%;
                                        left: 50%;
                                        width: 0;
                                        height: 0;
                                        background: radial-gradient(circle, rgba(16, 185, 129, 0.3) 0%, transparent 70%);
                                        border-radius: 50%;
                                        transform: translate(-50%, -50%);
                                        transition: all 400ms ease;
                                        pointer-events: none;
                                    }
                                    
                                    .evergreen-step-toggle:hover {
                                        transform: translateY(-2px) rotateZ(2deg);
                                        box-shadow: 
                                            0 8px 20px rgba(16, 185, 129, 0.25),
                                            0 0 0 2px rgba(16, 185, 129, 0.3);
                                        background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
                                    }
                                    
                                    .evergreen-step-toggle:hover::after {
                                        width: 100px;
                                        height: 100px;
                                    }
                                    
                                    .evergreen-step-toggle:hover .Polaris-Icon {
                                        animation: iconSpin 1s ease-in-out infinite;
                                        filter: drop-shadow(0 0 8px rgba(16, 185, 129, 0.6));
                                    }
                                    
                                    @keyframes iconSpin {
                                        0%, 100% { 
                                            transform: rotate(0deg) scale(1);
                                        }
                                        50% { 
                                            transform: rotate(180deg) scale(1.2);
                                        }
                                    }
                                    
                                    /* Warning callout enhanced effects */
                                    .Polaris-Banner--warning {
                                        transition: all 300ms ease;
                                        position: relative;
                                        overflow: hidden;
                                    }
                                    
                                    .Polaris-Banner--warning::before {
                                        content: '';
                                        position: absolute;
                                        top: 0;
                                        left: -100%;
                                        width: 100%;
                                        height: 2px;
                                        background: linear-gradient(90deg, transparent, #F59E0B, transparent);
                                        transition: left 800ms ease;
                                    }
                                    
                                    .Polaris-Banner--warning:hover::before {
                                        left: 100%;
                                    }
                                    
                                    .Polaris-Banner--warning:hover {
                                        transform: translateY(-2px);
                                        box-shadow: 
                                            0 8px 25px rgba(245, 158, 11, 0.2),
                                            0 0 0 1px rgba(245, 158, 11, 0.3);
                                        background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%);
                                    }
                                    
                                    /* Enhanced form field hover effects */
                                    .Polaris-Checkbox__Input:hover + .Polaris-Checkbox__Backdrop {
                                        transform: scale(1.1);
                                        box-shadow: 
                                            0 0 0 4px rgba(16, 185, 129, 0.2),
                                            0 4px 12px rgba(16, 185, 129, 0.15);
                                        animation: checkboxGlow 1s ease-in-out infinite;
                                    }
                                    
                                    @keyframes checkboxGlow {
                                        0%, 100% { 
                                            box-shadow: 
                                                0 0 0 4px rgba(16, 185, 129, 0.2),
                                                0 4px 12px rgba(16, 185, 129, 0.15);
                                            }
                                            50% { 
                                                box-shadow: 
                                                    0 0 0 6px rgba(16, 185, 129, 0.3),
                                                    0 6px 18px rgba(16, 185, 129, 0.25);
                                                }
                                            }
                                            
                                            /* Card section hover enhancements */
                                            .evergreen-card-interactive:hover {
                                                animation: cardFloat 3s ease-in-out infinite;
                                            }
                                            
                                            @keyframes cardFloat {
                                                0%, 100% { 
                                                    transform: translateY(0px) rotate(0deg);
                                                }
                                                25% { 
                                                    transform: translateY(-2px) rotate(0.5deg);
                                                }
                                                50% { 
                                                    transform: translateY(-4px) rotate(0deg);
                                                }
                                                75% { 
                                                    transform: translateY(-2px) rotate(-0.5deg);
                                                }
                                            }

                                            /* Main steps container perfect centering */
                                            .evergreen-steps-container {
                                                display: flex;
                                                flex-direction: column;
                                                align-items: center;
                                                justify-content: center;
                                                width: 100%;
                                                max-width: 900px;
                                                margin: 0 auto;
                                                padding: 0 2rem;
                                            }
                                            
                                                                        /* Step wrapper for consistent spacing */
                            .evergreen-step-wrapper {
                                width: 100%;
                                max-width: 1000px;
                                margin: 0 auto 2rem auto;
                            }
                            
                            /* Banner centering and width */
                            .Polaris-Banner {
                                width: 100%;
                                max-width: 1000px;
                                margin: 0 auto 1.5rem auto;
                            }
                            
                            /* Force banner container to center properly */
                            .evergreen-steps-container > .Polaris-BlockStack > .Polaris-Banner {
                                width: 100%;
                                max-width: 1000px;
                                margin: 0 auto 1.5rem auto;
                            }
                            
                            /* Target all banner types specifically */
                            .evergreen-page .Polaris-Banner,
                            .evergreen-page .Polaris-Banner--success,
                            .evergreen-page .Polaris-Banner--critical,
                            .evergreen-page .Polaris-Banner--info {
                                width: 100% !important;
                                max-width: 1000px !important;
                                margin: 0 auto 1.5rem auto !important;
                            }
                                            
                                            /* Responsive centering */
                                            @media (max-width: 768px) {
                                                .evergreen-page {
                                                    padding: 1rem;
                                                }
                                                
                                                .evergreen-steps-container {
                                                    padding: 0 1rem;
                                                }
                                                
                                                .Polaris-BlockStack {
                                                    max-width: 100%;
                                                }
                                                
                                                .evergreen-card {
                                                    min-width: 100% !important;
                                                    max-width: 100% !important;
                                                }
                                                
                                                .Polaris-Card {
                                                    min-width: 100% !important;
                                                    max-width: 100% !important;
                                                }
                                                
                                                .Polaris-Layout__Section > .Polaris-Card {
                                                    min-width: 100%;
                                                    max-width: 100%;
                                                }
                                            }
                                            
                                                                        @media (min-width: 769px) {
                                /* Desktop - force exact same width for all cards */
                                .evergreen-card,
                                .Polaris-Card,
                                .Polaris-Layout__Section > .Polaris-Card {
                                    width: 1000px !important;
                                    min-width: 1000px !important;
                                    max-width: 1000px !important;
                                    flex: none !important;
                                }
                            }
                                            
                                            /* AGGRESSIVE POLARIS OVERRIDE - Force all cards to exact same width */
                                            
                                                                        /* Override all possible Polaris card classes */
                            .Polaris-Page .Polaris-Layout .Polaris-Layout__Section .Polaris-Card {
                                width: 1000px !important;
                                min-width: 1000px !important;
                                max-width: 1000px !important;
                                flex: 0 0 1000px !important;
                                flex-grow: 0 !important;
                                flex-shrink: 0 !important;
                                flex-basis: 1000px !important;
                            }
                                            
                                                                        /* Target the exact card selector hierarchy */
                            .evergreen-page .Polaris-Page .Polaris-BlockStack .Polaris-Layout .Polaris-Layout__Section .Polaris-Card {
                                width: 1000px !important;
                                min-width: 1000px !important;
                                max-width: 1000px !important;
                                flex: 0 0 1000px !important;
                            }
                                            
                                                                        /* Override any possible Polaris width classes */
                            .Polaris-Card[class*="width"],
                            .Polaris-Card[style*="width"],
                            .Polaris-Layout__Section[class*="width"] > .Polaris-Card {
                                width: 1000px !important;
                                min-width: 1000px !important;
                                max-width: 1000px !important;
                            }
                                            
                                            /* Force Layout Section to not affect card width */
                                            .Polaris-Layout__Section {
                                                width: 100% !important;
                                                max-width: none !important;
                                                flex: none !important;
                                                display: flex !important;
                                                justify-content: center !important;
                                            }
                                            
                                                                        .Polaris-Layout__Section > * {
                                width: 1000px !important;
                                min-width: 1000px !important;
                                max-width: 1000px !important;
                                flex: none !important;
                            }
                                            
                                            /* Override BlockStack that might affect spacing */
                                            .Polaris-BlockStack > .Polaris-Layout {
                                                width: 100% !important;
                                                max-width: none !important;
                                            }
                                            
                                            .Polaris-BlockStack > .Polaris-Layout > .Polaris-Layout__Section {
                                                width: 100% !important;
                                                display: flex !important;
                                                justify-content: center !important;
                                            }
                                            
                                                                        .Polaris-BlockStack > .Polaris-Layout > .Polaris-Layout__Section > .Polaris-Card {
                                width: 1000px !important;
                                min-width: 1000px !important;
                                max-width: 1000px !important;
                                flex: 0 0 1000px !important;
                            }
                                            
                                                                        /* Nuclear option - target any div that might be a card */
                            .evergreen-page [class*="Card"] {
                                width: 1000px !important;
                                min-width: 1000px !important;
                                max-width: 1000px !important;
                            }
                                            
                                            /* Responsive for mobile */
                                            @media (max-width: 768px) {
                                                .Polaris-Page .Polaris-Layout .Polaris-Layout__Section .Polaris-Card,
                                                .evergreen-page .Polaris-Page .Polaris-BlockStack .Polaris-Layout .Polaris-Layout__Section .Polaris-Card,
                                                .Polaris-BlockStack > .Polaris-Layout > .Polaris-Layout__Section > .Polaris-Card,
                                                .evergreen-page [class*="Card"] {
                                                    width: 100% !important;
                                                    min-width: 100% !important;
                                                    max-width: 100% !important;
                                                    flex: none !important;
                                                }
                                            }
                                            
                                                                        /* ULTIMATE OVERRIDE - Maximum specificity with inline style priority */
                            html body .evergreen-page .Polaris-Page .Polaris-BlockStack .Polaris-Layout .Polaris-Layout__Section .Polaris-Card[style] {
                                width: 1000px !important;
                                min-width: 1000px !important;
                                max-width: 1000px !important;
                                flex: none !important;
                                flex-grow: 0 !important;
                                flex-shrink: 0 !important; 
                                flex-basis: 1000px !important;
                            }
                                            
                                                                        /* Target any possible Polaris responsive breakpoints */
                            @media (min-width: 769px) {
                                html body .evergreen-page .Polaris-Page .Polaris-BlockStack .Polaris-Layout .Polaris-Layout__Section .Polaris-Card[style] {
                                    width: 1000px !important;
                                    min-width: 1000px !important;
                                    max-width: 1000px !important;
                                    flex: none !important;
                                }
                            }
                            
                            @media (min-width: 990px) {
                                html body .evergreen-page .Polaris-Page .Polaris-BlockStack .Polaris-Layout .Polaris-Layout__Section .Polaris-Card[style] {
                                    width: 1000px !important;
                                    min-width: 1000px !important;
                                    max-width: 1000px !important;
                                    flex: none !important;
                                }
                            }
                            
                            @media (min-width: 1200px) {
                                html body .evergreen-page .Polaris-Page .Polaris-BlockStack .Polaris-Layout .Polaris-Layout__Section .Polaris-Card[style] {
                                    width: 1000px !important;
                                    min-width: 1000px !important;
                                    max-width: 1000px !important;
                                    flex: none !important;
                                }
                            }
                                            
                                                                        /* Override any possible Polaris class combinations */
                            .Polaris-Card.Polaris-Card--subdued,
                            .Polaris-Card.Polaris-Card--fullHeight,
                            .Polaris-Card[class*="Polaris"] {
                                width: 1000px !important;
                                min-width: 1000px !important;
                                max-width: 1000px !important;
                                flex: none !important;
                            }
                            
                            /* Force override of any computed styles */
                            [data-polaris-card] {
                                width: 1000px !important;
                                min-width: 1000px !important;
                                max-width: 1000px !important;
                                flex: none !important;
                            }
                                        `}</style>

            <div className="evergreen-page">
                <Page
                    backAction={{ content: 'Dashboard', onAction: handleBack }}
                    title="Check duplicates"
                    subtitle="Delete duplicate products or variants by title, SKU, barcode, or a combination of these"
                >
                    <div className="evergreen-steps-container">
                        <BlockStack gap="500">
                            {/* Action Result Banners */}
                            {actionData?.success && !dismissedBanners.has('success') && (
                                <Banner
                                    title="Operation completed successfully!"
                                    tone="success"
                                    onDismiss={() => handleDismissBanner('success')}
                                >
                                    {actionData?.message || 'Operation completed successfully!'}
                                </Banner>
                            )}

                            {actionData?.error && !dismissedBanners.has('error') && (
                                <Banner
                                    title="Operation failed"
                                    tone="critical"
                                    onDismiss={() => handleDismissBanner('error')}
                                >
                                    {actionData?.error || 'An error occurred during the operation.'}
                                </Banner>
                            )}

                            {/* Scanning Progress Banner */}
                            {isScanning && (
                                <Banner
                                    title="Scanning in progress"
                                    tone="info"
                                >
                                    Scanning products and analyzing duplicates... This may take a few moments.
                                </Banner>
                            )}

                            {/* No Duplicates Section */}
                            {hasNoDuplicates && (
                                <Layout>
                                    <Layout.Section>
                                        <Card className="evergreen-card evergreen-card-interactive evergreen-animation-entrance">
                                            <BlockStack gap="400">
                                                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                                                    <Text as="h2" variant="headingMd" fontWeight="semibold">
                                                        No duplicates found
                                                    </Text>
                                                    <div style={{ marginTop: '1rem', marginBottom: '2rem' }}>
                                                        <Text as="p" variant="bodyMd" tone="subdued">
                                                            Great news! No duplicate products were found in your store. Your catalog is clean and organized.
                                                        </Text>
                                                    </div>
                                                    <div className="evergreen-button-wrapper evergreen-magnetic">
                                                        <Button
                                                            onClick={handleSyncProducts}
                                                            icon={RefreshIcon}
                                                            variant="primary"
                                                            loading={isScanning}
                                                            disabled={isScanning}
                                                        >
                                                            {isScanning ? "Scanning..." : "Run new scan"}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </BlockStack>
                                        </Card>
                                    </Layout.Section>
                                </Layout>
                            )}

                            {/* Main Content - Only show if there are duplicates */}
                            {!hasNoDuplicates && (
                                <>
                                    {/* =============================================================================
                                                STEP 1: SYNC PRODUCTS
                                                ============================================================================= */}
                                    <Layout>
                                        <Layout.Section>
                                            <Card
                                                className="evergreen-card evergreen-card-interactive evergreen-animation-entrance"
                                            >
                                                <BlockStack gap="0">
                                                    <div
                                                        className="evergreen-step-header"
                                                        onClick={() => toggleStepCollapse('step1')}
                                                    >
                                                        <div className="evergreen-step-title">
                                                            <div className="evergreen-step-number">1</div>
                                                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                                                                Sync products for calculation of duplicate products and variants
                                                            </Text>
                                                        </div>
                                                        <div className="evergreen-step-toggle">
                                                            <Icon source={collapsedSteps.has('step1') ? ChevronDownIcon : ChevronUpIcon} />
                                                            <span>{collapsedSteps.has('step1') ? 'Show' : 'Hide'}</span>
                                                        </div>
                                                    </div>

                                                    <div className={`evergreen-step-content ${collapsedSteps.has('step1') ? 'collapsed' : 'expanded'}`}>
                                                        <BlockStack gap="400">
                                                            <Text as="p" variant="bodySm" tone="subdued">
                                                                Start by syncing your products to analyze for duplicates. This process will scan all your products and identify potential duplicates based on titles, SKUs, and barcodes.
                                                            </Text>

                                                            <div className="evergreen-button-wrapper evergreen-magnetic">
                                                                <Button
                                                                    onClick={handleSyncProducts}
                                                                    icon={RefreshIcon}
                                                                    variant="primary"
                                                                    size="slim"
                                                                    loading={isScanning}
                                                                    disabled={isScanning}
                                                                >
                                                                    {isScanning ? "Scanning..." : "Sync products"}
                                                                </Button>
                                                            </div>
                                                        </BlockStack>
                                                    </div>
                                                </BlockStack>
                                            </Card>
                                        </Layout.Section>
                                    </Layout>

                                    {/* =============================================================================
                                                STEP 2: SELECT DUPLICATE TYPE
                                                ============================================================================= */}
                                    <Layout>
                                        <Layout.Section>
                                            <Card
                                                className="evergreen-card evergreen-card-interactive evergreen-animation-entrance"
                                            >
                                                <BlockStack gap="0">
                                                    <div
                                                        className="evergreen-step-header"
                                                        onClick={() => toggleStepCollapse('step2')}
                                                    >
                                                        <div className="evergreen-step-title">
                                                            <div className="evergreen-step-number">2</div>
                                                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                                                                Select a field to take action for duplicate products and variants
                                                            </Text>
                                                        </div>
                                                        <div className="evergreen-step-toggle">
                                                            <Icon source={collapsedSteps.has('step2') ? ChevronDownIcon : ChevronUpIcon} />
                                                            <span>{collapsedSteps.has('step2') ? 'Show' : 'Hide'}</span>
                                                        </div>
                                                    </div>

                                                    <div className={`evergreen-step-content ${collapsedSteps.has('step2') ? 'collapsed' : 'expanded'}`}>
                                                        <BlockStack gap="400">
                                                            <Text as="p" variant="bodySm" tone="subdued">
                                                                Choose which criteria to use for identifying duplicates. You can find duplicates by title, SKU, barcode, or combinations of these fields.
                                                            </Text>

                                                            {/* Duplicate Cards Grid */}
                                                            <div className="evergreen-duplicate-grid">
                                                                {duplicateTypes.map((type) => {
                                                                    const count = duplicateStats[type.key];
                                                                    const isDisabled = count === 0;
                                                                    const isSelected = selectedDuplicateType === type.action;

                                                                    return (
                                                                        <div key={type.key} className={`evergreen-stats-card-wrapper ${isDisabled ? 'disabled' : ''} ${isSelected ? 'selected' : ''}`}>
                                                                            <Card className="evergreen-card evergreen-card-interactive evergreen-stats-card">
                                                                                <div className="evergreen-stats-content">
                                                                                    <Text as="h3" variant="headingSm" fontWeight="semibold">
                                                                                        {type.label}
                                                                                    </Text>
                                                                                    <div className={`evergreen-stats-number ${isDisabled ? 'disabled' : ''} ${isSelected ? 'selected' : ''}`}>
                                                                                        {count}
                                                                                    </div>
                                                                                    <div className={`evergreen-button-wrapper-secondary evergreen-magnetic ${isDisabled ? 'disabled' : ''} ${isSelected ? 'selected' : ''}`}>
                                                                                        <Button
                                                                                            size="micro"
                                                                                            onClick={() => !isDisabled && handleCheckOptions(type.action)}
                                                                                            disabled={isDisabled}
                                                                                            variant={isSelected ? "primary" : "secondary"}
                                                                                        >
                                                                                            {isSelected ? "Selected" : "Check options"}
                                                                                        </Button>
                                                                                    </div>
                                                                                </div>
                                                                            </Card>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </BlockStack>
                                                    </div>
                                                </BlockStack>
                                            </Card>
                                        </Layout.Section>
                                    </Layout>

                                    {/* =============================================================================
                                                STEP 3: BULK DELETE RULES - Only show if duplicate type is selected
                                                ============================================================================= */}
                                    {selectedDuplicateType && (
                                        <Layout>
                                            <Layout.Section>
                                                <Card
                                                    className="evergreen-card evergreen-card-interactive evergreen-animation-entrance"
                                                >
                                                    <BlockStack gap="0">
                                                        <div
                                                            className="evergreen-step-header"
                                                            onClick={() => toggleStepCollapse('step3')}
                                                        >
                                                            <div className="evergreen-step-title">
                                                                <div className="evergreen-step-number">3</div>
                                                                <Text as="p" variant="bodyMd" fontWeight="semibold">
                                                                    Choose a rule to delete duplicate products or variants in bulk
                                                                </Text>
                                                            </div>
                                                            <div className="evergreen-step-toggle">
                                                                <Icon source={collapsedSteps.has('step3') ? ChevronDownIcon : ChevronUpIcon} />
                                                                <span>{collapsedSteps.has('step3') ? 'Show' : 'Hide'}</span>
                                                            </div>
                                                        </div>

                                                        <div className={`evergreen-step-content ${collapsedSteps.has('step3') ? 'collapsed' : 'expanded'}`}>
                                                            <BlockStack gap="400">
                                                                <Text as="p" variant="bodySm" tone="subdued">
                                                                    Use bulk deletion rules to automatically remove duplicates. Select a rule and all matching duplicates will be deleted according to your preference.
                                                                </Text>

                                                                <div className="evergreen-warning-card">
                                                                    <Text as="p" variant="bodyMd" fontWeight="medium" style={{ color: '#92400E' }}>
                                                                        This action can not be reverted. Please export your products before deleting them in bulk.
                                                                    </Text>
                                                                </div>

                                                                <InlineStack gap="300" blockAlign="end">
                                                                    <div className="evergreen-select-wrapper" style={{ minWidth: "300px" }}>
                                                                        <Select
                                                                            label=""
                                                                            options={ruleOptions}
                                                                            value={selectedRule}
                                                                            onChange={setSelectedRule}
                                                                            placeholder="Select a rule"
                                                                        />
                                                                    </div>
                                                                    <button
                                                                        className="evergreen-button-epic evergreen-magnetic"
                                                                        onClick={handleBulkDelete}
                                                                        disabled={!selectedRule}
                                                                        style={{
                                                                            opacity: selectedRule ? 1 : 0.6,
                                                                            cursor: selectedRule ? 'pointer' : 'not-allowed'
                                                                        }}
                                                                    >
                                                                        Bulk delete
                                                                    </button>
                                                                </InlineStack>
                                                            </BlockStack>
                                                        </div>
                                                    </BlockStack>
                                                </Card>
                                            </Layout.Section>
                                        </Layout>
                                    )}

                                    {/* Information banner when no option is selected */}
                                    {!selectedDuplicateType && (
                                        <Layout>
                                            <Layout.Section>
                                                <Card className="evergreen-card evergreen-card-interactive evergreen-animation-entrance">
                                                    <BlockStack gap="400">
                                                        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                                                            <div style={{ marginBottom: '1rem' }}>
                                                                <Text as="h3" variant="headingMd" fontWeight="semibold">
                                                                    Select a duplicate type above
                                                                </Text>
                                                            </div>
                                                            <Text as="p" variant="bodyMd" tone="subdued">
                                                                Choose which criteria to use for identifying duplicates, then Step 3 and Step 4 will appear.
                                                            </Text>
                                                        </div>
                                                    </BlockStack>
                                                </Card>
                                            </Layout.Section>
                                        </Layout>
                                    )}

                                    {/* =============================================================================
                                                STEP 4: MANUAL SELECTION - Only show if duplicate type is selected
                                                ============================================================================= */}
                                    {selectedDuplicateType && (
                                        <Layout>
                                            <Layout.Section>
                                                <Card
                                                    className="evergreen-card evergreen-card-interactive evergreen-animation-entrance"
                                                >
                                                    <BlockStack gap="0">
                                                        <div
                                                            className="evergreen-step-header"
                                                            onClick={() => toggleStepCollapse('step4')}
                                                        >
                                                            <div className="evergreen-step-title">
                                                                <div className="evergreen-step-number">4</div>
                                                                <Text as="p" variant="bodyMd" fontWeight="semibold">
                                                                    Select products or variants to delete manually
                                                                </Text>
                                                            </div>
                                                            <div className="evergreen-step-toggle">
                                                                <Icon source={collapsedSteps.has('step4') ? ChevronDownIcon : ChevronUpIcon} />
                                                                <span>{collapsedSteps.has('step4') ? 'Show' : 'Hide'}</span>
                                                            </div>
                                                        </div>

                                                        <div className={`evergreen-step-content ${collapsedSteps.has('step4') ? 'collapsed' : 'expanded'}`}>
                                                            <BlockStack gap="400">
                                                                <Text as="p" variant="bodySm" tone="subdued">
                                                                    Review duplicate products and manually select which ones to delete. You have full control over which products to remove.
                                                                </Text>

                                                                <InlineStack align="space-between" blockAlign="center">
                                                                    <Text as="p" variant="bodyMd" fontWeight="medium">
                                                                        Duplicate Products ({duplicateProducts.length})
                                                                    </Text>
                                                                    <button
                                                                        className="evergreen-button-epic evergreen-magnetic"
                                                                        onClick={handleDeleteSelected}
                                                                        disabled={selectedProducts.length === 0}
                                                                        style={{
                                                                            opacity: selectedProducts.length > 0 ? 1 : 0.6,
                                                                            cursor: selectedProducts.length > 0 ? 'pointer' : 'not-allowed'
                                                                        }}
                                                                    >
                                                                        Delete selected ({selectedProducts.length})
                                                                    </button>
                                                                </InlineStack>

                                                                {/* Products Table */}
                                                                <div style={{ overflowX: "auto" }}>
                                                                    <div className="evergreen-product-table">
                                                                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                                                            <thead className="evergreen-table-header">
                                                                                <tr>
                                                                                    <th>
                                                                                        <div className="evergreen-epic-checkbox">
                                                                                            <Checkbox
                                                                                                checked={selectedProducts.length === duplicateProducts.length && duplicateProducts.length > 0}
                                                                                                indeterminate={selectedProducts.length > 0 && selectedProducts.length < duplicateProducts.length}
                                                                                                onChange={handleSelectAllProducts}
                                                                                            />
                                                                                        </div>
                                                                                    </th>
                                                                                    <th>
                                                                                        <Text as="span" variant="bodyMd" fontWeight="semibold">Image</Text>
                                                                                    </th>
                                                                                    <th>
                                                                                        <Text as="span" variant="bodyMd" fontWeight="semibold">Type</Text>
                                                                                    </th>
                                                                                    <th>
                                                                                        <Text as="span" variant="bodyMd" fontWeight="semibold">Title</Text>
                                                                                    </th>
                                                                                    <th>
                                                                                        <Text as="span" variant="bodyMd" fontWeight="semibold">SKU</Text>
                                                                                    </th>
                                                                                    <th>
                                                                                        <Text as="span" variant="bodyMd" fontWeight="semibold">Barcode</Text>
                                                                                    </th>
                                                                                    <th>
                                                                                        <Text as="span" variant="bodyMd" fontWeight="semibold">Price</Text>
                                                                                    </th>
                                                                                    <th>
                                                                                        <Text as="span" variant="bodyMd" fontWeight="semibold">Status</Text>
                                                                                    </th>
                                                                                    <th>
                                                                                        <Text as="span" variant="bodyMd" fontWeight="semibold">Created at</Text>
                                                                                    </th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {duplicateProducts.map((product, index) => (
                                                                                    <tr
                                                                                        key={product.id}
                                                                                        className="evergreen-product-row evergreen-table-row-entrance"
                                                                                        style={{ animationDelay: `${index * 100}ms` }}
                                                                                    >
                                                                                        <td>
                                                                                            <div className="evergreen-epic-checkbox">
                                                                                                <Checkbox
                                                                                                    checked={selectedProducts.includes(product.id)}
                                                                                                    onChange={() => handleProductSelection(product.id)}
                                                                                                />
                                                                                            </div>
                                                                                        </td>
                                                                                        <td>
                                                                                            <div className="evergreen-product-image">
                                                                                                <Thumbnail
                                                                                                    size="small"
                                                                                                    source={product.image}
                                                                                                    alt={product.title}
                                                                                                />
                                                                                            </div>
                                                                                        </td>
                                                                                        <td>
                                                                                            <Text as="span" variant="bodyMd">{product.type}</Text>
                                                                                        </td>
                                                                                        <td>
                                                                                            <div className="evergreen-product-title">
                                                                                                <Text as="span" variant="bodyMd" tone="base">
                                                                                                    {product.title}
                                                                                                </Text>
                                                                                            </div>
                                                                                        </td>
                                                                                        <td>
                                                                                            <Text as="span" variant="bodyMd">{product.sku || "-"}</Text>
                                                                                        </td>
                                                                                        <td>
                                                                                            <Text as="span" variant="bodyMd">{product.barcode || "-"}</Text>
                                                                                        </td>
                                                                                        <td>
                                                                                            <div className="evergreen-price-text">
                                                                                                <Text as="span" variant="bodyMd">{product.price}</Text>
                                                                                            </div>
                                                                                        </td>
                                                                                        <td>
                                                                                            <Badge
                                                                                                className={`evergreen-status-badge status-${product.status.toLowerCase()}`}
                                                                                                status={product.status === "ACTIVE" ? "success" : "info"}
                                                                                            >
                                                                                                {product.status}
                                                                                            </Badge>
                                                                                        </td>
                                                                                        <td>
                                                                                            <Text as="span" variant="bodyMd" tone="subdued">
                                                                                                {product.createdAt}
                                                                                            </Text>
                                                                                        </td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                </div>
                                                            </BlockStack>
                                                        </div>
                                                    </BlockStack>
                                                </Card>
                                            </Layout.Section>
                                        </Layout>
                                    )}
                                </>
                            )}
                        </BlockStack>
                    </div>
                </Page>
            </div>
        </>
    );
} 