import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });

    // Clean up app-specific data
    await Promise.all([
      db.duplicateGroup.deleteMany({ where: { shop } }),
      db.duplicateStats.deleteMany({ where: { shop } }),
      db.scanSession.deleteMany({ where: { shop } }),
      db.productBackup.deleteMany({ where: { shop } }),
    ]);

    console.log(`Cleaned up all data for shop: ${shop}`);
  }

  return new Response();
};
