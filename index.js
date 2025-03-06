require('dotenv').config();
const axios = require('axios');

// API Keys from .env file
const STRUCTURELY_API_KEY = process.env.STRUCTURELY_API_KEY;
const GHL_API_KEY = process.env.GHL_API_KEY;

// Global constants
const SYNC_BATCH_SIZE = 10; // Number of contacts to process per batch
const LOG_PREFIX = '🔄 Structurely-GHL Sync:';

// Logger utility functions
const logger = {
  info: (message) => console.log(`${LOG_PREFIX} ℹ️ ${message}`),
  success: (message) => console.log(`${LOG_PREFIX} ✅ ${message}`),
  error: (message) => console.error(`${LOG_PREFIX} ❌ ${message}`),
};

// Ensure GHL custom fields exist
async function ensureCustomFieldsExist() {
  try {
    logger.info("Checking if required custom fields exist in GHL...");

    const existingFieldsRes = await axios.get(
      "https://rest.gohighlevel.com/v1/custom-fields/",
      { headers: { Authorization: `Bearer ${GHL_API_KEY}` } }
    );

    const existingFieldNames = existingFieldsRes.data.customFields.map(f => f.name);

    const requiredFields = [
      { name: "structurely_lead_id", displayName: "Structurely Lead ID", fieldType: "TEXT" },
      { name: "structurely_price_max", displayName: "Structurely Price Max", fieldType: "TEXT" },
      { name: "structurely_price_min", displayName: "Structurely Price Min", fieldType: "TEXT" },
      { name: "structurely_bedrooms", displayName: "Structurely Bedrooms", fieldType: "TEXT" },
      { name: "structurely_bathrooms", displayName: "Structurely Bathrooms", fieldType: "TEXT" },
      { name: "structurely_ai_conversation_status", displayName: "Structurely AI Conversation Status", fieldType: "TEXT" },
      { name: "structurely_lead_type", displayName: "Structurely Lead Type", fieldType: "TEXT" },
      { name: "structurely_timeframe", displayName: "Structurely Timeframe", fieldType: "TEXT" },
      { name: "structurely_location", displayName: "Structurely Location", fieldType: "TEXT" },
      { name: "structurely_property_type", displayName: "Structurely Property Type", fieldType: "TEXT" },
      { name: "structurely_muted", displayName: "Structurely Muted", fieldType: "TEXT" },
      { name: "structurely_notes", displayName: "Structurely Notes", fieldType: "LARGE_TEXT" },
      { name: "structurely_ai_conversation_link", displayName: "Structurely AI Conversation Link", fieldType: "TEXT" },
      { name: "structurely_last_synced", displayName: "Structurely Last Synced", fieldType: "TEXT" }
    ];

    for (const field of requiredFields) {
      if (!existingFieldNames.includes(field.name)) {
        await axios.post(
          "https://rest.gohighlevel.com/v1/custom-fields/",
          field,
          { headers: { Authorization: `Bearer ${GHL_API_KEY}` } }
        );
        logger.success(`Created custom field: ${field.displayName}`);
      }
    }

    logger.success("All custom fields are set up.");
  } catch (error) {
    logger.error(`Error ensuring custom fields exist: ${error.message}`);
    throw error;
  }
}

// Periodic sync logic here (insert your previously shared periodicSync function with pagination and improved handling)
async function periodicSync() {
  // Your periodic sync logic here (as previously provided)
  // Fetch contacts from GHL, sync each to Structurely, then update GHL
}

async function initialize() {
  try {
    logger.info("Initializing Structurely-GHL Sync Service");
    await ensureCustomFieldsExist();
    await periodicSync();
    setInterval(periodicSync, 5 * 60 * 1000); // every 5 mins
    logger.success("Sync service is running. Next sync in 5 minutes.");
  } catch (error) {
    logger.error(`Initialization failed: ${error.message}`);
  }
}

initialize();
