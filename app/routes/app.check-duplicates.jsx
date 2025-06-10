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
        byTitle: 47,
        bySku: 23,
        byBarcode: 15,
        byTitleBarcode: 8,
        byTitleSku: 12,
        bySkuBarcode: 5
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
    // RENDER
    // =============================================================================
    return (
        <>
            <style>{`
                /* Evergreen Interface Kit Enhanced Styles */
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
                
                :root {
                    --mouse-x: 0px;
                    --mouse-y: 0px;
                }
                
                .evergreen-page {
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
                    background-color: #F9FAFB;
                    min-height: 100vh;
                    position: relative;
                    overflow-x: hidden;
                    padding-bottom: 4rem;
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
                
                .evergreen-card {
                    background: #FFFFFF;
                    border: 1px solid #E5E7EB;
                    border-radius: 12px;
                    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
                    transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    overflow: hidden;
                    z-index: 2;
                }
                
                .evergreen-card-interactive {
                    transform-style: preserve-3d;
                    transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 250ms ease;
                }
                
                .evergreen-card:hover {
                    box-shadow: 0px 20px 40px -10px rgba(17, 24, 39, 0.15), 0 8px 16px -8px rgba(17, 24, 39, 0.1);
                    transform: translateY(-8px);
                }
                
                .evergreen-card::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0);
                    transition: background 250ms cubic-bezier(0.4, 0, 0.2, 1);
                    pointer-events: none;
                    z-index: 1;
                }
                
                .evergreen-card:hover::before {
                    background: rgba(0, 0, 0, 0.04);
                }
                
                /* Shimmer effect */
                .evergreen-card::after {
                    content: '';
                    position: absolute;
                    top: -50%;
                    left: -50%;
                    width: 200%;
                    height: 200%;
                    background: linear-gradient(
                        45deg,
                        transparent 30%,
                        rgba(16, 185, 129, 0.1) 50%,
                        transparent 70%
                    );
                    transform: translateX(-100%) translateY(-100%) rotate(45deg);
                    transition: transform 600ms cubic-bezier(0.34, 1.56, 0.64, 1);
                    pointer-events: none;
                    z-index: 2;
                }
                
                .evergreen-card:hover::after {
                    transform: translateX(100%) translateY(100%) rotate(45deg);
                }
                
                .evergreen-card > * {
                    position: relative;
                    z-index: 3;
                }
                
                /* WRAPPER APPROACH - Button effects using div wrappers */
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
                }
                
                /* WRAPPER HOVER EFFECTS */
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
                
                .evergreen-button-wrapper .Polaris-Button {
                    position: relative;
                    z-index: 2;
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
                
                /* Stats Cards Styling */
                .evergreen-stats-card-wrapper {
                    position: relative;
                    cursor: pointer;
                    transition: all 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                
                .evergreen-stats-content {
                    text-align: center;
                    position: relative;
                    min-height: 160px;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    padding: 20px;
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
                    transform: translateY(-2px);
                }
                
                .evergreen-stats-card-wrapper:hover .evergreen-stats-content {
                    background: linear-gradient(135deg, #FAFAFA 0%, #F9FAFB 100%);
                    box-shadow: 
                        0px 12px 25px -8px rgba(16, 185, 129, 0.15), 
                        0 4px 12px -2px rgba(17, 24, 39, 0.08),
                        0 0 0 1px rgba(16, 185, 129, 0.1);
                    border: 1px solid rgba(16, 185, 129, 0.2);
                }
                
                /* Magnetic effect for buttons */
                .evergreen-magnetic {
                    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                
                /* Button wrapper approach as backup */
                .evergreen-button-wrapper {
                    display: inline-block;
                    position: relative;
                    transition: transform 150ms ease-out;
                }
                
                .evergreen-button-wrapper.evergreen-magnetic:hover {
                    transform: none; /* Will be handled by JS */
                }
                
                /* Focus states */
                .evergreen-card:focus-within {
                    outline: 2px solid rgba(16, 185, 129, 0.5);
                    outline-offset: 2px;
                }
                
                /* Ripple effect */
                .evergreen-ripple {
                    position: relative;
                    overflow: hidden;
                }
                
                .evergreen-ripple::before {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 0;
                    height: 0;
                    border-radius: 50%;
                    background: rgba(16, 185, 129, 0.3);
                    transform: translate(-50%, -50%);
                    transition: width 600ms ease, height 600ms ease;
                }
                
                .evergreen-ripple:active::before {
                    width: 300px;
                    height: 300px;
                }
                
                                /* Stats Numbers with Advanced Effects */
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
                    animation: gradientShift 6s ease-in-out infinite;
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
                
                .evergreen-stats-number::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: linear-gradient(135deg, transparent 0%, rgba(255, 255, 255, 0.2) 50%, transparent 100%);
                    opacity: 0;
                    transition: opacity 300ms ease;
                    animation: numberShine 2s ease-in-out infinite;
                }
                
                @keyframes numberShine {
                    0%, 100% { 
                        transform: translateX(-100%) skewX(-20deg);
                        opacity: 0;
                    }
                    50% { 
                        transform: translateX(100%) skewX(-20deg);
                        opacity: 0.6;
                    }
                }
                
                .evergreen-stats-card:hover .evergreen-stats-number::after {
                    animation-duration: 0.8s;
                }
                
                /* SUBTLE SELECT STYLING */
                .evergreen-select-wrapper {
                    position: relative;
                    background: #FFFFFF;
                    border: 1px solid #E5E7EB;
                    border-radius: 8px;
                    overflow: hidden;
                    transition: all 200ms ease;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
                }
                
                .evergreen-select-wrapper::before {
                    content: '';
                    position: absolute;
                    left: 0;
                    bottom: 0;
                    width: 0%;
                    height: 2px;
                    background: linear-gradient(90deg, #10B981 0%, #06B6D4 100%);
                    transition: width 300ms ease;
                    z-index: 2;
                }
                
                .evergreen-select-wrapper:hover::before {
                    width: 100%;
                }
                
                .evergreen-select-wrapper:hover {
                    transform: translateY(-1px);
                    border-color: #10B981;
                    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.12);
                }
                
                /* SUBTLE WARNING CARD */
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
                
                .evergreen-warning-card::before {
                    content: '';
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 4px;
                    height: 100%;
                    background: linear-gradient(180deg, #F59E0B 0%, #D97706 100%);
                    transition: width 200ms ease;
                }
                
                .evergreen-warning-card::after {
                    content: '⚠️';
                    position: absolute;
                    top: 16px;
                    right: 16px;
                    font-size: 1.2rem;
                    opacity: 0.7;
                    transition: opacity 200ms ease;
                }
                
                .evergreen-warning-card:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.15);
                    border-color: #F59E0B;
                }
                
                .evergreen-warning-card:hover::before {
                    width: 6px;
                }
                
                .evergreen-warning-card:hover::after {
                    opacity: 1;
                }
                
                /* SUBTLE FLOATING PARTICLES */
                .evergreen-step-container {
                    position: relative;
                    overflow: hidden;
                }
                
                .evergreen-step-container::before {
                    content: '';
                    position: absolute;
                    top: 15%;
                    left: 10%;
                    width: 2px;
                    height: 2px;
                    background: #10B981;
                    border-radius: 50%;
                    box-shadow: 
                        80px 40px 0 rgba(16, 185, 129, 0.3),
                        160px 20px 0 rgba(6, 182, 212, 0.2),
                        240px 60px 0 rgba(16, 185, 129, 0.25),
                        320px 10px 0 rgba(6, 182, 212, 0.15);
                    animation: floatingMagic 12s ease-in-out infinite;
                    opacity: 0.3;
                    pointer-events: none;
                    z-index: 1;
                }
                
                /* SUBTLE ENHANCED BUTTONS */
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
                
                .evergreen-button-epic::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: -100%;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
                    transition: left 400ms ease;
                    z-index: 1;
                }
                
                .evergreen-button-epic:hover::before {
                    left: 100%;
                }
                
                .evergreen-button-epic:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.35);
                    background: linear-gradient(135deg, #059669 0%, #047857 100%);
                }
                
                .evergreen-button-epic:active {
                    transform: translateY(0px);
                    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
                }
                
                .evergreen-button-epic > * {
                    position: relative;
                    z-index: 2;
                }
                
                /* KEYFRAME ANIMATIONS */
                @keyframes borderPulse {
                    0%, 100% { 
                        background-position: 0% 50%;
                        transform: rotate(0deg);
                    }
                    50% { 
                        background-position: 100% 50%;
                        transform: rotate(180deg);
                    }
                }
                
                @keyframes warningPulse {
                    0%, 100% { 
                        background-position: 0% 50%;
                        opacity: 0.8;
                    }
                    50% { 
                        background-position: 100% 50%;
                        opacity: 1;
                    }
                }
                
                @keyframes iconBounce {
                    0%, 100% { 
                        transform: translateY(0px) rotate(0deg);
                    }
                    25% { 
                        transform: translateY(-3px) rotate(5deg);
                    }
                    75% { 
                        transform: translateY(-1px) rotate(-5deg);
                    }
                }
                
                @keyframes floatingMagic {
                    0%, 100% { 
                        transform: translateY(0px) rotate(0deg);
                        opacity: 0.6;
                    }
                    25% { 
                        transform: translateY(-20px) rotate(90deg);
                        opacity: 0.8;
                    }
                    50% { 
                        transform: translateY(-10px) rotate(180deg);
                        opacity: 1;
                    }
                    75% { 
                        transform: translateY(-30px) rotate(270deg);
                        opacity: 0.7;
                    }
                }
                
                /* EPIC PRODUCT TABLE STYLING */
                .evergreen-product-table {
                    background: linear-gradient(135deg, #FFFFFF 0%, #F9FAFB 100%);
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
                    border: 1px solid #E5E7EB;
                    position: relative;
                }
                
                .evergreen-product-table::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 2px;
                    background: linear-gradient(90deg, #10B981 0%, #06B6D4 50%, #10B981 100%);
                    background-size: 200% 100%;
                    animation: headerShine 3s ease-in-out infinite;
                }
                
                @keyframes headerShine {
                    0%, 100% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
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
                
                .evergreen-table-header th:hover {
                    background: rgba(16, 185, 129, 0.05);
                    color: #10B981 !important;
                }
                
                .evergreen-product-row {
                    transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    background: #FFFFFF;
                    border-bottom: 1px solid #F3F4F6;
                }
                
                .evergreen-product-row::before {
                    content: '';
                    position: absolute;
                    left: 0;
                    top: 0;
                    bottom: 0;
                    width: 0;
                    background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(6, 182, 212, 0.05) 100%);
                    transition: width 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
                    z-index: 1;
                }
                
                .evergreen-product-row:hover::before {
                    width: 100%;
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
                
                /* EPIC CHECKBOX STYLING */
                .evergreen-epic-checkbox {
                    position: relative;
                    transform: scale(1.2);
                    transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                
                .evergreen-epic-checkbox:hover {
                    transform: scale(1.3);
                    filter: drop-shadow(0 0 8px rgba(16, 185, 129, 0.5));
                }
                
                /* PRODUCT IMAGE EFFECTS */
                .evergreen-product-image {
                    transition: all 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
                    position: relative;
                    overflow: hidden;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                }
                
                .evergreen-product-image::after {
                    content: '';
                    position: absolute;
                    top: -50%;
                    left: -50%;
                    width: 200%;
                    height: 200%;
                    background: linear-gradient(
                        45deg,
                        transparent 30%,
                        rgba(255, 255, 255, 0.4) 50%,
                        transparent 70%
                    );
                    transform: translateX(-100%) translateY(-100%) rotate(45deg);
                    transition: transform 600ms ease;
                    opacity: 0;
                }
                
                .evergreen-product-row:hover .evergreen-product-image {
                    transform: scale(1.05) rotate(1deg);
                    box-shadow: 0 8px 25px rgba(16, 185, 129, 0.2);
                }
                
                .evergreen-product-row:hover .evergreen-product-image::after {
                    transform: translateX(100%) translateY(100%) rotate(45deg);
                    opacity: 1;
                }
                
                /* EPIC BADGE STYLING */
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
                
                .evergreen-status-badge.status-active {
                    background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%) !important;
                    color: #047857 !important;
                    border: 1px solid #A7F3D0 !important;
                    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
                }
                
                .evergreen-status-badge.status-draft {
                    background: linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%) !important;
                    color: #374151 !important;
                    border: 1px solid #D1D5DB !important;
                    box-shadow: 0 2px 8px rgba(107, 114, 128, 0.2);
                }
                
                .evergreen-status-badge::before {
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
                
                .evergreen-product-row:hover .evergreen-status-badge::before {
                    left: 100%;
                }
                
                .evergreen-product-row:hover .evergreen-status-badge {
                    transform: translateY(-2px) scale(1.05);
                    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.3);
                }
                
                /* PRICE ANIMATION */
                .evergreen-price-text {
                    font-weight: 600;
                    color: #059669;
                    transition: all 300ms ease;
                    position: relative;
                }
                
                .evergreen-product-row:hover .evergreen-price-text {
                    color: #047857;
                    transform: scale(1.05);
                    text-shadow: 0 0 10px rgba(16, 185, 129, 0.3);
                }
                
                /* TITLE HOVER EFFECT */
                .evergreen-product-title {
                    font-weight: 500;
                    color: #1F2937;
                    transition: all 300ms ease;
                    position: relative;
                }
                
                .evergreen-product-title::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    width: 0;
                    height: 2px;
                    background: linear-gradient(90deg, #10B981 0%, #06B6D4 100%);
                    transition: width 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                
                .evergreen-product-row:hover .evergreen-product-title {
                    color: #10B981;
                    transform: translateX(4px);
                }
                
                .evergreen-product-row:hover .evergreen-product-title::after {
                    width: 100%;
                }
                
                /* ENTRANCE ANIMATIONS */
                .evergreen-table-row-entrance {
                    animation: tableRowEntrance 600ms cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                
                @keyframes tableRowEntrance {
                    from {
                        opacity: 0;
                        transform: translateY(20px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
                
                /* FLOATING GLOW ON HOVER */
                .evergreen-product-row:hover {
                    position: relative;
                }
                
                .evergreen-product-row:hover::after {
                    content: '';
                    position: absolute;
                    top: -10px;
                    left: -10px;
                    right: -10px;
                    bottom: -10px;
                    background: radial-gradient(circle at center, rgba(16, 185, 129, 0.1) 0%, transparent 70%);
                    z-index: -1;
                    opacity: 0;
                    animation: glowPulse 2s ease-in-out infinite;
                }
                
                @keyframes glowPulse {
                    0%, 100% { opacity: 0; transform: scale(1); }
                    50% { opacity: 0.8; transform: scale(1.02); }
                }
                
                /* Animation keyframes */
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
            `}</style>

            <div className="evergreen-page">
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
                                <Card className="evergreen-card evergreen-card-interactive evergreen-animation-entrance">
                                    <BlockStack gap="400">
                                        <Text as="p" variant="bodyMd">
                                            <Text as="span" fontWeight="semibold">Step 1:</Text> Sync products for calculation of duplicate products and variants.
                                        </Text>

                                        <div className="evergreen-button-wrapper evergreen-magnetic">
                                            <Button
                                                onClick={handleSyncProducts}
                                                icon={RefreshIcon}
                                                variant="primary"
                                                size="slim"
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
                                <Card className="evergreen-card evergreen-card-interactive evergreen-animation-entrance">
                                    <BlockStack gap="400">
                                        <Text as="p" variant="bodyMd">
                                            <Text as="span" fontWeight="semibold">Step 2:</Text> Select a field to take action for duplicate products and variants.
                                        </Text>

                                        {/* Duplicate Cards Grid */}
                                        <div style={{
                                            display: "grid",
                                            gridTemplateColumns: "repeat(3, 1fr)",
                                            gap: "32px",
                                            "@media (max-width: 768px)": {
                                                gridTemplateColumns: "1fr"
                                            }
                                        }}>
                                            {duplicateTypes.map((type) => {
                                                const count = duplicateStats[type.key];
                                                const isDisabled = count === 0;

                                                return (
                                                    <div key={type.key} className="evergreen-stats-card-wrapper">
                                                        <Card className="evergreen-card evergreen-card-interactive evergreen-stats-card">
                                                            <div className="evergreen-stats-content">
                                                                <Text as="h3" variant="headingSm" fontWeight="semibold">
                                                                    {type.label}
                                                                </Text>
                                                                <div className="evergreen-stats-number">
                                                                    {count}
                                                                </div>
                                                                <div className="evergreen-button-wrapper-secondary evergreen-magnetic">
                                                                    <Button
                                                                        size="micro"
                                                                        onClick={() => handleCheckOptions(type.action)}
                                                                        disabled={isDisabled}
                                                                    >
                                                                        Check options
                                                                    </Button>
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
                                <div className="evergreen-step-container">
                                    <Card className="evergreen-card evergreen-card-interactive evergreen-animation-entrance">
                                        <BlockStack gap="400">
                                            <Text as="p" variant="bodyMd">
                                                <Text as="span" fontWeight="semibold">Step 3:</Text> Choose a rule to delete duplicate products or variants in bulk.
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
                                    </Card>
                                </div>
                            </Layout.Section>
                        </Layout>

                        {/* =============================================================================
                                    STEP 4: MANUAL SELECTION
                                    ============================================================================= */}
                        <Layout>
                            <Layout.Section>
                                <Card className="evergreen-card evergreen-card-interactive evergreen-animation-entrance">
                                    <BlockStack gap="400">
                                        <InlineStack align="space-between" blockAlign="center">
                                            <Text as="p" variant="bodyMd">
                                                <Text as="span" fontWeight="semibold">Step 4:</Text> You can also select products or variants to delete manually.
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
                                </Card>
                            </Layout.Section>
                        </Layout>
                    </BlockStack>
                </Page>
            </div>
        </>
    );
} 