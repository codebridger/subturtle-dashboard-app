import { defineCollection, Permission, Schema } from "@modular-rest/server";
import { DATABASE, LIVE_SESSION_COLLECTION } from "../../config";
import type { LiveSessionRecordType } from "./types";
import { extractCostCalculationInput } from "./utils";
import {
  calculatorService,
  CalculatorService,
} from "../subscription/calculator";

const liveSessionSchema = new Schema<LiveSessionRecordType>(
  {
    type: { type: String, required: true },
    refId: { type: String, required: true },
    session: { type: Object, required: true },
    usage: { type: Object },
    dialogs: { type: Array<Object>, default: [] },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

liveSessionSchema.virtual("cost").get(function (this: any) {
  if (!this.usage) return {};

  const expenses = extractCostCalculationInput(this.usage);
  return calculatorService.calculateCosts(expenses);
});

const sixMonths = 6 * 30 * 24 * 60 * 60;
liveSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: sixMonths });

const liveSessionCollection = defineCollection({
  database: DATABASE,
  collection: LIVE_SESSION_COLLECTION,
  schema: liveSessionSchema,
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

module.exports = [liveSessionCollection];
