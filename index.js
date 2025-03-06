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

// Function to create/update a lead in Structurely from GHL
async function syncLeadToStructurely(ghlLead) {
  try {
    logger.info(`Sending GHL lead ${ghlLead.id} to Structurely...`);
    
    // Convert string values to numbers for Structurely API
    const priceMin = ghlLead.priceMin ? parseFloat(ghlLead.priceMin) : null;
    const priceMax = ghlLead.priceMax ? parseFloat(ghlLead.priceMax) : null;
    const bedrooms = ghlLead.bedrooms ? parseInt(ghlLead.bedrooms) : null;
    const bathrooms = ghlLead.bathrooms ? parseInt(ghlLead.bathrooms) : null;
    
    // Create/update lead in Structurely
    const response = await axios.post(
      "https://datalayer.structurely.com/api/direct/v2/leads",
      {
        externalLeadId: ghlLead.id,
        name: ghlLead.name,
        email: ghlLead.email || "unknown@example.com", // Fallback for required field
        phone: ghlLead.phone || "+10000000000", // Fallback for required field
        source: "GoHighLevel",
        properties: {
          priceMin,
          priceMax,
          bedrooms,
          bathrooms,
          timeframe: ghlLead.timeframe,
          location: ghlLead.location,
          propertyType: "residential", // Valid value for Structurely
          leadType: ghlLead.leadType || "Unknown",
          notes: ghlLead.notes
        }
      },
      { headers: { Authorization: `Bearer ${STRUCTURELY_API_KEY}` } }
    );
    
    logger.success(`Lead synced to Structurely with ID: ${response.data.id}`);
    return response.data;
  } catch (error) {
    logger.error(`Error sending lead to Structurely: ${error.message}`);
    if (error.response) {
      logger.error(`Status: ${error.response.status}`);
      logger.error(`Response: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

// Function to get a lead from Structurely by ID and update GHL
async function syncLeadFromStructurely(leadId, ghlContactId) {
  try {
    logger.info(`Retrieving lead ${leadId} from Structurely...`);
    
    // Get lead from Structurely
    const response = await axios.get(
      `https://datalayer.structurely.com/api/direct/v2/leads/${leadId}`,
      { headers: { Authorization: `Bearer ${STRUCTURELY_API_KEY}` } }
    );
    
    const lead = response.data;
    logger.success(`Retrieved lead from Structurely: ${lead.name}`);
    
    // Prepare data for GHL update
    const customFieldData = {
      "structurely_lead_id": lead.id,
      "structurely_price_max": lead.properties?.priceMax || "",
      "structurely_price_min": lead.properties?.priceMin || "",
      "structurely_bedrooms": lead.properties?.bedrooms || "",
      "structurely_bathrooms": lead.properties?.bathrooms || "",
      "structurely_ai_conversation_status": lead.stages?.join(", ") || "",
      "structurely_lead_type": lead.type || "",
      "structurely_timeframe": lead.properties?.timeframe || "",
      "structurely_location": lead.properties?.location || "",
      "structurely_property_type": lead.properties?.propertyType || "",
      "structurely_muted": lead.muted ? "Yes" : "No",
      "structurely_notes": lead.properties?.notes || "",
      "structurely_ai_conversation_link": `https://homechat.structurely.com/#/inbox/${lead.id}`,
      "structurely_last_synced": new Date().toISOString()
    };
    
    // Update GHL with Structurely data
    await axios.put(
      `https://rest.gohighlevel.com/v1/contacts/${ghlContactId}`,
      { customField: customFieldData },
      { 
        headers: { 
          Authorization: `Bearer ${GHL_API_KEY}`,
          'Content-Type': 'application/json'
        } 
      }
    );
    
    logger.success(`Updated GHL contact with Structurely data`);
    return lead;
  } catch (error) {
    logger.error(`Error syncing from Structurely to GHL: ${error.message}`);
    if (error.response) {
      logger.error(`Status: ${error.response.status}`);
      logger.error(`Response: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

// Function to get all contacts from GHL with pagination
async function getGHLContacts(limit = 100, offset = 0) {
  try {
    logger.info(`Fetching contacts from GHL (limit: ${limit}, offset: ${offset})...`);
    
    const response = await axios.get(
      `https://rest.gohighlevel.com/v1/contacts/?limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${GHL_API_KEY}` } }
    );
    
    logger.success(`Found ${response.data.contacts.length} contacts in GHL`);
    return response.data;
  } catch (error) {
    logger.error(`Error fetching GHL contacts: ${error.message}`);
    throw error;
  }
}

// Function to check if GHL custom fields exist and create them if not
async function ensureCustomFieldsExist() {
  try {
    logger.info("Checking existing custom fields in GHL...");
    
    const response = await axios.get(
      "https://rest.gohighlevel.com/v1/custom-fields/",
      { headers: { Authorization: `Bearer ${GHL_API_KEY}` } }
    );
    
    const existingFields = response.data.customFields || [];
    const existingFieldNames = existingFields.map(field => field.name);
    
    const requiredFields = [
      { name: "structurely_lead_id", displayName: "Structurely Lead ID", dataType: "TEXT" },
      { name: "structurely_price_max", displayName: "Structurely Price Max", dataType: "TEXT" },
      { name: "structurely_price_min", displayName: "Structurely Price Min", dataType: "TEXT" },
      { name: "structurely_bedrooms", displayName: "Structurely Bedrooms", dataType: "TEXT" },
      { name: "structurely_bathrooms", displayName: "Structurely Bathrooms", dataType: "TEXT" },
      { name: "structurely_ai_conversation_status", displayName: "Structurely AI Conversation Status", dataType: "TEXT" },
      { name: "structurely_lead_type", displayName: "Structurely Lead Type", dataType: "TEXT" },
      { name: "structurely_timeframe", displayName: "Structurely Timeframe", dataType: "TEXT" },
      { name: "structurely_location", displayName: "Structurely Location", dataType: "TEXT" },
      { name: "structurely_property_type", displayName: "Structurely Property Type", dataType: "TEXT" },
      { name: "structurely_muted", displayName: "Structurely Muted", dataType: "TEXT" },
      { name: "structurely_notes", displayName: "Structurely Notes", dataType: "LARGE_TEXT" },
      { name: "structurely_ai_conversation_link", displayName: "Structurely AI Conversation Link", dataType: "TEXT" },
      { name: "structurely_last_synced", displayName: "Structurely Last Synced", dataType: "TEXT" }
    ];
    
    const fieldsToCreate = requiredFields.filter(field => 
      !existingFieldNames.includes(field.name)
    );
    
    if (fieldsToCreate.length > 0) {
      logger.info(`Creating ${fieldsToCreate.length} missing custom fields in GHL...`);
      for (const field of fieldsToCreate) {
        await axios.post(
          "https://rest.gohighlevel.com/v1/custom-fields/",
          field,
          { headers: { Authorization: `Bearer ${GHL_API_KEY}` } }
        );
        logger.success(`Created custom field: ${field.displayName}`);
      }
    } else {
      logger.success("All required custom fields already exist in GHL");
    }
    
    return true;
  } catch (error) {
    logger.error(`Error ensuring custom fields exist: ${error.message}`);
    if (error.response) {
      logger.error(`Status: ${error.response.status}`);
      logger.error(`Response: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

// Main integration test with multiple contacts
async function runIntegrationTest() {
  try {
    logger.info("🧪 Starting integration test");
    
    // Ensure custom fields exist in GHL
    await ensureCustomFieldsExist();
    
    // Fetch multiple contacts from GHL
    const contacts = await getGHLContacts();
    if (contacts.length === 0) {
      logger.error("❌ No contacts found in GHL.");
      return;
    }
    
    logger.info(`Found ${contacts.length} contacts, syncing up to ${SYNC_BATCH_SIZE} contacts for this test.`);
    
    // Loop through multiple contacts for a thorough test
    for (const ghlContact of contacts.slice(0, SYNC_BATCH_SIZE)) {
      const contactName = `${ghlContact.firstName} ${ghlContact.lastName || ''}`.trim();
      logger.info(`📝 Using contact: ${ghlContact.id} - ${contactName}`);
      
      const ghlLead = {
        id: ghlContact.id,
        name: contactName,
        email: ghlContact.email || "unknown@example.com",
        phone: ghlContact.phone,
        priceMin: ghlContact.customField?.property_min_price || "0",
        priceMax: ghlContact.customField?.property_max_price || "0",
        bedrooms: ghlContact.customField?.bedrooms || "0",
        bathrooms: ghlContact.customField?.bathrooms || "0",
        timeframe: ghlContact.customField?.timeframe || "Unknown",
        location: ghlContact.customField?.location || "Unknown",
        propertyType: "residential",
        leadType: ghlContact.customField?.lead_type || "Unknown",
        notes: ghlContact.customField?.notes || ""
      };
      
      // Sync to Structurely
      const structurelyLead = await syncLeadToStructurely(ghlLead);
      
      // Small delay to avoid API throttling
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Sync data back from Structurely to GHL
      await syncLeadFromStructurely(structurelyLead.id, ghlContact.id);
      
      logger.success(`Completed integration test for contact: ${contactName}`);
    }
    
    logger.success("✅ Integration test completed successfully!");
  } catch (error) {
    logger.error(`Integration test failed: ${error.message}`);
  }
}

// Function for periodic syncing
async function periodicSync() {
  try {
    const startTime = new Date();
    logger.info(`Running periodic sync at ${startTime.toLocaleTimeString()}`);
    
    await ensureCustomFieldsExist();
    
    let offset = 0;
    let totalProcessed = 0;
    
    while (true) {
      const contactsData = await getGHLContacts(SYNC_BATCH_SIZE, offset);
      const contacts = contactsData.contacts;
      
      if (contacts.length === 0) {
        logger.info("No more contacts to process");
        break;
      }
      
      logger.info(`Fetched contacts from GHL: ${contacts.map(c => c.id).join(", ")}`);
      logger.info(`Processing batch of ${contacts.length} contacts...`);
      
      for (const contact of contacts) {
        const contactName = `${contact.firstName} ${contact.lastName || ''}`.trim();
        logger.info(`Processing: ${contactName} (${contact.id})`);
        
        try {
          const ghlLead = {
            id: contact.id,
            name: contactName,
            email: contact.email || "unknown@example.com",
            phone: contact.phone,
            priceMin: contact.customField?.property_min_price || "0",
            priceMax: contact.customField?.property_max_price || "0",
            bedrooms: contact.customField?.bedrooms || "0",
            bathrooms: contact.customField?.bathrooms || "0",
            propertyType: "residential"
          };
          
          // Step 1: Sync lead to Structurely
          const structurelyLead = await syncLeadToStructurely(ghlLead);
          
          // Wait a moment to avoid API throttling
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Step 2: Sync data back from Structurely to GHL
          await syncLeadFromStructurely(structurelyLead.id, contact.id);
          
          totalProcessed++;
          logger.success(`Successfully synced contact: ${contactName}`);
        } catch (error) {
          logger.error(`Error syncing contact ${contactName}: ${error.message}`);
          continue;
        }
      }
      
      offset += contacts.length;
      if (contacts.length < SYNC_BATCH_SIZE) break;
      
      // Delay between batches to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    const endTime = new Date();
    logger.success(`Periodic sync completed. Total contacts processed: ${totalProcessed}. Duration: ${(endTime - startTime) / 1000}s`);
  } catch (error) {
    logger.error(`Periodic sync failed: ${error.message}`);
  }
}

// Function to initialize the service
async function initialize() {
  try {
    logger.info("Initializing Structurely-GHL Sync Service");
    
    await ensureCustomFieldsExist();
    await periodicSync();
    
    const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
    setInterval(periodicSync, SYNC_INTERVAL);
    
    logger.success("Sync service is running. Next sync in 5 minutes.");
  } catch (error) {
    logger.error(`Initialization failed: ${error.message}`);
  }
}

// Start the service
initialize();
