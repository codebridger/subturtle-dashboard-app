import { defineCollection, Permission, Schema } from "@modular-rest/server";
import { DATABASE, LIVE_SESSION_TEXT_COLLECTION } from "../../config";
import type { TextSessionRecordType } from "./types";
import { extractTextCostCalculationInput } from "./utils";
import { calculatorService } from "../subscription/calculator";

const textSessionSchema = new Schema<TextSessionRecordType>(
  {
    refId: { type: String, required: true },
    instructions: { type: String, required: true },
    toolDeclarations: { type: [Object], default: [] },
    session: { type: Object, default: {} },
    contents: { type: [Object], default: [] },
    dialogs: { type: [Object], default: [] },
    usage: { type: Object },
    metadata: { type: Object, default: {} },
    // The learning language and the Coach's explanation language (B-13). Missing on
    // sessions from before multilingual: English.
    language: { type: String },
    explanationLanguage: { type: String },
    cacheName: { type: String },
    cacheExpireTime: { type: Number },
    cacheDisabled: { type: Boolean, default: false },
    textChatConsumed: { type: Boolean, default: false },
    textChatRefunded: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

textSessionSchema.virtual("cost").get(function (this: any) {
  if (!this.usage) return {};
  return calculatorService.calculateCosts(
    extractTextCostCalculationInput(this.usage, this.session?.model)
  );
});

const sixMonths = 6 * 30 * 24 * 60 * 60;
textSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: sixMonths });

const textSessionCollection = defineCollection({
  database: DATABASE,
  collection: LIVE_SESSION_TEXT_COLLECTION,
  schema: textSessionSchema,
  permissions: [
    new Permission({
      accessType: "user_access",
      read: true,
      write: true,
      onlyOwnData: true,
      ownerIdField: "refId",
    }),
  ],
});

module.exports = [textSessionCollection];
