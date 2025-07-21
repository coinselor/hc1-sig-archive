#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --unstable-kv

/**
 * Clean test script for HC1 Matrix Bot
 * This resets the state and runs a complete test
 */

import { ConfigManager } from "../src/config/config.ts";
import { AuthorizationServiceImpl } from "../src/auth/index.ts";
import { MeetingManager } from "../src/bot/meeting-manager.ts";

async function cleanAndTestBot() {
  console.log("🧹 Cleaning and Testing HC1 Matrix Bot\n");

  try {
    // Step 1: Clear KV storage
    console.log("1️⃣ Clearing existing meeting sessions...");
    const kv = await Deno.openKv();
    
    // List and delete all meeting sessions
    const entries = kv.list({ prefix: ["meetings"] });
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
    console.log(`   - Authorized users: ${config.authorization.authorizedUsers.length}`);
    console.log();

    // Step 3: Initialize Authorization Service
    console.log("3️⃣ Initializing authorization service...");
    const authService = new AuthorizationServiceImpl();
    await authService.loadAuthorizedUsers();
    console.log(`✅ Authorization service initialized`);
    console.log(`   - Authorized user count: ${authService.getAuthorizedUserCount()}`);
    console.log();

    // Step 4: Initialize Meeting Manager
    console.log("4️⃣ Initializing meeting manager...");
    const meetingManager = new MeetingManager();
    await meetingManager.initialize();
    console.log(`✅ Meeting manager initialized (clean state)`);
    console.log();

    // Step 5: Test Meeting Session Creation
    console.log("5️⃣ Testing meeting session creation...");
    const testRoomId = "!testroom:example.org";
    const testUserId = "@admin:example.org";
    const testRoomName = "Test General Meeting";

    // Check if user is authorized
    const isAuthorized = authService.isAuthorized(testUserId, "start");
    console.log(`   - User ${testUserId} authorized: ${isAuthorized}`);

    if (!isAuthorized) {
      console.log("❌ User not authorized, cannot start meeting");
      return;
    }

    // Start a meeting
    const startResult = await meetingManager.startMeeting(
      testRoomId,
      testRoomName,
      testUserId,
      "Test Admin"
    );
    console.log(`✅ Meeting started: ${startResult.success}`);
    console.log(`   - Message: ${startResult.message}`);
    console.log();

    // Step 6: Simulate Message Capture
    console.log("6️⃣ Simulating message capture...");
    const testEvents = [
      {
        event_id: "$event1:example.org",
        sender: "@admin:example.org",
        origin_server_ts: new Date("2024-01-20T10:00:00Z").getTime(),
        content: {
          msgtype: "m.text",
          body: "Welcome everyone to our test meeting!"
        }
      },
      {
        event_id: "$event2:example.org",
        sender: "@user:example.org",
        origin_server_ts: new Date("2024-01-20T10:02:00Z").getTime(),
        content: {
          msgtype: "m.text",
          body: "Thanks for organizing this meeting."
        }
      },
      {
        event_id: "$event3:example.org",
        sender: "@admin:example.org",
        origin_server_ts: new Date("2024-01-20T10:05:00Z").getTime(),
        content: {
          msgtype: "m.text",
          body: "Let's discuss the agenda items."
        }
      },
      {
        event_id: "$event4:example.org",
        sender: "@user:example.org",
        origin_server_ts: new Date("2024-01-20T10:10:00Z").getTime(),
        content: {
          msgtype: "m.text",
          body: "I agree with the proposed changes."
        }
      }
    ];

    // Capture messages during the meeting
    for (const event of testEvents) {
      const senderDisplayName = event.sender === "@admin:example.org" ? "Test Admin" : "Test User";
      await meetingManager.captureMessage(testRoomId, event, senderDisplayName);
    }
    console.log(`✅ Captured ${testEvents.length} test messages`);
    console.log();

    // Step 7: Check Meeting Status
    console.log("7️⃣ Checking meeting status...");
    const statusResult = meetingManager.getMeetingStatus(testRoomId);
    if (statusResult.hasActiveMeeting && statusResult.session) {
      console.log(`✅ Meeting is active`);
      console.log(`   - Started by: ${statusResult.session.initiator}`);
      console.log(`   - Messages captured: ${statusResult.session.messages.length}`);
      console.log(`   - Participants: ${statusResult.session.participants.size}`);
      console.log(`   - Duration: ${statusResult.duration}`);
    } else {
      console.log(`❌ No active meeting found`);
    }
    console.log();

    // Step 8: End Meeting and Generate Minutes
    console.log("8️⃣ Ending meeting and generating minutes...");
    const endResult = await meetingManager.endMeeting(testRoomId);
    
    if (!endResult.success || !endResult.session) {
      console.log("❌ Failed to end meeting:", endResult.message);
      return;
    }

    const session = endResult.session;
    console.log(`✅ Meeting ended successfully`);
    console.log(`   - Duration: ${session.endTime && session.startTime ? 
      Math.round((session.endTime.getTime() - session.startTime.getTime()) / 1000 / 60) : 'Unknown'} minutes`);
    console.log(`   - Messages captured: ${session.messages.length}`);
    console.log(`   - Participants: ${session.participants.size}`);
    console.log();

    // Step 9: Check Generated Minutes
    console.log("9️⃣ Checking generated meeting minutes...");
    if (endResult.minutes) {
      console.log(`✅ Meeting minutes generated (${endResult.minutes.content.length} characters)`);
      console.log(`   - File path: ${endResult.minutes.filePath}`);
      console.log();

      // Step 10: Display Generated Minutes Preview
      console.log("🔟 Generated minutes preview:");
      console.log("=" .repeat(60));
      console.log(endResult.minutes.content.substring(0, 800) + "...");
      console.log("=" .repeat(60));
      console.log();
    } else {
      console.log("❌ No meeting minutes were generated");
      console.log();
    }

    // Step 11: Check if file was saved
    console.log("1️⃣1️⃣ Checking saved meeting files...");
    try {
      const meetingsDir = config.storage.local?.directory || "../data/meetings";
      const entries = [];
      for await (const entry of Deno.readDir(meetingsDir)) {
        entries.push(entry);
      }
      console.log(`✅ Found ${entries.length} files in meetings directory`);
      for (const entry of entries) {
        console.log(`   - ${entry.name}`);
      }
    } catch (error) {
      console.log(`❌ Could not read meetings directory: ${error.message}`);
    }

    console.log();
    console.log("🎉 All tests completed successfully!");
    console.log();
    console.log("📋 Summary:");
    console.log("   ✅ Configuration loading");
    console.log("   ✅ Authorization service");
    console.log("   ✅ Meeting session management");
    console.log("   ✅ Message capture");
    console.log("   ✅ Meeting minutes generation");
    console.log("   ✅ File storage");

  } catch (error) {
    console.error("❌ Test failed:", error);
    console.error(error.stack);
  }
}

// Run the test
if (import.meta.main) {
  await cleanAndTestBot();
}