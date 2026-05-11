import { z } from "zod";

const csvNumber = z
  .string()
  .transform((s) => s.split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0));

const Schema = z.object({
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 chars"),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  NOTIONAL_TWD_LADDER: csvNumber.optional(),
  BANKEE_FREE_WITHDRAW: z.string().optional(),

  // Phase C+
  MAX_ACCESSKEY: z.string().optional(),
  MAX_SECRET: z.string().optional(),

  // Phase D (forward-compat)
  MAX_LIVE: z.string().optional(),
  KILL_SWITCH: z.string().optional(),
});

export type Env = z.infer<typeof Schema>;

export interface Settings {
  cronSecret: string;
  telegram: { botToken: string; chatId: string } | null;
  notionalLadder: number[];
  bankeeFreeWithdraw: boolean;
  maxAccessKey: string | null;
  maxSecret: string | null;
  liveTrading: boolean;
  killSwitch: boolean;
}

export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const parsed = Schema.parse(env);
  return {
    cronSecret: parsed.CRON_SECRET,
    telegram: parsed.TELEGRAM_BOT_TOKEN && parsed.TELEGRAM_CHAT_ID
      ? { botToken: parsed.TELEGRAM_BOT_TOKEN, chatId: parsed.TELEGRAM_CHAT_ID }
      : null,
    notionalLadder: parsed.NOTIONAL_TWD_LADDER ?? [100_000, 500_000, 2_000_000],
    bankeeFreeWithdraw: truthy(parsed.BANKEE_FREE_WITHDRAW),
    maxAccessKey: parsed.MAX_ACCESSKEY ?? null,
    maxSecret: parsed.MAX_SECRET ?? null,
    liveTrading: truthy(parsed.MAX_LIVE),
    killSwitch: truthy(parsed.KILL_SWITCH),
  };
}

function truthy(v: string | undefined): boolean {
  return v === "true" || v === "1" || v === "yes";
}
