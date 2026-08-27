import * as path from "path";
import { createRest, CmsTrigger, getCollection } from "@modular-rest/server";
import { permissionGroups } from "./permissions";
import fs from "fs";
import { authTriggers } from "./triggers";
// Load .env file
require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

function getKeys() {
  if (process.env.PRIVATE_KEY && process.env.PUBLIC_KEY) {
    return {
      private: process.env.PRIVATE_KEY,
      public: process.env.PUBLIC_KEY,
    };
  }

  try {
    return {
      private: fs.readFileSync(
        path.join(__dirname, "..", "keys", "private.pem"),
        "utf8"
      ),
      public: fs.readFileSync(
        path.join(__dirname, "..", "keys", "public.pem"),
        "utf8"
      ),
    };
  } catch (error) {
    return undefined;
  }
}

// Create the rest server
// The createRest function returns a promise
const app = createRest({
  port: parseInt(process.env.PORT || "8080"),
  modulesPath: path.join(__dirname, "../dist", "modules"),
  uploadDirectory: path.join(__dirname, "../dist", "uploads"),
  keypair: getKeys(),
  cors: {
    origin(ctx: any) {
      const requestOrigin = ctx.get("Origin") as string;
      const allowedOrigins = [
        // All
        "*",

        //dev
        "http://localhost:3000",

        // Subturtle domains
        "https://subturtle.app",
        "https://www.subturtle.app",
        "https://www.dashboard.subturtle.app",
        "https://dashboard.subturtle.app",

        // Chrome extension - prod
        "chrome-extension://",
        "https://www.youtube.com",
        "https://www.netflix.com",
        "https://teams.microsoft.com",
        "https://meet.google.com",
      ];

      // Handle requests without Origin header (like direct API calls)
      if (!requestOrigin) {
        console.warn("Request without Origin header detected");
        return false; // Reject requests without origin in production
      }

      // Check if the origin is in our allowed list
      for (const origin of allowedOrigins) {
        if (origin === "*") {
          return requestOrigin;
        }

        if (requestOrigin.startsWith(origin)) {
          return requestOrigin;
        }
      }

      // In production, reject unauthorized origins
      return false;
    },
  },
  // Expose the raw request body so the Stripe webhook can verify signatures.
  koaBodyOptions: {
    includeUnparsed: true,
  },
  mongo: {
    mongoBaseAddress:
      process.env.MONGO_BASE_ADDRESS || "mongodb://localhost:27017",
    dbPrefix: process.env.MONGO_DB_PREFIX || "subturtle_",
  },
  staticPath: {
    directory: path.join(__dirname, "public"),
    urlPath: "/",
  },
  adminUser: {
    email: process.env.ADMIN_EMAIL || "",
    password: process.env.ADMIN_PASSWORD || "",
  },
  verificationCodeGeneratorMethod: function () {
    return "123456";
  },
  permissionGroups,
  authTriggers: authTriggers,
}).then((app) => {
  // Initialize Schedule Service
  const {
    ScheduleService,
  } = require("./modules/schedule/service");
  const { LeitnerService } = require("./modules/leitner_box/service");
  const { PoolService } = require("./modules/pool/service");

  ScheduleService.register("generate-daily-bundles", async (args: any) => {
    console.log("[Schedule] Running generate-daily-bundles...");
    await LeitnerService.generateDailyBundles();
  });

  // Daily Pool age-out: promote pooled phrases past each user's cut-off into L1.
  ScheduleService.register("pool-age-out", async () => {
    console.log("[Schedule] Running pool-age-out...");
    await PoolService.ageOutAllUsers();
  });

  ScheduleService.init();

  // Ensure the daily Pool age-out sweep exists (idempotent upsert keyed on job
  // name). Cron is interpreted in server-local time; the sweep is safe to run more
  // than once a day because PoolService.promote is idempotent.
  ScheduleService.createJob("pool-age-out", "pool-age-out", {
    cronExpression: "0 3 * * *",
    jobType: "recurrent",
    catchUp: true,
  }).catch((err: any) => console.error("[Schedule] Failed to create pool-age-out job", err));

  // Log whether the Stripe catalog + portal config are in place, so you can tell
  // from the server logs whether `yarn setup:stripe` still needs to be run.
  // Fire-and-forget; verifyStripeSetup never throws (the catch is belt-and-braces).
  const {
    verifyStripeSetup,
  } = require("./modules/subscription/stripe-setup-check");
  verifyStripeSetup().catch((err: any) =>
    console.warn("[stripe-setup] check failed:", err?.message || err)
  );
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
