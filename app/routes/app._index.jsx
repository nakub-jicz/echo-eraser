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
  ProgressBar,
  Icon,
  Badge,
  Grid,
  CalloutCard,
  EmptyState,
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

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  // Placeholder for actual duplicate detection logic
  return { success: true };
};

export default function Index() {
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const mouseRef = useRef({ x: 0, y: 0 });

  // Mock data - replace with real data from your backend
  const [stats] = useState({
    duplicatesFound: 47,
    productsScanned: 1247,
    completedSteps: 2,
    totalSteps: 4
  });

  const [showSetupGuide] = useState(true);

  // Mouse tracking for advanced effects
  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };

      // Update CSS custom properties for cursor-following effects
      document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
      document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);

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
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Placeholder functions
  const handleStartScan = () => {
    shopify.toast.show("Scan started successfully");
    navigate("/app/check-duplicates");
  };

  const handleViewResults = () => {
    navigate("/app/results");
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
          
          .evergreen-primary-button {
            background: linear-gradient(120deg, #10B981 0%, #06B6D4 100%) !important;
            border: none !important;
            color: #FFFFFF !important;
            font-weight: 600 !important;
            border-radius: 8px !important;
            padding: 12px 24px !important;
            font-size: 1rem !important;
            transition: all 250ms cubic-bezier(0.34, 1.56, 0.64, 1) !important;
            box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.25) !important;
            position: relative !important;
            overflow: hidden !important;
            transform: translateY(0) !important;
          }
          
          .evergreen-primary-button::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
            transition: left 500ms ease;
          }
          
          .evergreen-primary-button:hover::before {
            left: 100%;
          }
          
          .evergreen-primary-button:hover {
            transform: translateY(-2px) !important;
            box-shadow: 0 4px 12px 0 rgba(16, 185, 129, 0.3) !important;
          }
          
          .evergreen-primary-button:active {
            transform: translateY(-1px) !important;
            transition: all 100ms ease !important;
          }
          
          .evergreen-secondary-button {
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
          
          .evergreen-secondary-button:hover {
            transform: translateY(-2px) !important;
            border-color: #059669 !important;
            box-shadow: 0 4px 12px 0 rgba(16, 185, 129, 0.15) !important;
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
          title="Duplicate Products Manager"
          subtitle="Find and manage duplicate products in your store"
          primaryAction={{
            content: "Start New Scan",
            onAction: handleStartScan,
          }}
        >
          <Layout>
            <Layout.Section>
              <BlockStack gap="500">
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
                        <Button
                          onClick={handleStartScan}
                          className="evergreen-primary-button evergreen-ripple"
                          variant="primary"
                        >
                          Continue Setup
                        </Button>
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
                            {stats.duplicatesFound}
                          </div>

                          <div className="evergreen-stats-footer">
                            <Text variant="bodySm" as="p" className="evergreen-text-secondary">
                              Products that may be duplicates
                            </Text>
                            {stats.duplicatesFound > 0 && (
                              <div style={{ marginTop: '12px' }}>
                                <Button
                                  onClick={handleViewResults}
                                  tone="critical"
                                  variant="primary"
                                  size="slim"
                                  className="evergreen-ripple"
                                >
                                  Review Duplicates
                                </Button>
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
                            {stats.productsScanned.toLocaleString()}
                          </div>

                          <div className="evergreen-stats-footer">
                            <Text variant="bodySm" as="p" className="evergreen-text-secondary">
                              Total products analyzed
                            </Text>
                            <div style={{ marginTop: '12px' }}>
                              <Button
                                onClick={handleStartScan}
                                size="slim"
                                className="evergreen-secondary-button evergreen-ripple"
                              >
                                Scan Again
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    </div>
                  </Grid.Cell>
                </Grid>

                {/* Quick Actions */}


                {/* Empty State for No Duplicates */}
                {stats.duplicatesFound === 0 && stats.productsScanned > 0 && (
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
                          <Button
                            onClick={handleStartScan}
                            className="evergreen-primary-button evergreen-ripple evergreen-magnetic"
                            variant="primary"
                          >
                            Run Another Scan
                          </Button>
                          <Button
                            onClick={() => navigate("/app/settings")}
                            className="evergreen-secondary-button evergreen-ripple"
                          >
                            Adjust Settings
                          </Button>
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
