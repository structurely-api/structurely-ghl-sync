require('dotenv').config();
const axios = require('axios');
const STRUCTURELY_API_KEY = process.env.STRUCTURELY_API_KEY;
const GHL_API_KEY = process.env.GHL_API_KEY;

// Global constants
const SYNC_BATCH_SIZE = 10; // Number of contacts to process per batch
const LOG_PREFIX = '🔄 Structurely-GHL Sync:';
const SYNC_INTERVAL_MINUTES = 5; // Run sync every 5 minutes
const SYNC_CUTOFF_HOURS = 4; // Skip contacts synced in the last 4 hours

// Logger utility functions
const logger = {
  info: (message) => console.log(`${LOG_PREFIX} ℹ️ ${message}`),
  success: (message) => console.log(`${LOG_PREFIX} ✅ ${message}`),
  error: (message) => console.error(`${LOG_PREFIX} ❌ ${message}`),
  warn: (message) => console.warn(`${LOG_PREFIX} ⚠️ ${message}`),
  debug: (message) => console.log(`${LOG_PREFIX} 🔍 ${message}`)
};

// Utility function to safely extract custom field values
function getCustomFieldValue(contact, fieldName, defaultValue = "") {
  try {
    if (!contact.customField) return defaultValue;
    return contact.customField[fieldName] || defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

// Function to create/update a lead in Structurely from GHL with 'raw_lead' as default
async function syncLeadToStructurely(ghlLead) {
  try {
    logger.info(`Sending GHL lead ${ghlLead.id} to Structurely...`);
    
    // Convert string values to numbers for Structurely API
    const priceMin = ghlLead.priceMin ? parseFloat(ghlLead.priceMin) : null;
    const priceMax = ghlLead.priceMax ? parseFloat(ghlLead.priceMax) : null;
    const bedrooms = ghlLead.bedrooms ? parseInt(ghlLead.bedrooms) : null;
    const bathrooms = ghlLead.bathrooms ? parseInt(ghlLead.bathrooms) : null;
    
    // Default to 'raw_lead' for all leads
    const structurelyLeadType = 'raw_lead';
    
    logger.debug(`Using lead type "${structurelyLeadType}" for all leads`);
    
    // Create/update lead in Structurely with retry logic
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount <= maxRetries) {
      try {
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
              leadType: structurelyLeadType, // Always using 'raw_lead'
              notes: ghlLead.notes
            }
          },
          { 
            headers: { Authorization: `Bearer ${STRUCTURELY_API_KEY}` },
            timeout: 20000 // Increased timeout
          }
        );
        
        logger.success(`Lead synced to Structurely with ID: ${response.data.id}`);
        return response.data;
      } catch (error) {
        retryCount++;
        
        if (retryCount > maxRetries) {
          logger.error(`Failed to sync lead to Structurely after ${maxRetries} attempts: ${error.message}`);
          throw error;
        }
        
        const delay = 2000 * retryCount;
        logger.warn(`Retrying in ${delay/1000} seconds (attempt ${retryCount}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
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
    
    // Get lead from Structurely with retry logic
    let retryCount = 0;
    const maxRetries = 3;
    let lead;
    
    while (retryCount <= maxRetries) {
      try {
        const response = await axios.get(
          `https://datalayer.structurely.com/api/direct/v2/leads/${leadId}`,
          { 
            headers: { Authorization: `Bearer ${STRUCTURELY_API_KEY}` },
            timeout: 20000 // Increased timeout
          }
        );
        
        lead = response.data;
        logger.success(`Retrieved lead from Structurely: ${lead.name}`);
        break;
      } catch (error) {
        retryCount++;
        
        if (retryCount > maxRetries) {
          logger.error(`Failed to get lead from Structurely after ${maxRetries} attempts: ${error.message}`);
          throw error;
        }
        
        const delay = 2000 * retryCount;
        logger.warn(`Retrying in ${delay/1000} seconds (attempt ${retryCount}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // Prepare data for GHL update - Using multiple field names to avoid dependency on specific fields
    const customFieldData = {
      // Store key information in multiple fields to ensure at least one works
      "structurely_id": lead.id, // Alternative field name
      "structurely_reference": lead.id, // Another alternative
      "structurely_lead_ref": lead.id, // Yet another alternative
      
      // Other standard fields
      "str_price_max": lead.properties?.priceMax || "",
      "str_price_min": lead.properties?.priceMin || "",
      "str_bedrooms": lead.properties?.bedrooms || "",
      "str_bathrooms": lead.properties?.bathrooms || "",
      "str_conversation_status": lead.stages?.join(", ") || "",
      "str_lead_type": lead.type || "",
      "str_timeframe": lead.properties?.timeframe || "",
      "str_location": lead.properties?.location || "",
      "str_property_type": lead.properties?.propertyType || "",
      "str_muted": lead.muted ? "Yes" : "No",
      "str_notes": lead.properties?.notes || "",
      "str_conversation_link": `https://homechat.structurely.com/#/inbox/${lead.id}`,
      "str_last_synced": new Date().toISOString()
    };
    
    // Try to include the original field names as well
    try {
      // These might fail if fields don't exist, but we have alternatives above
      customFieldData["structurely_lead_id"] = lead.id;
      customFieldData["structurely_price_max"] = lead.properties?.priceMax || "";
      customFieldData["structurely_price_min"] = lead.properties?.priceMin || "";
      customFieldData["structurely_bedrooms"] = lead.properties?.bedrooms || "";
      customFieldData["structurely_bathrooms"] = lead.properties?.bathrooms || "";
      customFieldData["structurely_ai_conversation_status"] = lead.stages?.join(", ") || "";
      customFieldData["structurely_lead_type"] = lead.type || "";
      customFieldData["structurely_timeframe"] = lead.properties?.timeframe || "";
      customFieldData["structurely_location"] = lead.properties?.location || "";
      customFieldData["structurely_property_type"] = lead.properties?.propertyType || "";
      customFieldData["structurely_muted"] = lead.muted ? "Yes" : "No";
      customFieldData["structurely_notes"] = lead.properties?.notes || "";
      customFieldData["structurely_ai_conversation_link"] = `https://homechat.structurely.com/#/inbox/${lead.id}`;
      customFieldData["structurely_last_synced"] = new Date().toISOString();
    } catch (e) {
      logger.debug("Some original field names might not exist, using alternatives");
    }
    
    // Update GHL with Structurely data - using PUT method with customField
    let updateRetryCount = 0;
    const maxUpdateRetries = 3;
    
    while (updateRetryCount <= maxUpdateRetries) {
      try {
        await axios.put(
          `https://rest.gohighlevel.com/v1/contacts/${ghlContactId}`,
          {
            customField: customFieldData
          },
          { 
            headers: { 
              Authorization: `Bearer ${GHL_API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 20000 // Increased timeout
          }
        );
        
        logger.success(`Updated GHL contact with Structurely data`);
        return lead;
      } catch (error) {
        updateRetryCount++;
        
        if (updateRetryCount > maxUpdateRetries) {
          logger.error(`Failed to update GHL contact after ${maxUpdateRetries} attempts: ${error.message}`);
          throw error;
        }
        
        const delay = 2000 * updateRetryCount;
        logger.warn(`Retrying in ${delay/1000} seconds (attempt ${updateRetryCount}/${maxUpdateRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
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
    
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount <= maxRetries) {
      try {
        const response = await axios.get(
          `https://rest.gohighlevel.com/v1/contacts/?limit=${limit}&offset=${offset}`,
          { 
            headers: { Authorization: `Bearer ${GHL_API_KEY}` },
            timeout: 20000 // Increased timeout
          }
        );
        
        logger.success(`Found ${response.data.contacts.length} contacts in GHL`);
        return response.data;
      } catch (error) {
        retryCount++;
        
        if (retryCount > maxRetries) {
          logger.error(`Failed to fetch GHL contacts after ${maxRetries} attempts: ${error.message}`);
          throw error;
        }
        
        const delay = 2000 * retryCount;
        logger.warn(`Retrying in ${delay/1000} seconds (attempt ${retryCount}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } catch (error) {
    logger.error(`Error fetching GHL contacts: ${error.message}`);
    throw error;
  }
}

// Skip the problematic custom field creation function entirely
// We'll rely on manually created fields instead

// Main integration test function
async function runIntegrationTest() {
  try {
    logger.info("Starting integration test");
    
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
      leadType: "raw_lead", // Using raw_lead as the default type
      notes: "Test lead created via GHL-Structurely integration"
    };
    
    // Step 1: Send to Structurely
    const structurelyLead = await syncLeadToStructurely(ghlLead);
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 2: Get from Structurely and update GHL
    await syncLeadFromStructurely(structurelyLead.id, ghlContact.id);
    
    logger.success("Integration test completed successfully!");
    return true;
  } catch (error) {
    logger.error(`Integration test failed: ${error.message}`);
    return false;
  }
}

// Function for periodic syncing - FIXED VERSION
async function periodicSync() {
  try {
    const startTime = new Date();
    logger.info(`Running periodic sync at ${startTime.toLocaleTimeString()}`);
    
    // Skip the problematic custom field creation step
    // await ensureCustomFieldsExist();
    
    // Get all contacts from GHL that need syncing
    let offset = 0;
    let hasMore = true;
    const syncedContacts = new Set(); // Track already processed contacts within this run
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    
    // Calculate the timestamp for "recently synced"
    const syncCutoffTime = new Date();
    syncCutoffTime.setHours(syncCutoffTime.getHours() - SYNC_CUTOFF_HOURS);
    const syncCutoffTimeString = syncCutoffTime.toISOString();
    
    while (hasMore) {
      // Fetch batch of contacts with retry logic
      let contacts = [];
      try {
        const contactsData = await getGHLContacts(SYNC_BATCH_SIZE, offset);
        contacts = contactsData.contacts || [];
        
        if (contacts.length === 0) {
          logger.info("No more contacts to process");
          hasMore = false;
          break;
        }
      } catch (fetchError) {
        logger.error(`Error fetching contacts batch at offset ${offset}: ${fetchError.message}`);
        
        // Move to next batch and continue
        offset += SYNC_BATCH_SIZE;
        
        // If we've had multiple consecutive failures, slow down
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      
      // Filter contacts to only those that need syncing
      const contactsToSync = contacts.filter(contact => {
        // Skip if already processed in this run
        if (syncedContacts.has(contact.id)) {
          totalSkipped++;
          return false;
        }
        
        // Check if this contact has been synced recently
        // Look for multiple possible field names
        const lastSynced = 
          getCustomFieldValue(contact, "structurely_last_synced") || 
          getCustomFieldValue(contact, "str_last_synced");
          
        if (lastSynced && lastSynced > syncCutoffTimeString) {
          logger.debug(`Skipping recently synced contact: ${contact.id}`);
          totalSkipped++;
          return false;
        }
        
        // Contact should be synced
        return true;
      });
      
      logger.info(`Found ${contactsToSync.length} contacts to sync out of ${contacts.length} in this batch`);
      
      // Process each contact that needs syncing
      for (const contact of contactsToSync) {
        const contactName = `${contact.firstName} ${contact.lastName || ''}`.trim();
        logger.info(`Processing: ${contactName} (${contact.id})`);
        totalProcessed++;
        
        try {
          // Add contact ID to processed set to avoid duplicates
          syncedContacts.add(contact.id);
          
          // Check if this contact already has a Structurely ID
          // Look in multiple fields to handle different field names
          const existingStructurelyId = 
            getCustomFieldValue(contact, "structurely_lead_id") ||
            getCustomFieldValue(contact, "structurely_id") ||
            getCustomFieldValue(contact, "structurely_reference") ||
            getCustomFieldValue(contact, "str_lead_ref");
          
          // Prepare lead data
          const ghlLead = {
            id: contact.id,
            name: contactName,
            email: contact.email,
            phone: contact.phone,
            // Extract additional fields from GHL custom fields if available
            priceMin: getCustomFieldValue(contact, "property_min_price") || "0",
            priceMax: getCustomFieldValue(contact, "property_max_price") || "0",
            bedrooms: getCustomFieldValue(contact, "bedrooms") || "0",
            bathrooms: getCustomFieldValue(contact, "bathrooms") || "0",
            timeframe: getCustomFieldValue(contact, "timeframe") || "",
            location: getCustomFieldValue(contact, "location") || "",
            propertyType: "residential", // Valid value for Structurely
            leadType: "raw_lead", // Always using raw_lead
            notes: contact.notes || ""
          };
          
          // Sync to Structurely
          const structurelyLead = await syncLeadToStructurely(ghlLead);
          
          // Wait a brief moment to avoid API rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Sync back to GHL
          await syncLeadFromStructurely(structurelyLead.id, contact.id);
          
          logger.success(`Successfully synced contact: ${contactName}`);
          totalSuccess++;
        } catch (error) {
          logger.error(`Error syncing contact ${contactName}: ${error.message}`);
          totalFailed++;
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
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    const endTime = new Date();
    const durationMs = endTime - startTime;
    logger.success(`Periodic sync completed at ${endTime.toLocaleTimeString()} (duration: ${durationMs/1000}s)`);
    logger.info(`Sync summary: ${totalProcessed} processed, ${totalSuccess} successful, ${totalSkipped} skipped, ${totalFailed} failed`);
  } catch (error) {
    logger.error(`Periodic sync failed: ${error.message}`);
  }
}

// Perform initial setup and tests
async function initialize() {
  logger.info("Initializing Structurely-GHL Sync Service");
  
  try {
    // Skip the problematic custom field creation step
    // await ensureCustomFieldsExist();
    
    logger.warn("Skipping custom field creation due to API issues");
    logger.warn("Please ensure custom fields exist in GHL before running full sync");
    
    // Run the integration test first as a verification
    const testResult = await runIntegrationTest();
    
    // Set up periodic sync regardless of test result
    logger.info(`Setting up periodic sync (every ${SYNC_INTERVAL_MINUTES} minutes)`);
    const SYNC_INTERVAL = SYNC_INTERVAL_MINUTES * 60 * 1000;
    
    // Run initial full sync
    await periodicSync();
    
    // Then set up periodic sync
    setInterval(periodicSync, SYNC_INTERVAL);
    logger.success(`Sync service is running. Next sync in ${SYNC_INTERVAL_MINUTES} minutes.`);
  } catch (error) {
    logger.error(`Initialization failed: ${error.message}`);
    
    // Even if initialization fails, try to set up periodic sync
    logger.warn("Setting up periodic sync despite initialization errors");
    
    const SYNC_INTERVAL = SYNC_INTERVAL_MINUTES * 60 * 1000;
    setInterval(periodicSync, SYNC_INTERVAL);
  }
}

// Start the service
initialize();
