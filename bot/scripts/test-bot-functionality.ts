#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --unstable-kv

/**
 * Test script to verify HC1 Matrix Bot functionality
 * This simulates bot operations without requiring a real Matrix connection
 */

import { ConfigManager } from "../src/config/config.ts";
import { AuthorizationServiceImpl } from "../src/auth/index.ts";
import { MeetingManager } from "../src/bot/meeting-manager.ts";
import { MinutesGenerator } from "../src/bot/minutes-generator.ts";
import { StorageFactory } from "../src/storage/storage-factory.ts";
import type { MeetingSession, CapturedMessage } from "../src/types/index.ts";

async function testBotFunctionality() {
  console.log("🧪 Testing HC1 Matrix Bot Functionality\n");

  try {
    // Step 1: Load Configuration
    console.log("1️⃣ Loading configuration...");
    const configManager = new ConfigManager();
    const config = await configManager.loadConfiguration();
    console.log(`✅ Configuration loaded successfully`);
    console.log(`   - Storage provider: ${config.storage.provider}`);
    console.log(`   - Authorized users: ${config.authorization.authorizedUsers.length}`);
    console.log();

    // Step 2: Initialize Authorization Service
    console.log("2️⃣ Initializing authorization service...");
    const authService = new AuthorizationServiceImpl();
    await authService.loadAuthorizedUsers();
    console.log(`✅ Authorization service initialized`);
    console.log(`   - Authorized user count: ${authService.getAuthorizedUserCount()}`);
    console.log();

    // Step 3: Initialize Meeting Manager
    console.log("3️⃣ Initializing meeting manager...");
    const meetingManager = new MeetingManager();
    await meetingManager.initialize();
    console.log(`✅ Meeting manager initialized`);
    console.log();

    // Step 4: Test Meeting Session Creation
    console.log("4️⃣ Testing meeting session creation...");
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
      testUserId,
      testRoomId,
      testRoomName
    );
    console.log(`✅ Meeting started: ${startResult.success}`);
    console.log(`   - Message: ${startResult.message}`);
    console.log();

    // Step 5: Simulate Message Capture
    console.log("5️⃣ Simulating message capture...");
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

    // Step 6: End Meeting and Generate Minutes
    console.log("6️⃣ Ending meeting and generating minutes...");
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

    // Step 7: Check if minutes were generated
    console.log("7️⃣ Checking generated meeting minutes...");
    if (endResult.minutes) {
      console.log(`✅ Meeting minutes generated (${endResult.minutes.content.length} characters)`);
      console.log(`   - File path: ${endResult.minutes.filePath}`);
      console.log();

      // Step 8: Display Generated Minutes Preview
      console.log("8️⃣ Generated minutes preview:");
      console.log("=" .repeat(60));
      console.log(endResult.minutes.content.substring(0, 500) + "...");
      console.log("=" .repeat(60));
      console.log();
    } else {
      console.log("❌ No meeting minutes were generated");
      console.log();
    }

    console.log("🎉 All tests completed successfully!");
    console.log();
    console.log("📁 Check the following locations for generated files:");
    if (config.storage.provider === "local") {
      console.log(`   - Local directory: ${config.storage.local?.directory || '../data/meetings'}`);
    }
    console.log("   - Meeting files should be organized by channel/date");

  } catch (error) {
    console.error("❌ Test failed:", error);
    console.error(error.stack);
  }
}

// Run the test
if (import.meta.main) {
  await testBotFunctionality();
}