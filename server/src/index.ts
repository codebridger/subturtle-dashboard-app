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
      const requestOrigin = ctx.get("Origin");
      const allowedOrigins = [
        "https://www.youtube.com",
        "https://www.netflix.com",
        "https://www.subturtle.app",
        "https://subturtle.app",
        "https://www.dashboard.subturtle.app",
        "https://dashboard.subturtle.app",
      ];

      // Handle requests without Origin header (like direct API calls)
      if (!requestOrigin) {
        console.warn("Request without Origin header detected");
        return false; // Reject requests without origin in production
      }

      // Check if the origin is in our allowed list
      if (allowedOrigins.includes(requestOrigin)) {
        return requestOrigin;
      }

      // Log suspicious requests for monitoring
      console.warn(
        `Blocked CORS request from unauthorized origin: ${requestOrigin}`
      );

      // In production, reject unauthorized origins
      return false;
    },
  },
  mongo: {
    mongoBaseAddress:
      process.env.MONGO_BASE_ADDRESS || "mongodb://localhost:27017",
    dbPrefix: process.env.MONGO_DB_PREFIX || "subturtle_",
  },
  staticPath: {
    actualPath: path.join(__dirname, "public"),
    path: "/",
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
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
