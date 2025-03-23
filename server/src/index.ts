import * as path from "path";
import { createRest, CmsTrigger, getCollection } from "@modular-rest/server";
import { permissionGroups } from "./permissions";
import fs from "fs";
// Load .env file
require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

function getKeys() {
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
  modulesPath: path.join(__dirname, '../dist', "modules"),
  uploadDirectory: path.join(__dirname, '../dist', "uploads"),
  keypair: process.env.KEYPAIR ? getKeys() : undefined,
  mongo: {
    mongoBaseAddress:
      process.env.MONGO_BASE_ADDRESS || "mongodb://localhost:27017",
    dbPrefix: "subturtle_",
  },
  staticPath: {
    rootDir: path.join(__dirname, "public"),
    rootPath: "/",
  },
  adminUser: {
    email: process.env.ADMIN_EMAIL || "",
    password: process.env.ADMIN_PASSWORD || "",
  },
  verificationCodeGeneratorMethod: function () {
    return "123456";
  },
  permissionGroups,
  authTriggers: [
    new CmsTrigger("insert-one", (context) => {
      // console.log("User created", context);

      getCollection("user_content", "phrase_bundle").insertMany([
        {
          refId: context.queryResult._id,
          title: "Default Bundle",
          phrases: [],
        },
      ]);
    }),
  ],
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
