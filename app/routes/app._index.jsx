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

      // Parallax effect on cards
      const cards = document.querySelectorAll('.evergreen-card-interactive');
      cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        const cardCenterX = rect.left + rect.width / 2;
        const cardCenterY = rect.top + rect.height / 2;

        const deltaX = (e.clientX - cardCenterX) / rect.width;
        const deltaY = (e.clientY - cardCenterY) / rect.height;

        const maxTilt = 8;
        const tiltX = deltaY * maxTilt;
        const tiltY = deltaX * -maxTilt;

        if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
          card.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateZ(20px)`;
        } else {
          card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
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
            transform: translateY(-4px) scale(1.05) !important;
            box-shadow: 0 8px 25px 0 rgba(16, 185, 129, 0.4) !important;
          }
          
          .evergreen-primary-button:active {
            transform: translateY(-2px) scale(1.02) !important;
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
          
          .evergreen-stats-card {
            text-align: center;
            position: relative;
          }
          
          .evergreen-stats-number {
            font-size: 2.5rem;
            font-weight: 700;
            background: linear-gradient(120deg, #10B981 0%, #06B6D4 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            line-height: 1.2;
            margin: 16px 0 8px 0;
            transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
            position: relative;
          }
          
          .evergreen-stats-card:hover .evergreen-stats-number {
            transform: scale(1.1);
            filter: drop-shadow(0 0 8px rgba(16, 185, 129, 0.5));
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
            transform: scale(1.05) !important;
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
            transform: scale(1.05) !important;
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
            transform: scale(1.2) rotate(5deg);
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
                    <Card className="evergreen-card evergreen-card-interactive evergreen-stats-card evergreen-animation-entrance">
                      <BlockStack gap="200">
                        <InlineStack blockAlign="center" gap="200" align="center">
                          <div className="evergreen-icon-wrapper evergreen-icon-warning">
                            <Icon source={ProductIcon} tone="warning" />
                          </div>
                          <Text variant="headingMd" as="h3" className="evergreen-text-primary">
                            Duplicates Found
                          </Text>
                        </InlineStack>
                        <div className="evergreen-stats-number">
                          {stats.duplicatesFound}
                        </div>
                        <Text variant="bodyMd" as="p" className="evergreen-text-secondary">
                          Products that may be duplicates
                        </Text>
                        {stats.duplicatesFound > 0 && (
                          <Button
                            onClick={handleViewResults}
                            tone="critical"
                            variant="primary"
                            className="evergreen-ripple"
                          >
                            Review Duplicates
                          </Button>
                        )}
                      </BlockStack>
                    </Card>
                  </Grid.Cell>

                  <Grid.Cell>
                    <Card className="evergreen-card evergreen-card-interactive evergreen-stats-card evergreen-animation-entrance">
                      <BlockStack gap="200">
                        <InlineStack blockAlign="center" gap="200" align="center">
                          <div className="evergreen-icon-wrapper evergreen-icon-success">
                            <Icon source={ChartVerticalIcon} tone="success" />
                          </div>
                          <Text variant="headingMd" as="h3" className="evergreen-text-primary">
                            Products Scanned
                          </Text>
                        </InlineStack>
                        <div className="evergreen-stats-number">
                          {stats.productsScanned.toLocaleString()}
                        </div>
                        <Text variant="bodyMd" as="p" className="evergreen-text-secondary">
                          Total products analyzed
                        </Text>
                        <Button
                          onClick={handleStartScan}
                          className="evergreen-secondary-button evergreen-ripple"
                        >
                          Scan Again
                        </Button>
                      </BlockStack>
                    </Card>
                  </Grid.Cell>
                </Grid>

                {/* Quick Actions */}
                <Card className="evergreen-card evergreen-card-interactive evergreen-animation-entrance">
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3" className="evergreen-text-primary">
                      Quick Actions
                    </Text>
                    <InlineStack gap="300">
                      <Button
                        onClick={handleStartScan}
                        className="evergreen-primary-button evergreen-ripple evergreen-magnetic"
                        variant="primary"
                      >
                        Start New Scan
                      </Button>
                      <Button
                        onClick={handleViewResults}
                        disabled={stats.duplicatesFound === 0}
                        className="evergreen-secondary-button evergreen-ripple"
                      >
                        View Results
                      </Button>
                      <Button
                        onClick={() => navigate("/app/settings")}
                        variant="plain"
                        className="evergreen-magnetic"
                      >
                        Configure Settings
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>

                {/* Empty State for No Duplicates */}
                {stats.duplicatesFound === 0 && stats.productsScanned > 0 && (
                  <Card className="evergreen-card evergreen-card-interactive evergreen-animation-entrance">
                    <EmptyState
                      heading="No duplicates found"
                      image="https://cdn.shopify.com/s/files/1/0583/6465/7734/files/emptystate-files.png"
                    >
                      <Text variant="bodyMd" as="p" className="evergreen-text-secondary">
                        Great news! Your store appears to be free of duplicate products.
                      </Text>
                      <div style={{ marginTop: '16px' }}>
                        <Button
                          onClick={handleStartScan}
                          className="evergreen-primary-button evergreen-ripple"
                        >
                          Run Another Scan
                        </Button>
                      </div>
                    </EmptyState>
                  </Card>
                )}
              </BlockStack>
            </Layout.Section>
          </Layout>
        </Page>
      </div>
    </>
  );
}
