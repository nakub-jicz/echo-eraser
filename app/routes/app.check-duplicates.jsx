import { useState } from "react";
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
    DataTable,
    Checkbox,
    Thumbnail,
    Badge,
} from "@shopify/polaris";
import {
    RefreshIcon,
} from "@shopify/polaris-icons";
import { useAppBridge, NavMenu } from "@shopify/app-bridge-react";
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

export default function CheckDuplicates() {
    const shopify = useAppBridge();
    const navigate = useNavigate();

    // Mock data for duplicates
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

    const ruleOptions = [
        { label: "Keep the first added", value: "keep_first" },
        { label: "Keep the latest added", value: "keep_latest" },
    ];

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

    return (
        <Page
            backAction={{ content: 'Dashboard', onAction: handleBack }}
            title="Check duplicates"
            subtitle="Delete duplicate products or variants by title, SKU, barcode, or a combination of these"
        >

            <BlockStack gap="500">
                {/* Step 1 */}
                <Layout>
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="400">
                                <Text as="p" variant="bodyMd">
                                    <Text as="span" fontWeight="semibold">Step 1:</Text> Sync products for calculation of duplicate products and variants.
                                </Text>

                                <Button
                                    onClick={handleSyncProducts}
                                    icon={RefreshIcon}
                                >
                                    Sync products
                                </Button>
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                </Layout>

                {/* Step 2 */}
                <Layout>
                    <Layout.Section>
                        <Card>
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
                                    {/* Duplicates by title */}
                                    <Card background="bg-surface-secondary">
                                        <div style={{ padding: "20px", textAlign: "center" }}>
                                            <BlockStack gap="300" align="center">
                                                <Text as="h3" variant="headingSm" fontWeight="semibold">
                                                    Duplicates by title
                                                </Text>
                                                <Text as="p" variant="heading2xl" alignment="center">
                                                    {duplicateStats.byTitle}
                                                </Text>
                                                <Button
                                                    size="slim"
                                                    onClick={() => handleCheckOptions('title')}
                                                    disabled={duplicateStats.byTitle === 0}
                                                >
                                                    Check options
                                                </Button>
                                            </BlockStack>
                                        </div>
                                    </Card>

                                    {/* Duplicates by SKU */}
                                    <Card background="bg-surface-secondary">
                                        <div style={{ padding: "20px", textAlign: "center" }}>
                                            <BlockStack gap="300" align="center">
                                                <Text as="h3" variant="headingSm" fontWeight="semibold">
                                                    Duplicates by SKU
                                                </Text>
                                                <Text as="p" variant="heading2xl" alignment="center">
                                                    {duplicateStats.bySku}
                                                </Text>
                                                <Button
                                                    size="slim"
                                                    onClick={() => handleCheckOptions('SKU')}
                                                    disabled={duplicateStats.bySku === 0}
                                                >
                                                    Check options
                                                </Button>
                                            </BlockStack>
                                        </div>
                                    </Card>

                                    {/* Duplicates by barcode */}
                                    <Card background="bg-surface-secondary">
                                        <div style={{ padding: "20px", textAlign: "center" }}>
                                            <BlockStack gap="300" align="center">
                                                <Text as="h3" variant="headingSm" fontWeight="semibold">
                                                    Duplicates by barcode
                                                </Text>
                                                <Text as="p" variant="heading2xl" alignment="center">
                                                    {duplicateStats.byBarcode}
                                                </Text>
                                                <Button
                                                    size="slim"
                                                    onClick={() => handleCheckOptions('barcode')}
                                                    disabled={duplicateStats.byBarcode === 0}
                                                >
                                                    Check options
                                                </Button>
                                            </BlockStack>
                                        </div>
                                    </Card>

                                    {/* Duplicates by title + barcode */}
                                    <Card background="bg-surface-secondary">
                                        <div style={{ padding: "20px", textAlign: "center" }}>
                                            <BlockStack gap="300" align="center">
                                                <Text as="h3" variant="headingSm" fontWeight="semibold">
                                                    Duplicates by title + barcode
                                                </Text>
                                                <Text as="p" variant="heading2xl" alignment="center">
                                                    {duplicateStats.byTitleBarcode}
                                                </Text>
                                                <Button
                                                    size="slim"
                                                    onClick={() => handleCheckOptions('title + barcode')}
                                                    disabled={duplicateStats.byTitleBarcode === 0}
                                                >
                                                    Check options
                                                </Button>
                                            </BlockStack>
                                        </div>
                                    </Card>

                                    {/* Duplicates by title + SKU */}
                                    <Card background="bg-surface-secondary">
                                        <div style={{ padding: "20px", textAlign: "center" }}>
                                            <BlockStack gap="300" align="center">
                                                <Text as="h3" variant="headingSm" fontWeight="semibold">
                                                    Duplicates by title + SKU
                                                </Text>
                                                <Text as="p" variant="heading2xl" alignment="center">
                                                    {duplicateStats.byTitleSku}
                                                </Text>
                                                <Button
                                                    size="slim"
                                                    onClick={() => handleCheckOptions('title + SKU')}
                                                    disabled={duplicateStats.byTitleSku === 0}
                                                >
                                                    Check options
                                                </Button>
                                            </BlockStack>
                                        </div>
                                    </Card>

                                    {/* Duplicates by SKU + barcode */}
                                    <Card background="bg-surface-secondary">
                                        <div style={{ padding: "20px", textAlign: "center" }}>
                                            <BlockStack gap="300" align="center">
                                                <Text as="h3" variant="headingSm" fontWeight="semibold">
                                                    Duplicates by SKU + barcode
                                                </Text>
                                                <Text as="p" variant="heading2xl" alignment="center">
                                                    {duplicateStats.bySkuBarcode}
                                                </Text>
                                                <Button
                                                    size="slim"
                                                    onClick={() => handleCheckOptions('SKU + barcode')}
                                                    disabled={duplicateStats.bySkuBarcode === 0}
                                                >
                                                    Check options
                                                </Button>
                                            </BlockStack>
                                        </div>
                                    </Card>
                                </div>
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                </Layout>

                {/* Step 3 */}
                <Layout>
                    <Layout.Section>
                        <Card>
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
                                    <Button
                                        onClick={handleBulkDelete}
                                        disabled={!selectedRule}
                                    >
                                        Bulk delete
                                    </Button>
                                </InlineStack>
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                </Layout>

                {/* Step 4 */}
                <Layout>
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="400">
                                <InlineStack align="space-between" blockAlign="center">
                                    <Text as="p" variant="bodyMd">
                                        <Text as="span" fontWeight="semibold">Step 4:</Text> You can also select products or variants to delete manually.
                                    </Text>
                                    <InlineStack gap="200">
                                        <Button
                                            onClick={handleDeleteSelected}
                                            disabled={selectedProducts.length === 0}
                                        >
                                            Delete selected
                                        </Button>
                                    </InlineStack>
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
    );
} 