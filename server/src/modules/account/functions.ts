import { defineFunction } from "@modular-rest/server";
import { deleteUserAccount } from "./service";

/**
 * Permanently deletes the signed-in user's account and all of its data, after canceling any
 * live Stripe subscription (see service.ts). Args: { userId }.
 *
 * userId is required: the /function/run caller guard (src/function-caller-guard.ts) pins it
 * to the token's user, so a user can only ever delete their own account. Without a userId
 * the guard has nothing to check, hence the hard requirement here.
 */
const deleteAccount = defineFunction({
  name: "delete-account",
  permissionTypes: ["user_access"],
  callback: async (params) => {
    const { userId } = params || {};
    if (!userId) throw new Error("User ID is required");

    return deleteUserAccount(String(userId));
  },
});

module.exports.functions = [deleteAccount];
