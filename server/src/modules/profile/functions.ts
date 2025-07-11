import { defineFunction, reply, getCollection } from "@modular-rest/server";
import {
  clearUserSubscriptions,
  clearUserFreemiumAllocations,
  clearUserUsageRecords,
} from "../subscription/service";
import { updateUserProfile } from "./service";
import { DATABASE, PROFILE_COLLECTION } from "../../config";
import * as fs from "fs";
import * as path from "path";

/**
 * Upload profile picture
 */
const uploadProfilePicture = defineFunction({
  name: "uploadProfilePicture",
  permissionTypes: ["user_access"],
  callback: async (params) => {
    const { file, userId } = params;

    if (!userId) {
      throw new Error("User ID is required");
    }

    if (!file || !file.buffer || !file.mimetype) {
      throw new Error("Invalid file data");
    }

    // Validate file type
    if (!file.mimetype.startsWith("image/")) {
      throw new Error("Only image files are allowed");
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.buffer.length > maxSize) {
      throw new Error("File size must be less than 5MB");
    }

    try {
      // Generate unique filename
      const fileExtension = path.extname(file.originalname || "image.jpg");
      const fileName = `profile_${userId}_${Date.now()}${fileExtension}`;

      // Create uploads directory in public folder if it doesn't exist
      const uploadsDir = path.join(__dirname, "../../../public/uploads");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      // Save file to uploads directory
      const filePath = path.join(uploadsDir, fileName);
      fs.writeFileSync(filePath, file.buffer);

      // Generate public URL
      const publicUrl = `/uploads/${fileName}`;

      // Update profile with new picture URL
      const profileCollection = getCollection(DATABASE, PROFILE_COLLECTION);
      await profileCollection.updateOne(
        { refId: userId },
        { $set: { gPicture: publicUrl } },
        { upsert: true }
      );

      reply.create("s", {
        message: "Profile picture uploaded successfully",
        url: publicUrl,
      });
    } catch (error: any) {
      reply.create("e", {
        message: `Failed to upload profile picture: ${error.message}`,
      });
    }
  },
});

/**
 * Update user profile information
 */
const updateProfile = defineFunction({
  name: "updateProfile",
  permissionTypes: ["user_access"],
  callback: async (params) => {
    const { name, gPicture } = params;
    const userId = params.userId || params.user?.id;

    if (!userId) {
      throw new Error("User ID is required");
    }

    try {
      await updateUserProfile(
        {
          refId: userId,
          name,
          gPicture,
        },
        true
      );

      reply.create("s", {
        message: "Profile updated successfully",
      });
    } catch (error: any) {
      reply.create("e", {
        message: `Failed to update profile: ${error.message}`,
      });
    }
  },
});

/**
 * Remove subscription and freemium allocation for a user
 * It's for testing purposes
 */
const clearSubscriptionAndFreemium = defineFunction({
  name: "clearSubscriptionAndFreemium",
  permissionTypes: ["user_access"],
  callback: async (params) => {
    const { userId } = params;

    if (!userId) {
      throw new Error("User ID is required");
    }

    try {
      // Clear all subscription data for the user
      const subscriptionResult = await clearUserSubscriptions(userId);
      console.log("Subscription clearing result:", subscriptionResult);

      // Clear all freemium allocations for the user
      const freemiumResult = await clearUserFreemiumAllocations(userId);
      console.log("Freemium clearing result:", freemiumResult);

      // Clear all usage records for the user
      const usageResult = await clearUserUsageRecords(userId);
      console.log("Usage records clearing result:", usageResult);

      reply.create("s", {
        message: "Successfully cleared subscription and freemium data for user",
        details: {
          subscriptions: subscriptionResult,
          freemium: freemiumResult,
          usage: usageResult,
        },
      });
    } catch (error: any) {
      reply.create("e", {
        message: `Failed to clear data: ${error.message}`,
      });
    }
  },
});

module.exports.functions = [
  uploadProfilePicture,
  updateProfile,
  clearSubscriptionAndFreemium,
];
