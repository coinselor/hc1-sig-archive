#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --unstable-kv

const kv = await Deno.openKv();
console.log("Clearing all KV entries...");

const entries = kv.list({ prefix: [] });
let count = 0;
for await (const entry of entries) {
  console.log('Deleting key:', entry.key);
  await kv.delete(entry.key);
  count++;
}

kv.close();
console.log(`Cleared ${count} KV entries`);