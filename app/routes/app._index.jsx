import { useState, useEffect, useRef } from "react";
import {
  useLoaderData,
  useNavigate,
  useActionData,
  useNavigation,
  useSubmit
} from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  ProgressBar,
  Icon,
  Badge,
  Grid,
  CalloutCard,
  EmptyState,
  Banner,
  Spinner,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  SearchIcon,
  ClockIcon,
  ProductIcon,
  ChartVerticalIcon,
} from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  fetchAllProducts,
  findAllDuplicates,
  updateDuplicateStats,
  getDuplicateStats,
  saveDuplicateGroups
} from "../lib/duplicates.server.js";
// Database import moved to functions that need it

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const db = (await import("../db.server.js")).default;

  // Get current duplicate statistics
  const stats = await getDuplicateStats(session.shop);

  // Get current scan session if any
  const currentScan = await db.scanSession.findFirst({
    where: {
      shop: session.shop,
      status: 'running'
    },
    orderBy: {
      startedAt: 'desc'
    }
  });

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
    currentScan,
    shopDomain: session.shop
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const db = (await import("../db.server.js")).default;
  const formData = await request.formData();
  const action = formData.get("action");

  try {
    if (action === "start_scan") {
      // Create a new scan session
      const scanSession = await db.scanSession.create({
        data: {
          shop: session.shop,
          status: 'running',
          startedAt: new Date()
        }
      });

      // Start the scanning process (this would be better done in background)
      console.log("Starting product scan...");

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

      console.log(`Fetched ${products.length} products, analyzing duplicates...`);

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

      console.log(`Scan completed! Found ${totalDuplicates} duplicate groups.`);

      return {
        success: true,
        message: `Scan completed! Found ${totalDuplicates} duplicate groups across ${products.length} products.`,
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
    console.error("Scan error:", error);

    // Update scan session with error if it exists
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
          errorMessage: error.message,
          completedAt: new Date()
        }
      });
    }

    return {
      success: false,
      error: `Scan failed: ${error.message}`
    };
  }
};

// Meta export for SEO
export const meta = () => {
  return [
    { title: "DC Echo Eraser - Dashboard" },
    { name: "description", content: "Intelligent duplicate detection for your Shopify store" },
  ];
};

// Error boundary for this route
export function ErrorBoundary({ error }) {
  console.error(error);
  return (
    <div style={{ padding: '20px' }}>
      <h1>Something went wrong!</h1>
      <p>Error: {error.message}</p>
      <a href="/app">Back to Home</a>
    </div>
  );
}

