#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --unstable-kv

/**
 * Test script to verify HC1 Matrix Bot storage functionality
 */

import { ConfigManager } from "../src/config/config.ts";
import { AuthorizationServiceImpl } from "../src/auth/index.ts";
import { MeetingManager } from "../src/bot/meeting-manager.ts";
import { StorageFactory } from "../src/storage/storage-factory.ts";
import type { MeetingSession } from "../src/types/index.ts";

async function testStorageFunctionality() {
  console.log("💾 Testing HC1 Matrix Bot Storage Functionality\n");

  try {
    // Step 1: Clear KV storage
    console.log("1️⃣ Clearing existing meeting sessions...");
    const kv = await Deno.openKv();
    const entries = kv.list({ prefix: [] });
    let deletedCount = 0;
    for await (const entry of entries) {
      await kv.delete(entry.key);
      deletedCount++;
    }
    console.log(`✅ Cleared ${deletedCount} existing meeting sessions`);
    kv.close();
    console.log();

    // Step 2: Load Configuration
    console.log("2️⃣ Loading configuration...");
    const configManager = new ConfigManager();
    const config = await configManager.loadConfiguration();
    console.log(`✅ Configuration loaded successfully`);
    console.log(`   - Storage provider: ${config.storage.provider}`);
    console.log();

    // Step 3: Initialize Storage
    console.log("3️⃣ Initializing storage providers...");
    const primaryStorage = StorageFactory.createStorageProvider(config);
    const fallbackStorage = StorageFactory.createFallbackStorageProvider();
    console.log(`✅ Storage providers initialized`);
    console.log(`   - Primary: ${config.storage.provider}`);
    console.log(`   - Fallback: local`);
    console.log();

    // Step 4: Initialize Meeting Manager and create a test meeting
    console.log("4️⃣ Creating test meeting session...");
    const meetingManager = new MeetingManager();
    await meetingManager.initialize();

    const testRoomId = "!testroom:example.org";
    const testUserId = "@admin:example.org";
    const testRoomName = "Storage Test Meeting";

    const startResult = await meetingManager.startMeeting(
      testRoomId,
      testRoomName,
      testUserId,
      "Test Admin"
    );

    if (!startResult.success) {
      console.log("❌ Failed to start meeting:", startResult.message);
      return;
    }

    console.log(`✅ Meeting started successfully`);
    console.log();

    // Step 5: Add test messages
    console.log("5️⃣ Adding test messages...");
    const testEvents = [
      {
        event_id: "$event1:example.org",
        sender: "@admin:example.org",
        origin_server_ts: new Date("2024-01-20T10:00:00Z").getTime(),
        content: {
          msgtype: "m.text",
          body: "This is a test meeting to verify storage functionality."
        }
      },
      {
        event_id: "$event2:example.org",
        sender: "@user:example.org",
        origin_server_ts: new Date("2024-01-20T10:02:00Z").getTime(),
        content: {
          msgtype: "m.text",
          body: "Testing message capture and storage."
        }
      },
      {
        event_id: "$event3:example.org",
        sender: "@admin:example.org",
        origin_server_ts: new Date("2024-01-20T10:05:00Z").getTime(),
        content: {
          msgtype: "m.text",
          body: "This should be saved to the configured storage location."
        }
      }
    ];

    for (const event of testEvents) {
      const senderDisplayName = event.sender === "@admin:example.org" ? "Test Admin" : "Test User";
      await meetingManager.captureMessage(testRoomId, event, senderDisplayName);
    }
    console.log(`✅ Added ${testEvents.length} test messages`);
    console.log();

    // Step 6: End meeting and generate minutes
    console.log("6️⃣ Ending meeting and generating minutes...");
    const endResult = await meetingManager.endMeeting(testRoomId);
    
    if (!endResult.success || !endResult.session || !endResult.minutes) {
      console.log("❌ Failed to end meeting:", endResult.message);
      return;
    }

    console.log(`✅ Meeting ended and minutes generated`);
    console.log(`   - Minutes content length: ${endResult.minutes.content.length} characters`);
    console.log();

    // Step 7: Test storage functionality
    console.log("7️⃣ Testing storage functionality...");
    try {
      const saveUrl = await primaryStorage.saveMinutes(endResult.session, endResult.minutes.content);
      console.log(`✅ Minutes saved successfully`);
      console.log(`   - Save URL: ${saveUrl || 'N/A'}`);

      const minutesUrl = await primaryStorage.getMinutesUrl(endResult.session);
      console.log(`   - Minutes URL: ${minutesUrl || 'N/A'}`);
    } catch (error) {
      console.log(`❌ Primary storage failed: ${error.message}`);
      
      // Try fallback storage
      try {
        console.log("   - Trying fallback storage...");
        const fallbackUrl = await fallbackStorage.saveMinutes(endResult.session, endResult.minutes.content);
        console.log(`✅ Fallback storage successful`);
        console.log(`   - Fallback URL: ${fallbackUrl || 'N/A'}`);
      } catch (fallbackError) {
        console.log(`❌ Fallback storage also failed: ${fallbackError.message}`);
      }
    }
    console.log();

    // Step 8: Check saved files
    console.log("8️⃣ Checking saved files...");
    try {
      const meetingsDir = config.storage.local?.directory || "../data/meetings";
      const entries = [];
      for await (const entry of Deno.readDir(meetingsDir)) {
        entries.push(entry);
      }
      console.log(`✅ Found ${entries.length} files in meetings directory`);
      for (const entry of entries) {
        console.log(`   - ${entry.name}`);
        
        // Read and display first few lines of the file
        if (entry.name.endsWith('.md')) {
          try {
            const filePath = `${meetingsDir}/${entry.name}`;
            const content = await Deno.readTextFile(filePath);
            console.log(`     Preview (first 200 chars): ${content.substring(0, 200)}...`);
          } catch (readError) {
            console.log(`     Could not read file: ${readError.message}`);
          }
        }
      }
    } catch (error) {
      console.log(`❌ Could not read meetings directory: ${error.message}`);
    }

    console.log();
    console.log("🎉 Storage functionality test completed!");

  } catch (error) {
    console.error("❌ Storage test failed:", error);
    console.error(error.stack);
  }
}

// Run the test
if (import.meta.main) {
  await testStorageFunctionality();
}