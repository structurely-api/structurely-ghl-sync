require('dotenv').config();
const axios = require('axios');
const STRUCTURELY_API_KEY = process.env.STRUCTURELY_API_KEY;
const GHL_API_KEY = process.env.GHL_API_KEY;

// Function to create/update a lead in Structurely from GHL
async function syncLeadToStructurely(ghlLead) {
  try {
    console.log(`🔄 Sending GHL lead ${ghlLead.id} to Structurely...`);
    
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
        email: ghlLead.email,
        phone: ghlLead.phone,
        source: "GoHighLevel",
        properties: {
          priceMin,
          priceMax,
          bedrooms,
          bathrooms,
          timeframe: ghlLead.timeframe,
          location: ghlLead.location,
          // Use a valid value from Structurely's allowed property types
          propertyType: "residential",
          leadType: ghlLead.leadType,
          notes: ghlLead.notes
        }
      },
      { headers: { Authorization: `Bearer ${STRUCTURELY_API_KEY}` } }
    );
    
    console.log(`✅ Lead synced to Structurely with ID: ${response.data.id}`);
    return response.data;
  } catch (error) {
    console.error("❌ Error sending lead to Structurely:", error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Response:`, error.response.data);
    }
    throw error;
  }
}

// Function to get a lead from Structurely by ID and update GHL
async function syncLeadFromStructurely(leadId, ghlContactId) {
  try {
    console.log(`🔄 Retrieving lead ${leadId} from Structurely...`);
    
    // Get lead from Structurely
    const response = await axios.get(
      `https://datalayer.structurely.com/api/direct/v2/leads/${leadId}`,
      { headers: { Authorization: `Bearer ${STRUCTURELY_API_KEY}` } }
    );
    
    const lead = response.data;
    console.log(`✅ Retrieved lead from Structurely: ${lead.name}`);
    
    // Update GHL with Structurely data - using PUT method with customField (not customFields)
    await axios.put(
      `https://rest.gohighlevel.com/v1/contacts/${ghlContactId}`,
      {
        customField: {
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
          "structurely_ai_conversation_link": `https://homechat.structurely.com/#/inbox/${lead.id}`
        }
      },
      { 
        headers: { 
          Authorization: `Bearer ${GHL_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`✅ Updated GHL contact with Structurely data`);
    return lead;
  } catch (error) {
    console.error("❌ Error syncing from Structurely to GHL:", error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Response:`, error.response.data);
    }
    throw error;
  }
}

// Function to get all contacts from GHL
async function getGHLContacts() {
  try {
    console.log("🔍 Fetching contacts from GHL...");
    
    const response = await axios.get(
      "https://rest.gohighlevel.com/v1/contacts/",
      { headers: { Authorization: `Bearer ${GHL_API_KEY}` } }
    );
    
    console.log(`✅ Found ${response.data.contacts.length} contacts in GHL`);
    return response.data.contacts;
  } catch (error) {
    console.error("❌ Error fetching GHL contacts:", error.message);
    throw error;
  }
}

// Main integration test
async function runIntegrationTest() {
  try {
    console.log("🧪 Starting integration test");
    
    // Get contacts from GHL
    const contacts = await getGHLContacts();
    
    if (contacts.length === 0) {
      console.error("❌ No contacts found in GHL");
      return;
    }
    
    // Use the first contact for testing
    const ghlContact = contacts[0];
    console.log(`📝 Using contact: ${ghlContact.id} - ${ghlContact.firstName} ${ghlContact.lastName || ''}`);
    
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
    
    console.log("✅ Integration test completed successfully!");
  } catch (error) {
    console.error("❌ Integration test failed:", error.message);
  }
}

// Function for periodic syncing
async function periodicSync() {
  try {
    console.log(`🔄 Running periodic sync at ${new Date().toLocaleTimeString()}`);
    
    // Get all contacts from GHL that need syncing
    // In a real implementation, you might filter by tag or custom field
    const contacts = await getGHLContacts();
    
    for (const contact of contacts.slice(0, 5)) { // Limit to first 5 for testing
      const contactName = `${contact.firstName} ${contact.lastName || ''}`.trim();
      console.log(`🔄 Processing: ${contactName} (${contact.id})`);
      
      try {
        // Prepare lead data
        const ghlLead = {
          id: contact.id,
          name: contactName,
          email: contact.email,
          phone: contact.phone,
          // Additional fields could be extracted from GHL custom fields
          priceMin: contact.customField?.property_min_price || "0",
          priceMax: contact.customField?.property_max_price || "0",
          bedrooms: contact.customField?.bedrooms || "0",
          bathrooms: contact.customField?.bathrooms || "0",
          propertyType: "residential" // Valid value for Structurely
        };
        
        // Sync to Structurely
        const structurelyLead = await syncLeadToStructurely(ghlLead);
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Sync back to GHL
        await syncLeadFromStructurely(structurelyLead.id, contact.id);
        
        console.log(`✅ Successfully synced contact: ${contactName}`);
      } catch (error) {
        console.error(`❌ Error syncing contact ${contactName}:`, error.message);
        // Continue with next contact
        continue;
      }
    }
    
    console.log(`✅ Periodic sync completed at ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    console.error(`❌ Periodic sync failed:`, error.message);
  }
}

// Run integration test once
runIntegrationTest();

// Uncomment to enable periodic syncing
// Run initial sync, then every 5 minutes
// const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
// setInterval(periodicSync, SYNC_INTERVAL);