export default function Index() {
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const submit = useSubmit();
  const mouseRef = useRef({ x: 0, y: 0 });

  // Get real data from loader
  const { stats, currentScan, shopDomain } = useLoaderData();
  const actionData = useActionData();

  // Calculate derived stats
  const totalDuplicatesFound = stats.byTitle + stats.bySku + stats.byBarcode + stats.byTitleSku + stats.byTitleBarcode + stats.bySkuBarcode;
  const isScanning = currentScan?.status === 'running' || navigation.state === 'submitting';
  const hasBeenScanned = stats.lastScanAt !== null;

  const [showSetupGuide] = useState(!hasBeenScanned);

  // Banner dismissal state
  const [dismissedBanners, setDismissedBanners] = useState(new Set());

  // Show toast messages for action results
  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show(actionData.message);
    } else if (actionData?.error) {
      shopify.toast.show(actionData.error, { isError: true });
    }
  }, [actionData, shopify]);

  // Mouse tracking for advanced effects
  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };

      // Update CSS custom properties for cursor-following effects
      document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
      document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);

      // Magnetic buttons effect (updated for wrappers and header)
      const magneticButtons = document.querySelectorAll('.evergreen-magnetic, .evergreen-button-wrapper.evergreen-magnetic, .evergreen-button-wrapper-secondary.evergreen-magnetic, .Polaris-Page-Header .Polaris-Button--primary');
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
      const cards = document.querySelectorAll('.evergreen-card-interactive');
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
            const glowElement = card.querySelector('::before');
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
              if (headerButton) {
                console.log(`Found header button with selector: ${selector}`);
                break;
              }
            } catch (e) {
              console.warn(`Selector failed: ${selector}`, e);
            }
          }

          // If not found by selectors, try finding by text content
          if (!headerButton) {
            try {
              const allButtons = document.querySelectorAll('button');
              headerButton = Array.from(allButtons).find(btn => {
                const text = btn.textContent?.toLowerCase() || '';
                const label = btn.getAttribute('aria-label')?.toLowerCase() || '';
                return text.includes('start') || label.includes('start');
              });
              if (headerButton) {
                console.log('Found header button by text content');
              }
            } catch (e) {
              console.warn('Text content search failed', e);
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
          console.warn('Header button styling failed', e);
        }
      }, 100);
    };

    // Run immediately and setup observer for dynamic content
    styleHeaderButton();

    // Use MutationObserver to catch dynamically loaded content
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

  // Banner dismissal function
  const handleDismissBanner = (bannerId) => {
    setDismissedBanners(prev => new Set([...prev, bannerId]));
  };

  // Real functions
  const handleStartScan = () => {
    if (isScanning) {
      shopify.toast.show("Scan is already in progress", { isError: true });
      return;
    }

    // Use Remix's useSubmit hook properly
    const formData = new FormData();
    formData.append('action', 'start_scan');

    submit(formData, { method: 'post' });
  };

  const handleViewResults = () => {
    navigate("/app/check-duplicates");
  };

  const progressPercentage = (stats.completedSteps / stats.totalSteps) * 100;

  const setupSteps = [
    { id: 1, text: "Connect your store", status: "completed" },
    { id: 2, text: "Configure scan settings", status: "completed" },
    { id: 3, text: "Run your first scan", status: "active" },
    { id: 4, text: "Review and manage duplicates", status: "pending" },
  ];

  const getStepIcon = (status) => {
    switch (status) {
      case "completed":
        return CheckCircleIcon;
      case "active":
        return SearchIcon;
      default:
        return ClockIcon;
    }
  };

  const getStepIconTone = (status) => {
    switch (status) {
      case "completed":
        return "success";
      case "active":
        return "info";
      default:
        return "subdued";
    }
  };

  return (
    <>
      <style>
        {`
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
      }
      
      .evergreen-button-wrapper .Polaris-Button {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        border-radius: 8px !important;
        color: #FFFFFF !important;
        font-weight: 600 !important;
        margin: 0 !important;
        padding: 12px 24px !important;
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
        border-radius: 8px !important;
        margin: 0 !important;
        padding: 12px 24px !important;
        position: relative;
        z-index: 2;
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
      
      /* GLOW EFFECT FOR WRAPPERS - using pseudo element workaround */
      .evergreen-button-wrapper.evergreen-button-glow {
        position: relative;
      }
      
      .evergreen-button-wrapper.evergreen-button-glow:before {
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
      
      .evergreen-button-wrapper.evergreen-button-glow:hover:before {
        opacity: 0.7;
      }
      
      /* Shimmer for glow buttons needs different approach */
      .evergreen-button-wrapper.evergreen-button-glow .glow-shimmer {
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
        transition: left 500ms ease;
        z-index: 1;
      }
      
      .evergreen-button-wrapper.evergreen-button-glow:hover .glow-shimmer {
        left: 100%;
      }
      
      /* PULSE EFFECT FOR WRAPPERS */
      .evergreen-button-wrapper.evergreen-pulse {
        animation: buttonPulse 2s infinite;
      }
      
      /* MAGNETIC EFFECT FOR WRAPPERS */
      .evergreen-button-wrapper.evergreen-magnetic {
        transition: transform 150ms ease-out;
      }
      
      /* PAGE HEADER BUTTON STYLES - Multiple selectors to catch all variations */
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
      
      /* RIPPLE EFFECT FOR HEADER BUTTON */
      .Polaris-Page-Header .Polaris-Button--primary::after {
        content: '' !important;
        position: absolute !important;
        top: 50% !important;
        left: 50% !important;
        width: 0 !important;
        height: 0 !important;
        background: rgba(255, 255, 255, 0.3) !important;
        border-radius: 50% !important;
        transform: translate(-50%, -50%) !important;
        transition: width 600ms ease, height 600ms ease !important;
        z-index: 1 !important;
      }
      
      .Polaris-Page-Header .Polaris-Button--primary:active::after {
        width: 200px !important;
        height: 200px !important;
        transition: width 0ms, height 0ms !important;
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
      
      .evergreen-primary-button::before,
      button.evergreen-primary-button::before,
      .Polaris-Button.evergreen-primary-button::before {
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
      
      .evergreen-primary-button:hover::before,
      button.evergreen-primary-button:hover::before,
      .Polaris-Button.evergreen-primary-button:hover::before {
        left: 100% !important;
      }
      
      .evergreen-primary-button::after {
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
        z-index: 2;
      }
      
      .evergreen-primary-button:active::after {
        width: 300px;
        height: 300px;
        transition: width 0ms, height 0ms;
      }
      
      .evergreen-primary-button > * {
        position: relative;
        z-index: 3;
      }
      
      /* Magnetic effect */
      .evergreen-magnetic,
      button.evergreen-magnetic,
      .Polaris-Button.evergreen-magnetic {
        transition: transform 150ms ease-out !important;
      }
      
      /* Pulsing effect for primary buttons */
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
      
      .evergreen-primary-button.evergreen-pulse,
      button.evergreen-primary-button.evergreen-pulse,
      .Polaris-Button.evergreen-primary-button.evergreen-pulse {
        animation: buttonPulse 2s infinite !important;
      }
      
      /* Wave animation */
      @keyframes buttonWave {
        0% {
          transform: translateY(-2px) rotate(0deg);
        }
        25% {
          transform: translateY(-3px) rotate(0.5deg);
        }
        50% {
          transform: translateY(-2px) rotate(0deg);
        }
        75% {
          transform: translateY(-3px) rotate(-0.5deg);
        }
        100% {
          transform: translateY(-2px) rotate(0deg);
        }
      }
      
      /* Glow effect */
      .evergreen-button-glow,
      button.evergreen-button-glow,
      .Polaris-Button.evergreen-button-glow {
        position: relative !important;
      }
      
      .evergreen-button-glow::before,
      button.evergreen-button-glow::before,
      .Polaris-Button.evergreen-button-glow::before {
        content: '' !important;
        position: absolute !important;
        top: -2px !important;
        left: -2px !important;
        right: -2px !important;
        bottom: -2px !important;
        background: linear-gradient(45deg, #10B981, #06B6D4, #10B981, #06B6D4) !important;
        background-size: 400% 400% !important;
        border-radius: 10px !important;
        z-index: -1 !important;
        animation: glowRotate 4s ease-in-out infinite !important;
        opacity: 0 !important;
        transition: opacity 300ms ease !important;
      }
      
      .evergreen-button-glow:hover::before,
      button.evergreen-button-glow:hover::before,
      .Polaris-Button.evergreen-button-glow:hover::before {
        opacity: 0.7 !important;
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
      
      /* Button wrapper approach as backup */
      .evergreen-button-wrapper {
        display: inline-block;
        position: relative;
        transition: transform 150ms ease-out;
      }
      
      .evergreen-button-wrapper.evergreen-magnetic:hover {
        transform: none; /* Will be handled by JS */
      }
      
      .evergreen-button-wrapper .evergreen-button-glow-bg {
        position: absolute;
        top: -2px;
        left: -2px;
        right: -2px;
        bottom: -2px;
        background: linear-gradient(45deg, #10B981, #06B6D4, #10B981, #06B6D4);
        background-size: 400% 400%;
        border-radius: 10px;
        z-index: -1;
        animation: glowRotate 4s ease-in-out infinite;
        opacity: 0;
        transition: opacity 300ms ease;
        pointer-events: none;
      }
      
      .evergreen-button-wrapper:hover .evergreen-button-glow-bg {
        opacity: 0.7;
      }
      
      .evergreen-primary-button:hover,
      button.evergreen-primary-button:hover,
      .Polaris-Button.evergreen-primary-button:hover {
        transform: translateY(-2px) !important;
        box-shadow: 
          0 8px 25px 0 rgba(16, 185, 129, 0.4) !important,
          0 0 20px rgba(16, 185, 129, 0.3) !important;
        filter: brightness(1.1) !important;
        animation: buttonWave 0.6s ease-in-out !important;
      }
      
      .evergreen-primary-button:active,
      button.evergreen-primary-button:active,
      .Polaris-Button.evergreen-primary-button:active {
        transform: translateY(0px) !important;
        transition: all 100ms ease !important;
        box-shadow: 0 2px 8px 0 rgba(16, 185, 129, 0.4) !important;
      }
      
      .evergreen-secondary-button,
      button.evergreen-secondary-button,
      .Polaris-Button.evergreen-secondary-button {
        background: #FFFFFF !important;
        border: 1px solid #10B981 !important;
        color: #047857 !important;
        font-weight: 600 !important;
        border-radius: 8px !important;
        transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1) !important;
        position: relative !important;
        overflow: hidden !important;
      }
      
      .evergreen-secondary-button::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 0;
        height: 100%;
        background: linear-gradient(45deg, #ECFDF5, #D1FAE5);
        transition: width 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
        z-index: 1;
      }
      
      .evergreen-secondary-button:hover::before {
        width: 100%;
      }
      
      .evergreen-secondary-button > * {
        position: relative;
        z-index: 2;
      }
      
      .evergreen-secondary-button:hover,
      button.evergreen-secondary-button:hover,
      .Polaris-Button.evergreen-secondary-button:hover {
        transform: translateY(-2px) !important;
        border-color: #059669 !important;
        box-shadow: 
          0 8px 25px 0 rgba(16, 185, 129, 0.2) !important,
          0 0 15px rgba(16, 185, 129, 0.15) !important;
        color: #047857 !important;
      }
      
      .evergreen-secondary-button:active,
      button.evergreen-secondary-button:active,
      .Polaris-Button.evergreen-secondary-button:active {
        transform: translateY(0px) !important;
        transition: all 100ms ease !important;
        box-shadow: 0 2px 8px 0 rgba(16, 185, 129, 0.2) !important;
      }
      
      .evergreen-secondary-button::after {
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
        z-index: 0;
      }
      
      .evergreen-secondary-button:active::after {
        width: 300px;
        height: 300px;
        transition: width 0ms, height 0ms;
      }
      
      .evergreen-callout-card {
        background: linear-gradient(135deg, #FFFFFF 0%, #ECFDF5 100%);
        border: 1px solid #10B981;
        border-radius: 12px;
        padding: 24px;
        position: relative;
        overflow: hidden;
        transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      
      .evergreen-callout-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 4px;
        height: 100%;
        background: linear-gradient(120deg, #10B981 0%, #06B6D4 100%);
        transition: width 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      
      .evergreen-callout-card:hover::before {
        width: 8px;
      }
      
      .evergreen-callout-card:hover {
        transform: translateX(4px);
        box-shadow: -4px 8px 25px 0 rgba(16, 185, 129, 0.15);
      }
      
      .evergreen-stats-card-wrapper {
        position: relative;
        cursor: pointer;
        transition: all 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
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
      
      .evergreen-stats-card-wrapper .evergreen-stats-header {
        margin-bottom: 16px;
        opacity: 0.8;
        transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      
      .evergreen-stats-card-wrapper:hover .evergreen-stats-header {
        opacity: 1;
        transform: translateY(-1px);
      }
      
      .evergreen-stats-card-wrapper .evergreen-icon-wrapper {
        width: 32px;
        height: 32px;
        transition: all 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(6, 182, 212, 0.1) 100%);
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 8px;
        box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1);
      }
      
      .evergreen-stats-card-wrapper:hover .evergreen-icon-wrapper {
        transform: rotate(5deg) translateY(-1px);
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(6, 182, 212, 0.15) 100%);
        box-shadow: 
          0 4px 16px rgba(16, 185, 129, 0.2),
          0 0 0 2px rgba(16, 185, 129, 0.08);
      }
      
      .evergreen-stats-card-wrapper:hover .evergreen-icon-wrapper svg {
        filter: 
          drop-shadow(0 0 4px rgba(16, 185, 129, 0.3))
          brightness(1.05);
      }
      
      .evergreen-stats-card-wrapper .evergreen-stats-footer {
        margin-top: 16px;
        opacity: 0.7;
        transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      
      .evergreen-stats-card-wrapper:hover .evergreen-stats-footer {
        opacity: 1;
        transform: translateY(1px);
      }
      
      .evergreen-stats-card-wrapper:hover .evergreen-ripple {
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
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
      

      
      .evergreen-progress-bar {
        background: #E5E7EB;
        border-radius: 9999px;
        height: 8px;
        overflow: hidden;
        margin: 16px 0;
        position: relative;
      }
      
      .evergreen-progress-fill {
        background: linear-gradient(120deg, #10B981 0%, #06B6D4 100%);
        height: 100%;
        border-radius: 9999px;
        transition: width 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
        transform-origin: left;
        position: relative;
        overflow: hidden;
      }
      
      .evergreen-progress-fill::after {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
        animation: progressShimmer 2s infinite;
      }
      
      @keyframes progressShimmer {
        0% { left: -100%; }
        100% { left: 100%; }
      }
      
      .evergreen-badge-success {
        background: #ECFDF5 !important;
        color: #047857 !important;
        border: 1px solid #10B981 !important;
        font-weight: 600 !important;
        transition: all 200ms cubic-bezier(0.34, 1.56, 0.64, 1) !important;
      }
      
      .evergreen-badge-success:hover {
        box-shadow: 0 2px 8px 0 rgba(16, 185, 129, 0.25) !important;
      }
      
      .evergreen-badge-info {
        background: #ECFDF5 !important;
        color: #059669 !important;
        border: 1px solid #10B981 !important;
        font-weight: 600 !important;
        transition: all 200ms cubic-bezier(0.34, 1.56, 0.64, 1) !important;
      }
      
      .evergreen-badge-info:hover {
        box-shadow: 0 2px 8px 0 rgba(16, 185, 129, 0.25) !important;
      }
      
      .evergreen-step-item {
        padding: 12px 16px;
        border-radius: 8px;
        transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        cursor: pointer;
      }
      
      .evergreen-step-item:hover {
        transform: translateX(4px);
        background: rgba(16, 185, 129, 0.05) !important;
      }
      
      .evergreen-step-item.active {
        background: #ECFDF5;
        border: 1px solid #10B981;
        box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
      }
      
      .evergreen-step-item.active:hover {
        box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
      }
      
      .evergreen-step-item.completed {
        opacity: 0.8;
      }
      
      .evergreen-step-item.pending {
        opacity: 0.6;
      }
      
      .evergreen-icon-wrapper {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        transition: all 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      
      .evergreen-icon-wrapper:hover {
        transform: rotate(5deg);
      }
      
      .evergreen-icon-success svg {
        color: #059669;
        filter: drop-shadow(0 0 4px rgba(5, 150, 105, 0.3));
      }
      
      .evergreen-icon-info svg {
        color: #10B981;
        filter: drop-shadow(0 0 4px rgba(16, 185, 129, 0.3));
      }
      
      .evergreen-icon-warning svg {
        color: #F59E0B;
        filter: drop-shadow(0 0 4px rgba(245, 158, 11, 0.3));
      }
      
      .evergreen-icon-subdued svg {
        color: #9CA3AF;
      }
      
      .evergreen-text-primary {
        color: #1F2937;
        transition: color 200ms ease;
      }
      
      .evergreen-text-secondary {
        color: #4B5563;
        transition: color 200ms ease;
      }
      
      .evergreen-text-subdued {
        color: #9CA3AF;
        transition: color 200ms ease;
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
      
      /* Magnetic effect for buttons */
      .evergreen-magnetic {
        transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      
      /* Focus states */
      .evergreen-card:focus-within {
        outline: 2px solid rgba(16, 185, 129, 0.5);
        outline-offset: 2px;
      }
      
      /* Loading pulse */
      .evergreen-pulse {
        animation: pulse 2s infinite;
      }
      
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
      

      
      /* Enhanced Empty State Styles */
      .evergreen-empty-state-wrapper {
        perspective: 1000px;
      }
      
      .evergreen-empty-state-card {
        background: linear-gradient(135deg, #FFFFFF 0%, #ECFDF5 50%, #FFFFFF 100%);
        border: 2px solid transparent;
        background-clip: padding-box;
        position: relative;
        min-height: 300px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .evergreen-empty-state-card::before {
        content: '';
        position: absolute;
        top: -2px;
        left: -2px;
        right: -2px;
        bottom: -2px;
        background: linear-gradient(45deg, #10B981, #06B6D4, #10B981);
        border-radius: 14px;
        z-index: -1;
        animation: borderGlow 3s ease-in-out infinite;
        opacity: 0;
        transition: opacity 300ms ease;
      }
      
      .evergreen-empty-state-card:hover::before {
        opacity: 0.6;
      }
      
      @keyframes borderGlow {
        0%, 100% { 
          background: linear-gradient(45deg, #10B981, #06B6D4, #10B981);
          transform: rotate(0deg);
        }
        50% { 
          background: linear-gradient(45deg, #06B6D4, #10B981, #06B6D4);
          transform: rotate(180deg);
        }
      }
      
      .evergreen-empty-state-content {
        text-align: center;
        padding: 48px 32px;
        position: relative;
        z-index: 1;
      }
      
      .evergreen-empty-state-icon {
        margin-bottom: 24px;
        position: relative;
      }
      
      .evergreen-celebration-icon {
        width: 80px !important;
        height: 80px !important;
        background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
        border-radius: 50%;
        margin: 0 auto;
        display: flex !important;
        align-items: center;
        justify-content: center;
        position: relative;
        transition: all 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
        box-shadow: 0 8px 32px rgba(16, 185, 129, 0.2);
      }
      
      .evergreen-celebration-icon::before {
        content: '';
        position: absolute;
        top: -4px;
        left: -4px;
        right: -4px;
        bottom: -4px;
        background: linear-gradient(45deg, #10B981, transparent, #06B6D4, transparent, #10B981);
        border-radius: 50%;
        z-index: -1;
        animation: iconGlow 2s ease-in-out infinite;
        opacity: 0;
      }
      
      .evergreen-empty-state-card:hover .evergreen-celebration-icon::before {
        opacity: 0.8;
      }
      
      .evergreen-empty-state-card:hover .evergreen-celebration-icon {
        transform: rotate(10deg);
        box-shadow: 0 8px 24px rgba(16, 185, 129, 0.3);
      }
      
      @keyframes iconGlow {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 0.8; }
      }
      
      .evergreen-celebration-icon svg {
        width: 40px !important;
        height: 40px !important;
        filter: drop-shadow(0 0 8px rgba(5, 150, 105, 0.5));
      }
      
      .evergreen-empty-state-heading {
        margin: 24px 0 16px 0;
        background: linear-gradient(120deg, #1F2937 0%, #10B981 50%, #1F2937 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        font-size: 1.75rem !important;
        font-weight: 700 !important;
        transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      
      .evergreen-empty-state-card:hover .evergreen-empty-state-heading {
        filter: drop-shadow(0 0 8px rgba(16, 185, 129, 0.25));
      }
      
      .evergreen-empty-state-description {
        margin: 16px 0 32px 0;
        font-size: 1.125rem !important;
        line-height: 1.6;
        max-width: 500px;
        margin-left: auto;
        margin-right: auto;
      }
      
      .evergreen-empty-state-actions {
        display: flex;
        gap: 16px;
        justify-content: center;
        flex-wrap: wrap;
        margin-top: 32px;
      }
      
      /* Floating particles effect */
      .evergreen-empty-state-card::after {
        content: '';
        position: absolute;
        top: 20%;
        left: 10%;
        width: 4px;
        height: 4px;
        background: #10B981;
        border-radius: 50%;
        box-shadow: 
          40px 20px 0 #06B6D4,
          80px 40px 0 #10B981,
          120px 10px 0 #06B6D4,
          160px 30px 0 #10B981,
          200px 50px 0 #06B6D4,
          240px 20px 0 #10B981,
          280px 40px 0 #06B6D4,
          320px 15px 0 #10B981;
        animation: floatingParticles 6s ease-in-out infinite;
        opacity: 0;
        pointer-events: none;
      }
      
      .evergreen-empty-state-card:hover::after {
        opacity: 0.6;
      }
      
      @keyframes floatingParticles {
        0%, 100% { 
          transform: translateY(0px) rotate(0deg);
          opacity: 0.3;
        }
        25% { 
          transform: translateY(-10px) rotate(90deg);
          opacity: 0.6;
        }
        50% { 
          transform: translateY(-5px) rotate(180deg);
          opacity: 0.8;
        }
        75% { 
          transform: translateY(-15px) rotate(270deg);
          opacity: 0.4;
        }
      }
    `}
      </style>

      <div className="evergreen-page">
        <Page
          title="DC Echo Eraser"
          subtitle="Intelligent duplicate detection for your Shopify store"
          primaryAction={{
            content: isScanning ? "Scanning..." : (showSetupGuide ? "Start First Scan" : "Start New Scan"),
            onAction: handleStartScan,
            loading: isScanning,
            disabled: isScanning,
          }}
        >
          <Layout>
            <Layout.Section>
              <BlockStack gap="500">
                {/* Scanning Status Banner */}
                {isScanning && (
                  <Banner
                    title="Scanning in progress..."
                    tone="info"
                    action={{ content: "View Details", url: "/app/check-duplicates" }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Spinner size="small" />
                      <span>Analyzing your products for duplicates. This may take a few minutes.</span>
                    </div>
                  </Banner>
                )}

                {/* Success Banner */}
                {actionData?.success && !isScanning && !dismissedBanners.has('success') && (
                  <Banner
                    title="Scan completed successfully!"
                    tone="success"
                    onDismiss={() => handleDismissBanner('success')}
                  >
                    {actionData.message}
                  </Banner>
                )}
                {/* Setup Guide */}
                {showSetupGuide && (
                  <div className="evergreen-callout-card evergreen-animation-entrance">
                    <BlockStack gap="300">
                      <Text variant="headingMd" as="h2" className="evergreen-text-primary">
                        Setup Guide
                      </Text>

                      <Text variant="bodyMd" as="p" className="evergreen-text-secondary">
                        Complete these steps to start finding duplicate products
                      </Text>

                      <div className="evergreen-progress-bar">
                        <div
                          className="evergreen-progress-fill"
                          style={{ width: `${progressPercentage}%` }}
                        />
                      </div>

                      <BlockStack gap="200">
                        {setupSteps.map((step) => (
                          <div
                            key={step.id}
                            className={`evergreen-step-item ${step.status}`}
                          >
                            <InlineStack blockAlign="center" gap="300">
                              <div className={`evergreen-icon-wrapper evergreen-icon-${getStepIconTone(step.status)}`}>
                                <Icon
                                  source={getStepIcon(step.status)}
                                  tone={getStepIconTone(step.status)}
                                />
                              </div>
                              <Text
                                variant="bodyMd"
                                as="span"
                                className={step.status === "pending" ? "evergreen-text-subdued" : "evergreen-text-primary"}
                                fontWeight={step.status === "active" ? "semibold" : "regular"}
                              >
                                {step.text}
                              </Text>
                              {step.status === "active" && (
                                <Badge className="evergreen-badge-info">Current</Badge>
                              )}
                              {step.status === "completed" && (
                                <Badge className="evergreen-badge-success">Done</Badge>
                              )}
                            </InlineStack>
                          </div>
                        ))}
                      </BlockStack>

                      <InlineStack gap="300">
                        <div className="evergreen-button-wrapper evergreen-magnetic evergreen-button-glow evergreen-pulse">
                          <Button
                            onClick={handleStartScan}
                            variant="primary"
                          >
                            Continue Setup
                          </Button>
                        </div>
                      </InlineStack>
                    </BlockStack>
                  </div>
                )}

                {/* Stats Overview */}
                <Grid columns={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2 }}>
                  <Grid.Cell>
                    <div className="evergreen-stats-card-wrapper">
                      <Card className="evergreen-card evergreen-card-interactive evergreen-animation-entrance">
                        <div className="evergreen-stats-content">
                          <div className="evergreen-stats-header">
                            <div className="evergreen-icon-wrapper evergreen-icon-warning">
                              <Icon source={ProductIcon} tone="warning" />
                            </div>
                            <Text variant="bodyMd" as="p" className="evergreen-text-primary" fontWeight="semibold">
                              Duplicates Found
                            </Text>
                          </div>

                          <div className="evergreen-stats-number">
                            {totalDuplicatesFound}
                          </div>

                          <div className="evergreen-stats-footer">
                            <Text variant="bodySm" as="p" className="evergreen-text-secondary">
                              Products that may be duplicates
                            </Text>
                            {totalDuplicatesFound > 0 && (
                              <div style={{ marginTop: '12px' }}>
                                <div className="evergreen-button-wrapper evergreen-magnetic">
                                  <Button
                                    onClick={handleViewResults}
                                    tone="critical"
                                    variant="primary"
                                    size="slim"
                                  >
                                    Review Duplicates
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    </div>
                  </Grid.Cell>

                  <Grid.Cell>
                    <div className="evergreen-stats-card-wrapper">
                      <Card className="evergreen-card evergreen-card-interactive evergreen-animation-entrance">
                        <div className="evergreen-stats-content">
                          <div className="evergreen-stats-header">
                            <div className="evergreen-icon-wrapper evergreen-icon-success">
                              <Icon source={ChartVerticalIcon} tone="success" />
                            </div>
                            <Text variant="bodyMd" as="p" className="evergreen-text-primary" fontWeight="semibold">
                              Products Scanned
                            </Text>
                          </div>

                          <div className="evergreen-stats-number">
                            {stats.totalProductsScanned?.toLocaleString() || '0'}
                          </div>

                          <div className="evergreen-stats-footer">
                            <Text variant="bodySm" as="p" className="evergreen-text-secondary">
                              Total products analyzed
                            </Text>
                            <div style={{ marginTop: '12px' }}>
                              <div className="evergreen-button-wrapper-secondary evergreen-magnetic">
                                <Button
                                  onClick={handleStartScan}
                                  size="slim"
                                >
                                  Scan Again
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    </div>
                  </Grid.Cell>
                </Grid>

                {/* Quick Actions */}


                {/* Empty State for No Duplicates */}
                {totalDuplicatesFound === 0 && hasBeenScanned && (
                  <div className="evergreen-empty-state-wrapper evergreen-animation-entrance">
                    <Card className="evergreen-card evergreen-card-interactive evergreen-empty-state-card">
                      <div className="evergreen-empty-state-content">
                        <div className="evergreen-empty-state-icon">
                          <div className="evergreen-icon-wrapper evergreen-icon-success evergreen-celebration-icon">
                            <Icon source={CheckCircleIcon} tone="success" />
                          </div>
                        </div>
                        <Text variant="headingLg" as="h3" className="evergreen-text-primary evergreen-empty-state-heading">
                          No duplicates found! 🎉
                        </Text>
                        <Text variant="bodyMd" as="p" className="evergreen-text-secondary evergreen-empty-state-description">
                          Great news! Your store appears to be free of duplicate products. Your catalog is clean and organized.
                        </Text>
                        <div className="evergreen-empty-state-actions">
                          <div className="evergreen-button-wrapper evergreen-magnetic evergreen-button-glow">
                            <Button
                              onClick={handleStartScan}
                              variant="primary"
                            >
                              Run Another Scan
                            </Button>
                          </div>
                          <div className="evergreen-button-wrapper-secondary evergreen-magnetic">
                            <Button
                              onClick={() => navigate("/app/settings")}
                            >
                              Adjust Settings
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </div>
                )}
              </BlockStack>
            </Layout.Section>
          </Layout>
        </Page>
      </div>
    </>
  );
}
