#!/usr/bin/env tsx
import "dotenv/config";
import { runScan } from "../scan.js";
import { sendTelegram } from "../lib/telegram.js";

const echo = process.argv.includes("--echo");

(async () => {
  if (echo) {
    const ok = await sendTelegram("<b>✅ Taiwan-Max-forex monitor online</b>\nscan-once echo test");
    console.log(JSON.stringify({ echo: true, telegramOk: ok }));
    return;
  }
  const result = await runScan();
  console.log(JSON.stringify(result, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
