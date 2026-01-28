import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ScheduleService } from "../../schedule/service";
import { BoardService } from "../../board/service";

// Mock ScheduleService
jest.mock("../../schedule/service", () => ({
	ScheduleService: {
		register: jest.fn(),
		createJob: jest.fn(),
	},
}));

// Mock BoardService
jest.mock("../../board/service", () => ({
	BoardService: {
		refreshActivity: jest.fn(),
	},
}));

// Mock modular-rest/server since LeitnerService uses it
jest.mock("@modular-rest/server", () => ({
	getCollection: jest.fn(),
	Schema: class { },
	defineCollection: jest.fn(),
	Permission: class { },
	schemas: { file: {} },
}));

// Mocks already imported at top

describe("Leitner Box Activity Toasting", () => {
	let registeredCallback: (args: any) => Promise<void>;
	let LeitnerService: any;

	beforeEach(() => {
		// Reset mocks between tests to ensure a clean state
		jest.clearAllMocks();

		/**
		 * EXPLANATION:
		 * We use 'require' here to ensure that the LeitnerService module is evaluated 
		 * AFTER our mocks (ScheduleService, BoardService) are established.
		 * This is crucial because LeitnerService registers its global job at the top-level
		 * of the file, which executes immediately upon import/require.
		 */
		LeitnerService = require("../service").LeitnerService;

		// Access the underlying mock function for ScheduleService.register
		const registerMock = ScheduleService.register as jest.Mock;
		const calls = registerMock.mock.calls;

		/**
		 * EXPLANATION:
		 * We find the callback that was passed to ScheduleService.register for 'leitner-review-job'.
		 * This allows us to manually trigger the job's logic in our tests and verify its behavior.
		 */
		const leitnerCall = calls.find((call: any) => call[0] === 'leitner-review-job');
		if (leitnerCall) {
			registeredCallback = leitnerCall[1] as any;
		}
	});

	/**
	 * BEHAVIOR: Job Registration
	 * Ensures that the system correctly hooks into the global scheduling service
	 * during initialization.
	 */
	it("should register the leitner-review-job with the scheduling service", () => {
		expect(ScheduleService.register).toHaveBeenCalledWith(
			"leitner-review-job",
			expect.any(Function)
		);
	});

	/**
	 * BEHAVIOR: Notification Triggering
	 * Verifies that when a scheduled review job runs, it checks for due items
	 * and successfully toasts an activity card on the user's dashboard.
	 */
	it("should toast board activity when the user has items due for review", async () => {
		if (!registeredCallback) {
			throw new Error("leitner-review-job callback was not registered");
		}

		// ARRANGE: Simulate that the user has 5 items ready for review (getDueCount > 0)
		jest.spyOn(LeitnerService, 'getDueCount').mockResolvedValue(5);

		const userId = "user123";

		// ACT: Manually trigger the scheduled job callback
		await registeredCallback({ userId });

		// ASSERT: Verify that BoardService.refreshActivity was called with 'shouldToast: true'
		expect(BoardService.refreshActivity).toHaveBeenCalledWith(
			userId,
			"leitner_review",
			{ dueCount: 5, isActive: true },
			true, // shouldToast: true
			"singleton",
			undefined,
			true // persistent
		);
	});

	/**
	 * BEHAVIOR: Conditional Notification
	 * Ensures that we don't spam the user with empty notifications if they
	 * have nothing to review at the scheduled time.
	 */
	it("should NOT toast board activity if the user has no items due for review", async () => {
		if (!registeredCallback) {
			throw new Error("leitner-review-job callback was not registered");
		}

		// ARRANGE: Simulate that the user has 0 items ready for review
		jest.spyOn(LeitnerService, 'getDueCount').mockResolvedValue(0);

		const userId = "user123";

		// ACT: Manually trigger the scheduled job callback
		await registeredCallback({ userId });

		// ASSERT: Verify that refreshActivity was NOT called since there's nothing to show
		expect(BoardService.refreshActivity).not.toHaveBeenCalled();
	});
});
