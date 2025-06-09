import { useState, useEffect } from "react";
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

  // Mock data - replace with real data from your backend
  const [stats] = useState({
    duplicatesFound: 47,
    productsScanned: 1247,
    completedSteps: 2,
    totalSteps: 4
  });

  const [showSetupGuide] = useState(true);

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
          /* Evergreen Interface Kit Styles */
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
          
          .evergreen-page {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
            background-color: #F9FAFB;
            min-height: 100vh;
          }
          
          .evergreen-card {
            background: #FFFFFF;
            border: 1px solid #E5E7EB;
            border-radius: 12px;
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
            transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
          }
          
          .evergreen-card:hover {
            box-shadow: 0px 10px 20px -5px rgba(17, 24, 39, 0.1), 0 4px 6px -4px rgba(17, 24, 39, 0.1);
            transform: translateY(-1px);
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
          
          .evergreen-card > * {
            position: relative;
            z-index: 2;
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
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important;
            position: relative !important;
            overflow: hidden !important;
          }
          
          .evergreen-primary-button:hover {
            transform: translateY(-2px) !important;
            box-shadow: 0px 10px 20px -5px rgba(17, 24, 39, 0.1), 0 4px 6px -4px rgba(17, 24, 39, 0.1) !important;
          }
          
          .evergreen-primary-button:active {
            transform: translateY(0) !important;
          }
          
          .evergreen-secondary-button {
            background: #FFFFFF !important;
            border: 1px solid #10B981 !important;
            color: #047857 !important;
            font-weight: 600 !important;
            border-radius: 8px !important;
            transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1) !important;
          }
          
          .evergreen-secondary-button:hover {
            background: #ECFDF5 !important;
            transform: translateY(-1px) !important;
          }
          
          .evergreen-callout-card {
            background: linear-gradient(135deg, #FFFFFF 0%, #ECFDF5 100%);
            border: 1px solid #10B981;
            border-radius: 12px;
            padding: 24px;
            position: relative;
            overflow: hidden;
          }
          
          .evergreen-callout-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 4px;
            height: 100%;
            background: linear-gradient(120deg, #10B981 0%, #06B6D4 100%);
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
          }
          
          .evergreen-progress-bar {
            background: #E5E7EB;
            border-radius: 9999px;
            height: 8px;
            overflow: hidden;
            margin: 16px 0;
          }
          
          .evergreen-progress-fill {
            background: linear-gradient(120deg, #10B981 0%, #06B6D4 100%);
            height: 100%;
            border-radius: 9999px;
            transition: width 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
            transform-origin: left;
          }
          
          .evergreen-badge-success {
            background: #ECFDF5 !important;
            color: #047857 !important;
            border: 1px solid #10B981 !important;
            font-weight: 600 !important;
          }
          
          .evergreen-badge-info {
            background: #ECFDF5 !important;
            color: #059669 !important;
            border: 1px solid #10B981 !important;
            font-weight: 600 !important;
          }
          
          .evergreen-step-item {
            padding: 12px 16px;
            border-radius: 8px;
            transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
          }
          
          .evergreen-step-item.active {
            background: #ECFDF5;
            border: 1px solid #10B981;
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
          }
          
          .evergreen-icon-success svg {
            color: #059669;
          }
          
          .evergreen-icon-info svg {
            color: #10B981;
          }
          
          .evergreen-icon-warning svg {
            color: #F59E0B;
          }
          
          .evergreen-icon-subdued svg {
            color: #9CA3AF;
          }
          
          .evergreen-text-primary {
            color: #1F2937;
          }
          
          .evergreen-text-secondary {
            color: #4B5563;
          }
          
          .evergreen-text-subdued {
            color: #9CA3AF;
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
                          className="evergreen-primary-button"
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
                    <Card className="evergreen-card evergreen-stats-card evergreen-animation-entrance">
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
                          >
                            Review Duplicates
                          </Button>
                        )}
                      </BlockStack>
                    </Card>
                  </Grid.Cell>

                  <Grid.Cell>
                    <Card className="evergreen-card evergreen-stats-card evergreen-animation-entrance">
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
                          className="evergreen-secondary-button"
                        >
                          Scan Again
                        </Button>
                      </BlockStack>
                    </Card>
                  </Grid.Cell>
                </Grid>

                {/* Quick Actions */}
                <Card className="evergreen-card evergreen-animation-entrance">
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3" className="evergreen-text-primary">
                      Quick Actions
                    </Text>
                    <InlineStack gap="300">
                      <Button
                        onClick={handleStartScan}
                        className="evergreen-primary-button"
                        variant="primary"
                      >
                        Start New Scan
                      </Button>
                      <Button
                        onClick={handleViewResults}
                        disabled={stats.duplicatesFound === 0}
                        className="evergreen-secondary-button"
                      >
                        View Results
                      </Button>
                      <Button
                        onClick={() => navigate("/app/settings")}
                        variant="plain"
                      >
                        Configure Settings
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>

                {/* Empty State for No Duplicates */}
                {stats.duplicatesFound === 0 && stats.productsScanned > 0 && (
                  <Card className="evergreen-card evergreen-animation-entrance">
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
                          className="evergreen-primary-button"
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
