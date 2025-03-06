require('dotenv').config();
const axios = require('axios');
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
  warn: (message) => console.warn(`${LOG_PREFIX} ⚠️ ${message}`),
  debug: (message) => console.log(`${LOG_PREFIX} 🔍 ${message}`)
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
    
    // Update GHL with Structurely data - using PUT method with customField (not customFields)
    await axios.put(
      `https://rest.gohighlevel.com/v1/contacts/${ghlContactId}`,
      {
        customField: customFieldData
      },
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
    logger.info("Checking if required custom fields exist in GHL...");
    
    // Get existing custom fields
    const response = await axios.get(
      "https://rest.gohighlevel.com/v1/custom-fields/",
      { headers: { Authorization: `Bearer ${GHL_API_KEY}` } }
    );
    
    const existingFields = response.data.customFields || [];
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
    
    // Check which fields need to be created
    const existingFieldNames = existingFields.map(field => field.name);
    const fieldsToCreate = requiredFields.filter(field => !existingFieldNames.includes(field.name));
    
    // Create missing fields
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

// Main integration test function
async function runIntegrationTest() {
  try {
    logger.info("Starting integration test");
    
    // Ensure custom fields exist
    await ensureCustomFieldsExist();
    
    // Get contacts from GHL
    const contactsData = await getGHLContacts(1); // Get just 1 contact for testing
    const contacts = contactsData.contacts;
    
    if (contacts.length === 0) {
      logger.error("No contacts found in GHL");
      return;
    }
    
    // Use the first contact for testing
    const ghlContact = contacts[0];
    logger.info(`Using contact: ${ghlContact.id} - ${ghlContact.firstName} ${ghlContact.lastName || ''}`);
    
    // Prepare lead data for Structurely (with sample property data)
    const ghlLead = {
      id: ghlContact.id,
      name: `${ghlContact.firstName} ${ghlContact.lastName || ''}`.trim(),
      email: ghlContact.email,
      phone: ghlContact.phone,
      priceMin: "400000",
      priceMax: "700000",
      bedrooms: "3",
      bathrooms: "2",
      timeframe: "3-6 months",
      location: "Toronto",
      propertyType: "residential", // Using a valid value from Structurely's allowed list
      leadType: "Buyer",
      notes: "Test lead created via GHL-Structurely integration"
    };
    
    // Step 1: Send to Structurely
    const structurelyLead = await syncLeadToStructurely(ghlLead);
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 2: Get from Structurely and update GHL
    await syncLeadFromStructurely(structurelyLead.id, ghlContact.id);
    
    logger.success("Integration test completed successfully!");
  } catch (error) {
    logger.error(`Integration test failed: ${error.message}`);
  }
}

// Function for periodic syncing - FIXED VERSION
async function periodicSync() {
  try {
    const startTime = new Date();
    logger.info(`Running periodic sync at ${startTime.toLocaleTimeString()}`);
    
    // Ensure custom fields exist
    await ensureCustomFieldsExist();
    
    // Get all contacts from GHL that need syncing
    let offset = 0;
    let hasMore = true;
    const syncedContacts = new Set(); // Track already processed contacts within this run
    
    // Calculate the timestamp for "recently synced" (e.g., in the last 4 hours)
    const syncCutoffTime = new Date();
    syncCutoffTime.setHours(syncCutoffTime.getHours() - 4); // Consider contacts synced in the last 4 hours as "recent"
    const syncCutoffTimeString = syncCutoffTime.toISOString();
    
    while (hasMore) {
      // Fetch batch of contacts
      const contactsData = await getGHLContacts(SYNC_BATCH_SIZE, offset);
      const contacts = contactsData.contacts;
      
      if (contacts.length === 0) {
        logger.info("No more contacts to process");
        hasMore = false;
        break;
      }
      
      // Filter contacts to only those that need syncing
      const contactsToSync = contacts.filter(contact => {
        // Skip if already processed in this run
        if (syncedContacts.has(contact.id)) {
          return false;
        }
        
        // Check if this contact has been synced recently
        const lastSynced = contact.customField?.structurely_last_synced;
        if (lastSynced && lastSynced > syncCutoffTimeString) {
          logger.debug(`Skipping recently synced contact: ${contact.id}`);
          return false;
        }
        
        // Check if there are any changes that would require a sync
        // (Only sync if certain fields have changed or if never synced before)
        if (contact.customField?.structurely_lead_id) {
          // Contact exists in Structurely - check for changes in key fields
          // Add your change detection logic here if needed
          return true; // For now, we'll continue with the sync
        } else {
          // Never synced before - should be synced
          return true;
        }
      });
      
      logger.info(`Found ${contactsToSync.length} contacts to sync out of ${contacts.length} in this batch`);
      
      // Process each contact that needs syncing
      for (const contact of contactsToSync) {
        const contactName = `${contact.firstName} ${contact.lastName || ''}`.trim();
        logger.info(`Processing: ${contactName} (${contact.id})`);
        
        try {
          // Add contact ID to processed set
          syncedContacts.add(contact.id);
          
          // Prepare lead data
          const ghlLead = {
            id: contact.id,
            name: contactName,
            email: contact.email,
            phone: contact.phone,
            // Extract additional fields from GHL custom fields if available
            priceMin: contact.customField?.property_min_price || "0",
            priceMax: contact.customField?.property_max_price || "0",
            bedrooms: contact.customField?.bedrooms || "0",
            bathrooms: contact.customField?.bathrooms || "0",
            timeframe: contact.customField?.timeframe || "",
            location: contact.customField?.location || "",
            propertyType: "residential", // Valid value for Structurely
            leadType: contact.customField?.lead_type || "Unknown",
            notes: contact.notes || ""
          };
          
          // Sync to Structurely
          const structurelyLead = await syncLeadToStructurely(ghlLead);
          
          // Wait a brief moment to avoid API rate limits
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Sync back to GHL
          await syncLeadFromStructurely(structurelyLead.id, contact.id);
          
          logger.success(`Successfully synced contact: ${contactName}`);
        } catch (error) {
          logger.error(`Error syncing contact ${contactName}: ${error.message}`);
          // Continue with next contact, don't stop the batch
          continue;
        }
      }
      
      // Update offset for next batch
      offset += contacts.length;
      
      // Check if we've reached the end
      if (contacts.length < SYNC_BATCH_SIZE) {
        hasMore = false;
      }
      
      // Add delay between batches to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const endTime = new Date();
    const durationMs = endTime - startTime;
    logger.success(`Periodic sync completed at ${endTime.toLocaleTimeString()} (duration: ${durationMs/1000}s)`);
  } catch (error) {
    logger.error(`Periodic sync failed: ${error.message}`);
  }
}

// Perform initial setup and tests
async function initialize() {
  logger.info("Initializing Structurely-GHL Sync Service");
  
  try {
    // Run the integration test first as a verification
    await runIntegrationTest();
    
    // If test is successful, set up periodic sync
    logger.info("Setting up periodic sync (every 5 minutes)");
    const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
    
    // Run initial full sync
    await periodicSync();
    
    // Then set up periodic sync
    setInterval(periodicSync, SYNC_INTERVAL);
    logger.success(`Sync service is running. Next sync in 5 minutes.`);
  } catch (error) {
    logger.error(`Initialization failed: ${error.message}`);
  }
}

// Start the service
initialize();
