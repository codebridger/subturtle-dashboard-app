import { DatabaseTrigger } from "@modular-rest/server";
import { LeitnerService } from "../leitner_box/service";

/**
 * Synchronizes the Leitner schedule when a user's timezone changes.
 * 
 * Use Case:
 * A user travels from London to Tokyo and updates their profile timezone.
 * Without this sync, their daily review notification would still trigger at 10 AM London time (which is evening in Tokyo).
 * This trigger detects the change and reschedules the job to 10 AM Tokyo time immediately.
 */
const syncScheduleOnTimezoneChange = async (context: any) => {
	const { queryResult, query, update } = context;

	// Optimization: Only sync if timeZone is being updated
	const isTimezoneUpdated =
		(update && update.timeZone) ||
		(update && update.$set && update.$set.timeZone);

	if (!isTimezoneUpdated) {
		return;
	}

	try {
		// If we have a document with refId (standard profile doc)
		let refId = null;

		if (queryResult && queryResult.refId) {
			refId = queryResult.refId;
		}

		// If updateOne was used, the filter is usually in context.query (modular-rest specific)
		if (!refId && query && query.refId) {
			refId = query.refId;
		}

		if (refId) {
			console.log(`[ProfileTrigger] Syncing schedule for user ${refId}`);
			await LeitnerService.resyncSchedule(refId);
		}
	} catch (err) {
		console.error("[ProfileTrigger] Error syncing schedule:", err);
	}
};

const scheduleSyncTrigger = new DatabaseTrigger("update-one", async (context) => {
	await syncScheduleOnTimezoneChange(context);
});

// We also want to catch findOneAndUpdate if used.
const scheduleSyncTriggerFindAndModify = new DatabaseTrigger("find-one-and-update", async (context) => {
	await syncScheduleOnTimezoneChange(context);
});

export default [scheduleSyncTrigger, scheduleSyncTriggerFindAndModify];
