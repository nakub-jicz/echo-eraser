import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@remix-run/react";
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
} from "@shopify/polaris";
import {
    RefreshIcon,
} from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

// =============================================================================
// LOADER & ACTION
// =============================================================================
export const loader = async ({ request }) => {
    await authenticate.admin(request);
    return null;
};

export const action = async ({ request }) => {
    const { admin } = await authenticate.admin(request);
    // Placeholder for actual duplicate detection logic
    return { success: true };
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export default function CheckDuplicates() {
    const shopify = useAppBridge();
    const navigate = useNavigate();
    const mouseRef = useRef({ x: 0, y: 0 });

    // =============================================================================
    // STATE MANAGEMENT
    // =============================================================================
    // Mock data for duplicates - Replace with real API data
    const [duplicateStats] = useState({
        byTitle: 2,
        bySku: 0,
        byBarcode: 0,
        byTitleBarcode: 0,
        byTitleSku: 0,
        bySkuBarcode: 0
    });

    // Step 3 state
    const [selectedRule, setSelectedRule] = useState("");

    // Step 4 state - mock duplicate products
    const [selectedProducts, setSelectedProducts] = useState([]);
    const [duplicateProducts] = useState([
        {
            id: "1",
            image: "https://burst.shopifycdn.com/photos/business-surprise.jpg",
            type: "Product",
            title: "The Out of Stock Snowboard",
            sku: "",
            barcode: "",
            price: "885.95",
            status: "ACTIVE",
            createdAt: "2025-06-08 16:36 (22 hours ago)"
        },
        {
            id: "2",
            image: "https://burst.shopifycdn.com/photos/business-surprise.jpg",
            type: "Product",
            title: "The Out of Stock Snowboard",
            sku: "80",
            barcode: "",
            price: "885.95",
            status: "DRAFT",
            createdAt: "2025-06-09 15:07 (20 minutes ago)"
        }
    ]);

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
    // EVENT HANDLERS
    // =============================================================================
    const handleSyncProducts = () => {
        shopify.toast.show("Products synced successfully");
    };

    const handleCheckOptions = (type) => {
        shopify.toast.show(`Checking ${type} duplicates...`);
    };

    const handleBack = () => {
        navigate("/app");
    };

    const handleBulkDelete = () => {
        if (!selectedRule) {
            shopify.toast.show("Please select a rule first", { isError: true });
            return;
        }
        shopify.toast.show(`Bulk deleting using rule: ${ruleOptions.find(r => r.value === selectedRule)?.label}`);
    };

    const handleDeleteSelected = () => {
        if (selectedProducts.length === 0) {
            shopify.toast.show("Please select products to delete", { isError: true });
            return;
        }
        shopify.toast.show(`Deleting ${selectedProducts.length} selected products`);
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

    // =============================================================================
    // MOUSE TRACKING & EFFECTS
    // =============================================================================
    useEffect(() => {
        // Mouse tracking and effects

        const handleMouseMove = (e) => {
            mouseRef.current = { x: e.clientX, y: e.clientY };

            // Update CSS custom properties for cursor-following effects
            document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
            document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);

            // Magnetic buttons effect
            const magneticButtons = document.querySelectorAll('.evergreen-magnetic, .evergreen-button-wrapper.evergreen-magnetic, .evergreen-button-wrapper-secondary.evergreen-magnetic, .Polaris-Page-Header .Polaris-Button--primary');
            magneticButtons.forEach(button => {
                const rect = button.getBoundingClientRect();
                const buttonCenterX = rect.left + rect.width / 2;
                const buttonCenterY = rect.top + rect.height / 2;

                const distance = Math.sqrt(
                    Math.pow(e.clientX - buttonCenterX, 2) + Math.pow(e.clientY - buttonCenterY, 2)
                );

                const maxDistance = 50; // Magnetic field radius - zmniejszony z 80 na 50

                if (distance < maxDistance) {
                    const pullStrength = (maxDistance - distance) / maxDistance;
                    const pullX = (e.clientX - buttonCenterX) * pullStrength * 0.15; // zmniejszony z 0.3 na 0.15
                    const pullY = (e.clientY - buttonCenterY) * pullStrength * 0.15; // zmniejszony z 0.3 na 0.15

                    // For wrapper buttons, we can set transform directly
                    if (button.classList.contains('evergreen-button-wrapper') || button.classList.contains('evergreen-button-wrapper-secondary')) {
                        button.style.transform = `translate(${pullX}px, ${pullY}px)`;
                    } else if (button.classList.contains('Polaris-Button--primary')) {
                        // Header button gets special treatment
                        button.style.setProperty('transform', `translate(${pullX}px, ${pullY}px) translateY(-2px)`, 'important');
                    } else {
                        button.style.setProperty('transform', `translate(${pullX}px, ${pullY}px)`, 'important');
                    }
                } else {
                    if (button.classList.contains('evergreen-button-wrapper') || button.classList.contains('evergreen-button-wrapper-secondary')) {
                        button.style.transform = 'translate(0px, 0px)';
                    } else if (button.classList.contains('Polaris-Button--primary')) {
                        // Reset header button transform
                        button.style.setProperty('transform', 'translate(0px, 0px)', 'important');
                    } else {
                        button.style.setProperty('transform', 'translate(0px, 0px)', 'important');
                    }
                }
            });

            // Enhanced parallax effect on cards
            const cards = document.querySelectorAll('.evergreen-card, .evergreen-stats-card');
            cards.forEach(card => {
                const rect = card.getBoundingClientRect();
                const cardCenterX = rect.left + rect.width / 2;
                const cardCenterY = rect.top + rect.height / 2;

                const deltaX = (e.clientX - cardCenterX) / rect.width;
                const deltaY = (e.clientY - cardCenterY) / rect.height;

                // Stats cards get special treatment
                if (card.classList.contains('evergreen-stats-card')) {
                    const maxTilt = 4; // More subtle for stats cards
                    const tiltX = deltaY * maxTilt;
                    const tiltY = deltaX * -maxTilt;

                    // Mouse position relative to card for glow effect
                    const mouseXPercent = ((e.clientX - rect.left) / rect.width) * 100;
                    const mouseYPercent = ((e.clientY - rect.top) / rect.height) * 100;

                    if (Math.abs(deltaX) < 0.6 && Math.abs(deltaY) < 0.6) {
                        card.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateZ(10px)`;
                        card.style.setProperty('--mouse-x', `${mouseXPercent}%`);
                        card.style.setProperty('--mouse-y', `${mouseYPercent}%`);

                        // Enhanced glow on hover
                        if (card.matches(':hover')) {
                            card.style.setProperty('--glow-opacity', '1');
                        }
                    } else {
                        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
                        card.style.setProperty('--glow-opacity', '0');
                    }
                } else {
                    // Other interactive cards
                    const maxTilt = 4;
                    const tiltX = deltaY * maxTilt;
                    const tiltY = deltaX * -maxTilt;

                    // Mouse position relative to card for glow effect
                    const mouseXPercent = ((e.clientX - rect.left) / rect.width) * 100;
                    const mouseYPercent = ((e.clientY - rect.top) / rect.height) * 100;

                    if (Math.abs(deltaX) < 0.6 && Math.abs(deltaY) < 0.6) {
                        card.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateZ(5px)`;
                        card.style.setProperty('--mouse-x', `${mouseXPercent}%`);
                        card.style.setProperty('--mouse-y', `${mouseYPercent}%`);
                    } else {
                        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
                    }
                }
            });
        };

        window.addEventListener('mousemove', handleMouseMove);

        // Dynamic header button styling with debounce
        let styleTimeout;
        const styleHeaderButton = () => {
            clearTimeout(styleTimeout);
            styleTimeout = setTimeout(() => {
                try {
                    // Multiple selectors to find the header button
                    const selectors = [
                        '.Polaris-Page-Header .Polaris-Button--primary',
                        '.Polaris-Page-Header button',
                        'header .Polaris-Button',
                        '[data-testid="primary-action"]',
                        'button[aria-label*="Start"]'
                    ];

                    let headerButton = null;

                    for (const selector of selectors) {
                        try {
                            headerButton = document.querySelector(selector);
                            if (headerButton) break;
                        } catch (e) {
                            // Silent fail
                        }
                    }

                    if (headerButton && !headerButton.classList.contains('evergreen-header-styled')) {
                        // Add our custom class to avoid re-styling
                        headerButton.classList.add('evergreen-header-styled');

                        // Apply styles directly via JavaScript
                        Object.assign(headerButton.style, {
                            background: 'linear-gradient(120deg, #10B981 0%, #06B6D4 100%)',
                            border: 'none',
                            borderRadius: '8px',
                            boxShadow: '0 4px 14px 0 rgba(16, 185, 129, 0.25)',
                            transition: 'all 250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                            position: 'relative',
                            overflow: 'hidden',
                            fontWeight: '600',
                            color: '#FFFFFF'
                        });

                        // Add hover effects
                        headerButton.addEventListener('mouseenter', () => {
                            Object.assign(headerButton.style, {
                                transform: 'translateY(-2px)',
                                boxShadow: '0 8px 25px 0 rgba(16, 185, 129, 0.4), 0 0 20px rgba(16, 185, 129, 0.3)',
                                filter: 'brightness(1.1)'
                            });
                        });

                        headerButton.addEventListener('mouseleave', () => {
                            Object.assign(headerButton.style, {
                                transform: 'translateY(0px)',
                                boxShadow: '0 4px 14px 0 rgba(16, 185, 129, 0.25)',
                                filter: 'brightness(1)'
                            });
                        });

                        // Add click effect
                        headerButton.addEventListener('mousedown', () => {
                            headerButton.style.transform = 'translateY(0px)';
                            headerButton.style.boxShadow = '0 2px 8px 0 rgba(16, 185, 129, 0.4)';
                        });

                        headerButton.addEventListener('mouseup', () => {
                            headerButton.style.transform = 'translateY(-2px)';
                            headerButton.style.boxShadow = '0 8px 25px 0 rgba(16, 185, 129, 0.4), 0 0 20px rgba(16, 185, 129, 0.3)';
                        });
                    }
                } catch (e) {
                    // Silent fail
                }
            }, 100);
        };

        // Run header button styling
        styleHeaderButton();

        const observer = new MutationObserver(() => {
            styleHeaderButton();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            observer.disconnect();
        };
    }, []);

    // =============================================================================
    // HELPER FUNCTIONS
    // =============================================================================
    const getButtonWrapperClass = (isDisabled) => {
        return `evergreen-button-wrapper-secondary evergreen-magnetic ${isDisabled ? 'evergreen-button-wrapper-disabled' : ''}`;
    };

    // =============================================================================
    // RENDER
    // =============================================================================
    return (
        <>
            <style>{`
                /* =============================================================================
                   EVERGREEN INTERFACE KIT - ENHANCED STYLES
                   ============================================================================= */
                
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
                
                :root {
                    --mouse-x: 0px;
                    --mouse-y: 0px;
                }
                
                /* Base Layout */
                .evergreen-page {
                    min-height: 100vh;
                    background-color: #F9FAFB;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
                    padding-bottom: 4rem;
                    position: relative;
                    overflow-x: hidden;
                }

                /* Cursor following glow effect */
                .evergreen-page::before {
                    content: '';
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: radial-gradient(600px circle at var(--mouse-x) var(--mouse-y), rgba(16, 185, 129, 0.03), transparent 40%);
                    pointer-events: none;
                    z-index: 1;
                    opacity: 0;
                    transition: opacity 300ms ease;
                }

                .evergreen-page:hover::before {
                    opacity: 1;
                }

                .evergreen-content {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 2rem;
                    position: relative;
                    z-index: 2;
                }

                /* Card Styles */
                .evergreen-card {
                    background: #FFFFFF;
                    border: 1px solid #E5E7EB;
                    border-radius: 12px;
                    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
                    transition: all 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
                    position: relative;
                    overflow: hidden;
                    z-index: 2;
                    transform-style: preserve-3d;
                }

                /* Stats Card Enhanced Styles */
                .evergreen-stats-card-wrapper {
                    position: relative;
                    cursor: pointer;
                    transition: all 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
                }

                .evergreen-stats-card {
                    transform-style: preserve-3d;
                    transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 250ms ease;
                    position: relative;
                    overflow: hidden;
                }

                .evergreen-stats-content {
                    text-align: center;
                    position: relative;
                    min-height: 180px;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    padding: 24px;
                    background: linear-gradient(135deg, #FFFFFF 0%, #FAFBFB 100%);
                    border-radius: 12px;
                    overflow: hidden;
                }

                .evergreen-stats-content::before {
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

                .evergreen-stats-content::after {
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

                .evergreen-stats-number {
                    font-size: 3rem;
                    font-weight: 700;
                    background: linear-gradient(135deg, #10B981 0%, #06B6D4 50%, #10B981 100%);
                    background-size: 200% 200%;
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    line-height: 1;
                    margin: 0;
                    transition: all 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
                    position: relative;
                    animation: gradientShift 4s ease-in-out infinite;
                    letter-spacing: -0.01em;
                }

                @keyframes gradientShift {
                    0%, 100% { 
                        background-position: 0% 50%;
                        transform: perspective(500px) rotateY(0deg);
                    }
                    50% { 
                        background-position: 100% 50%;
                        transform: perspective(500px) rotateY(2deg);
                    }
                }

                .evergreen-stats-number::before {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 120%;
                    height: 120%;
                    background: radial-gradient(ellipse at center, rgba(16, 185, 129, 0.1) 0%, transparent 70%);
                    transform: translate(-50%, -50%);
                    z-index: -1;
                    opacity: 0;
                    transition: opacity 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
                    border-radius: 50%;
                }

                .evergreen-stats-card-wrapper:hover .evergreen-stats-number {
                    transform: perspective(500px) rotateY(1deg);
                    filter: 
                        drop-shadow(0 0 6px rgba(16, 185, 129, 0.3))
                        drop-shadow(0 0 12px rgba(6, 182, 212, 0.2));
                    animation-duration: 2s;
                }

                .evergreen-stats-card-wrapper:hover .evergreen-stats-number::before {
                    opacity: 0.7;
                    transform: translate(-50%, -50%);
                }

                .evergreen-stats-header {
                    margin-bottom: 16px;
                    opacity: 0.8;
                    transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
                }

                .evergreen-stats-card-wrapper:hover .evergreen-stats-header {
                    opacity: 1;
                    transform: translateY(-1px);
                }

                .evergreen-stats-footer {
                    margin-top: 16px;
                    opacity: 0.7;
                    transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
                }

                .evergreen-stats-card-wrapper:hover .evergreen-stats-footer {
                    opacity: 1;
                    transform: translateY(1px);
                }

                /* Simple CSS hover effects for non-stats cards */
                .evergreen-card:not(.evergreen-stats-card):hover {
                    background: linear-gradient(135deg, #FFFFFF 0%, #FAFBFB 100%);
                    border: 1px solid rgba(16, 185, 129, 0.3);
                    box-shadow: 
                        0px 20px 40px -10px rgba(17, 24, 39, 0.15), 
                        0 8px 16px -8px rgba(17, 24, 39, 0.1),
                        0 0 0 1px rgba(16, 185, 129, 0.1),
                        0 0 20px rgba(16, 185, 129, 0.08);
                    transform: translateY(-8px) scale(1.01);
                }

                /* Animate center content in duplicate cards */
                .evergreen-card:not(.evergreen-stats-card):hover div[style*="text-align: center"] {
                    transform: translateY(-2px);
                    transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
                }

                /* Animate numbers in non-stats cards */
                .evergreen-card:not(.evergreen-stats-card):hover p[style*="heading2xl"] {
                    color: #10B981;
                    transform: scale(1.05) translateY(-2px);
                    filter: drop-shadow(0 0 6px rgba(16, 185, 129, 0.4));
                    transition: all 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
                }

                /* Animate headings in non-stats cards */
                .evergreen-card:not(.evergreen-stats-card):hover h3 {
                    color: #059669;
                    transform: translateY(-1px);
                    filter: drop-shadow(0 0 4px rgba(16, 185, 129, 0.3));
                    transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
                }

                /* Button Wrapper - Primary */
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
                    align-self: flex-start;
                }

                .evergreen-button-wrapper:hover {
                    transform: translateY(-2px);
                    box-shadow: 
                        0 8px 25px 0 rgba(16, 185, 129, 0.4),
                        0 0 20px rgba(16, 185, 129, 0.3);
                    filter: brightness(1.1);
                }

                .evergreen-button-wrapper:active {
                    transform: translateY(0px);
                    transition: all 100ms ease;
                    box-shadow: 0 2px 8px 0 rgba(16, 185, 129, 0.4);
                }

                /* Button Wrapper - Secondary */
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
                    align-self: flex-start;
                }

                .evergreen-button-wrapper-secondary:hover {
                    transform: translateY(-2px);
                    border-color: #059669;
                    box-shadow: 
                        0 8px 25px 0 rgba(16, 185, 129, 0.2),
                        0 0 15px rgba(16, 185, 129, 0.15);
                }

                .evergreen-button-wrapper-secondary:active {
                    transform: translateY(0px);
                    transition: all 100ms ease;
                    box-shadow: 0 2px 8px 0 rgba(16, 185, 129, 0.2);
                }

                /* Button Content Styles */
                .evergreen-button-wrapper button,
                .evergreen-button-wrapper-secondary button,
                .evergreen-button-wrapper .Polaris-Button,
                .evergreen-button-wrapper-secondary .Polaris-Button {
                    background: transparent !important;
                    border: none !important;
                    box-shadow: none !important;
                    color: white !important;
                    width: auto !important;
                    min-width: auto !important;
                    display: inline-flex !important;
                    flex: none !important;
                    max-width: none !important;
                }

                .evergreen-button-wrapper-secondary button,
                .evergreen-button-wrapper-secondary .Polaris-Button {
                    color: #10B981 !important;
                }

                /* SHIMMER EFFECT */
                .evergreen-button-wrapper::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: -100%;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
                    transition: left 500ms ease;
                    z-index: 1;
                }

                .evergreen-button-wrapper:hover::before {
                    left: 100%;
                }

                /* SECONDARY SHIMMER EFFECT */
                .evergreen-button-wrapper-secondary::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: -100%;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(90deg, transparent, rgba(16, 185, 129, 0.2), transparent);
                    transition: left 500ms ease;
                    z-index: 1;
                }

                .evergreen-button-wrapper-secondary:hover::before {
                    left: 100%;
                }

                /* RIPPLE EFFECT */
                .evergreen-button-wrapper::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 0;
                    height: 0;
                    background: rgba(255, 255, 255, 0.3);
                    border-radius: 50%;
                    transform: translate(-50%, -50%);
                    transition: width 600ms ease, height 600ms ease;
                    z-index: 1;
                }

                .evergreen-button-wrapper:active::after {
                    width: 300px;
                    height: 300px;
                    transition: width 0ms, height 0ms;
                }

                /* SECONDARY RIPPLE EFFECT */
                .evergreen-button-wrapper-secondary::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 0;
                    height: 0;
                    background: rgba(16, 185, 129, 0.2);
                    border-radius: 50%;
                    transform: translate(-50%, -50%);
                    transition: width 600ms ease, height 600ms ease;
                    z-index: 1;
                }

                .evergreen-button-wrapper-secondary:active::after {
                    width: 300px;
                    height: 300px;
                    transition: width 0ms, height 0ms;
                }

                .evergreen-button-wrapper .Polaris-Button,
                .evergreen-button-wrapper-secondary .Polaris-Button {
                    position: relative;
                    z-index: 2;
                }

                /* Button Layout Fixes */
                .Polaris-BlockStack > .evergreen-button-wrapper,
                .Polaris-BlockStack > .evergreen-button-wrapper-secondary {
                    width: auto !important;
                    align-self: flex-start !important;
                }

                /* Center buttons in Step 2 duplicate cards */
                div[style*="text-align: center"] .evergreen-button-wrapper,
                div[style*="text-align: center"] .evergreen-button-wrapper-secondary,
                div[style*="textAlign: center"] .evergreen-button-wrapper,
                div[style*="textAlign: center"] .evergreen-button-wrapper-secondary {
                    align-self: center !important;
                    margin: 0 auto !important;
                }

                /* Disabled Button States */
                .evergreen-button-wrapper-disabled {
                    background: #F3F4F6 !important;
                    border: 1px solid #E5E7EB !important;
                    cursor: not-allowed !important;
                    opacity: 0.6 !important;
                }

                .evergreen-button-wrapper-disabled:hover {
                    transform: none !important;
                    box-shadow: none !important;
                    background: #F3F4F6 !important;
                    border: 1px solid #E5E7EB !important;
                }

                .evergreen-button-wrapper-disabled::before,
                .evergreen-button-wrapper-disabled::after {
                    display: none !important;
                }

                .evergreen-button-wrapper-disabled button,
                .evergreen-button-wrapper-disabled .Polaris-Button {
                    color: #9CA3AF !important;
                    background: #F3F4F6 !important;
                    cursor: not-allowed !important;
                }

                /* PAGE HEADER BUTTON STYLES */
                .Polaris-Page-Header .Polaris-Button--primary,
                .Polaris-Page-Header button[data-primary-action],
                .Polaris-Page-Header button.Polaris-Button,
                .Polaris-Page-Header [role="button"],
                header .Polaris-Button--primary,
                header button.Polaris-Button {
                    background: linear-gradient(120deg, #10B981 0%, #06B6D4 100%) !important;
                    border: none !important;
                    border-radius: 8px !important;
                    box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.25) !important;
                    transition: all 250ms cubic-bezier(0.34, 1.56, 0.64, 1) !important;
                    position: relative !important;
                    overflow: hidden !important;
                    font-weight: 600 !important;
                }

                .Polaris-Page-Header .Polaris-Button--primary::before {
                    content: '' !important;
                    position: absolute !important;
                    top: 0 !important;
                    left: -100% !important;
                    width: 100% !important;
                    height: 100% !important;
                    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent) !important;
                    transition: left 500ms ease !important;
                    z-index: 1 !important;
                }

                .Polaris-Page-Header .Polaris-Button--primary:hover::before {
                    left: 100% !important;
                }

                .Polaris-Page-Header .Polaris-Button--primary:hover {
                    transform: translateY(-2px) !important;
                    box-shadow: 
                        0 8px 25px 0 rgba(16, 185, 129, 0.4) !important,
                        0 0 20px rgba(16, 185, 129, 0.3) !important;
                    filter: brightness(1.1) !important;
                }

                .Polaris-Page-Header .Polaris-Button--primary:active {
                    transform: translateY(0px) !important;
                    transition: all 100ms ease !important;
                    box-shadow: 0 2px 8px 0 rgba(16, 185, 129, 0.4) !important;
                }

                .Polaris-Page-Header .Polaris-Button--primary .Polaris-Button__Content {
                    position: relative !important;
                    z-index: 2 !important;
                }

                /* PULSE EFFECT FOR HEADER BUTTON */
                .Polaris-Page-Header .Polaris-Button--primary {
                    animation: headerButtonPulse 3s ease-in-out infinite;
                }

                @keyframes headerButtonPulse {
                    0%, 100% {
                        box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.25), 0 0 0 0 rgba(16, 185, 129, 0.7);
                    }
                    70% {
                        box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.25), 0 0 0 8px rgba(16, 185, 129, 0);
                    }
                }

                /* BACKUP CSS for dynamically styled header button */
                .evergreen-header-styled {
                    background: linear-gradient(120deg, #10B981 0%, #06B6D4 100%) !important;
                    border: none !important;
                    border-radius: 8px !important;
                    box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.25) !important;
                    transition: all 250ms cubic-bezier(0.34, 1.56, 0.64, 1) !important;
                    position: relative !important;
                    overflow: hidden !important;
                    font-weight: 600 !important;
                    color: #FFFFFF !important;
                }

                .evergreen-header-styled:hover {
                    transform: translateY(-2px) !important;
                    box-shadow: 0 8px 25px 0 rgba(16, 185, 129, 0.4), 0 0 20px rgba(16, 185, 129, 0.3) !important;
                    filter: brightness(1.1) !important;
                }

                .evergreen-header-styled:active {
                    transform: translateY(0px) !important;
                    box-shadow: 0 2px 8px 0 rgba(16, 185, 129, 0.4) !important;
                }

                /* Magnetic Effect */
                .evergreen-magnetic {
                    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                }

                /* GLOW EFFECT FOR WRAPPERS */
                .evergreen-button-glow {
                    position: relative;
                }

                .evergreen-button-glow::before {
                    content: '';
                    position: absolute;
                    top: -3px;
                    left: -3px;
                    right: -3px;
                    bottom: -3px;
                    background: linear-gradient(45deg, #10B981, #06B6D4, #10B981, #06B6D4);
                    background-size: 400% 400%;
                    border-radius: 12px;
                    z-index: -2;
                    animation: glowRotate 4s ease-in-out infinite;
                    opacity: 0;
                    transition: opacity 300ms ease;
                }

                .evergreen-button-glow:hover::before {
                    opacity: 0.7;
                }

                @keyframes glowRotate {
                    0% {
                        background-position: 0% 50%;
                    }
                    50% {
                        background-position: 100% 50%;
                    }
                    100% {
                        background-position: 0% 50%;
                    }
                }

                /* PULSE EFFECT FOR WRAPPERS */
                .evergreen-pulse {
                    animation: buttonPulse 2s infinite;
                }

                @keyframes buttonPulse {
                    0% {
                        box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.25), 0 0 0 0 rgba(16, 185, 129, 0.7);
                    }
                    70% {
                        box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.25), 0 0 0 10px rgba(16, 185, 129, 0);
                    }
                    100% {
                        box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.25), 0 0 0 0 rgba(16, 185, 129, 0);
                    }
                }

                /* Focus states */
                .evergreen-card:focus-within {
                    outline: 2px solid rgba(16, 185, 129, 0.5);
                    outline-offset: 2px;
                }
            `}</style>

            <div className="evergreen-page">
                <div className="evergreen-content">
                    <Page
                        backAction={{ content: 'Dashboard', onAction: handleBack }}
                        title="Check duplicates"
                        subtitle="Delete duplicate products or variants by title, SKU, barcode, or a combination of these"
                    >
                        <BlockStack gap="500">
                            {/* =============================================================================
                                STEP 1: SYNC PRODUCTS
                                ============================================================================= */}
                            <Layout>
                                <Layout.Section>
                                    <Card className="evergreen-card">
                                        <BlockStack gap="400">
                                            <Text as="p" variant="bodyMd">
                                                <Text as="span" fontWeight="semibold">Step 1:</Text> Sync products for calculation of duplicate products and variants.
                                            </Text>

                                            <div className="evergreen-button-wrapper evergreen-magnetic evergreen-button-glow evergreen-pulse">
                                                <Button
                                                    onClick={handleSyncProducts}
                                                    icon={RefreshIcon}
                                                    variant="primary"
                                                >
                                                    Sync products
                                                </Button>
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
                                    <Card className="evergreen-card">
                                        <BlockStack gap="400">
                                            <Text as="p" variant="bodyMd">
                                                <Text as="span" fontWeight="semibold">Step 2:</Text> Select a field to take action for duplicate products and variants.
                                            </Text>

                                            {/* Duplicate Cards Grid */}
                                            <div style={{
                                                display: "grid",
                                                gridTemplateColumns: "repeat(3, 1fr)",
                                                gap: "16px",
                                                "@media (max-width: 768px)": {
                                                    gridTemplateColumns: "1fr"
                                                }
                                            }}>
                                                {duplicateTypes.map((type) => {
                                                    const count = duplicateStats[type.key];
                                                    const isDisabled = count === 0;

                                                    return (
                                                        <div key={type.key} className="evergreen-stats-card-wrapper">
                                                            <Card className="evergreen-card evergreen-stats-card">
                                                                <div className="evergreen-stats-content">
                                                                    <Text as="h3" variant="headingSm" fontWeight="semibold" className="evergreen-stats-header">
                                                                        {type.label}
                                                                    </Text>
                                                                    <div className="evergreen-stats-number">
                                                                        {count}
                                                                    </div>
                                                                    <div className="evergreen-stats-footer">
                                                                        <div className={getButtonWrapperClass(isDisabled)}>
                                                                            <Button
                                                                                size="slim"
                                                                                onClick={() => handleCheckOptions(type.action)}
                                                                                disabled={isDisabled}
                                                                            >
                                                                                Check options
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </Card>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </BlockStack>
                                    </Card>
                                </Layout.Section>
                            </Layout>

                            {/* =============================================================================
                                STEP 3: BULK DELETE RULES
                                ============================================================================= */}
                            <Layout>
                                <Layout.Section>
                                    <Card className="evergreen-card">
                                        <BlockStack gap="400">
                                            <Text as="p" variant="bodyMd">
                                                <Text as="span" fontWeight="semibold">Step 3:</Text> Choose a rule to delete duplicate products or variants in bulk.
                                            </Text>

                                            <Text as="p" variant="bodyMd" tone="info" fontWeight="semibold">
                                                This action can not be reverted. Please export your products before deleting them in bulk.
                                            </Text>

                                            <InlineStack gap="300" blockAlign="end">
                                                <div style={{ minWidth: "300px" }}>
                                                    <Select
                                                        label=""
                                                        options={ruleOptions}
                                                        value={selectedRule}
                                                        onChange={setSelectedRule}
                                                        placeholder="Select a rule"
                                                    />
                                                </div>
                                                <div className={`evergreen-button-wrapper evergreen-magnetic evergreen-button-glow ${!selectedRule ? 'evergreen-button-wrapper-primary-disabled' : ''}`}>
                                                    <Button
                                                        onClick={handleBulkDelete}
                                                        disabled={!selectedRule}
                                                        variant="primary"
                                                    >
                                                        Bulk delete
                                                    </Button>
                                                </div>
                                            </InlineStack>
                                        </BlockStack>
                                    </Card>
                                </Layout.Section>
                            </Layout>

                            {/* =============================================================================
                                STEP 4: MANUAL SELECTION
                                ============================================================================= */}
                            <Layout>
                                <Layout.Section>
                                    <Card className="evergreen-card">
                                        <BlockStack gap="400">
                                            <InlineStack align="space-between" blockAlign="center">
                                                <Text as="p" variant="bodyMd">
                                                    <Text as="span" fontWeight="semibold">Step 4:</Text> You can also select products or variants to delete manually.
                                                </Text>
                                                <div className={`evergreen-button-wrapper evergreen-magnetic evergreen-button-glow ${selectedProducts.length === 0 ? 'evergreen-button-wrapper-primary-disabled' : ''}`}>
                                                    <Button
                                                        onClick={handleDeleteSelected}
                                                        disabled={selectedProducts.length === 0}
                                                        variant="primary"
                                                    >
                                                        Delete selected
                                                    </Button>
                                                </div>
                                            </InlineStack>

                                            {/* Products Table */}
                                            <div style={{ overflowX: "auto" }}>
                                                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                                    <thead>
                                                        <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                                                            <th style={{ padding: "12px 8px", textAlign: "left" }}>
                                                                <Checkbox
                                                                    checked={selectedProducts.length === duplicateProducts.length && duplicateProducts.length > 0}
                                                                    indeterminate={selectedProducts.length > 0 && selectedProducts.length < duplicateProducts.length}
                                                                    onChange={handleSelectAllProducts}
                                                                />
                                                            </th>
                                                            <th style={{ padding: "12px 8px", textAlign: "left" }}>
                                                                <Text as="span" variant="bodyMd" fontWeight="semibold">Image</Text>
                                                            </th>
                                                            <th style={{ padding: "12px 8px", textAlign: "left" }}>
                                                                <Text as="span" variant="bodyMd" fontWeight="semibold">Type</Text>
                                                            </th>
                                                            <th style={{ padding: "12px 8px", textAlign: "left" }}>
                                                                <Text as="span" variant="bodyMd" fontWeight="semibold">Title</Text>
                                                            </th>
                                                            <th style={{ padding: "12px 8px", textAlign: "left" }}>
                                                                <Text as="span" variant="bodyMd" fontWeight="semibold">SKU</Text>
                                                            </th>
                                                            <th style={{ padding: "12px 8px", textAlign: "left" }}>
                                                                <Text as="span" variant="bodyMd" fontWeight="semibold">Barcode</Text>
                                                            </th>
                                                            <th style={{ padding: "12px 8px", textAlign: "left" }}>
                                                                <Text as="span" variant="bodyMd" fontWeight="semibold">Price</Text>
                                                            </th>
                                                            <th style={{ padding: "12px 8px", textAlign: "left" }}>
                                                                <Text as="span" variant="bodyMd" fontWeight="semibold">Status</Text>
                                                            </th>
                                                            <th style={{ padding: "12px 8px", textAlign: "left" }}>
                                                                <Text as="span" variant="bodyMd" fontWeight="semibold">Created at</Text>
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {duplicateProducts.map((product) => (
                                                            <tr key={product.id} style={{ borderBottom: "1px solid #f1f2f3" }}>
                                                                <td style={{ padding: "12px 8px" }}>
                                                                    <Checkbox
                                                                        checked={selectedProducts.includes(product.id)}
                                                                        onChange={() => handleProductSelection(product.id)}
                                                                    />
                                                                </td>
                                                                <td style={{ padding: "12px 8px" }}>
                                                                    <Thumbnail
                                                                        size="small"
                                                                        source={product.image}
                                                                        alt={product.title}
                                                                    />
                                                                </td>
                                                                <td style={{ padding: "12px 8px" }}>
                                                                    <Text as="span" variant="bodyMd">{product.type}</Text>
                                                                </td>
                                                                <td style={{ padding: "12px 8px" }}>
                                                                    <Text as="span" variant="bodyMd" tone="base">
                                                                        {product.title}
                                                                    </Text>
                                                                </td>
                                                                <td style={{ padding: "12px 8px" }}>
                                                                    <Text as="span" variant="bodyMd">{product.sku || "-"}</Text>
                                                                </td>
                                                                <td style={{ padding: "12px 8px" }}>
                                                                    <Text as="span" variant="bodyMd">{product.barcode || "-"}</Text>
                                                                </td>
                                                                <td style={{ padding: "12px 8px" }}>
                                                                    <Text as="span" variant="bodyMd">{product.price}</Text>
                                                                </td>
                                                                <td style={{ padding: "12px 8px" }}>
                                                                    <Badge status={product.status === "ACTIVE" ? "success" : "info"}>
                                                                        {product.status}
                                                                    </Badge>
                                                                </td>
                                                                <td style={{ padding: "12px 8px" }}>
                                                                    <Text as="span" variant="bodyMd" tone="subdued">
                                                                        {product.createdAt}
                                                                    </Text>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </BlockStack>
                                    </Card>
                                </Layout.Section>
                            </Layout>
                        </BlockStack>
                    </Page>
                </div>
            </div>
        </>
    );
} 