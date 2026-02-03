import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { ScheduleService } from "../service";
import schedule from "node-schedule";
import { getCollection } from "@modular-rest/server";
import parser from "cron-parser";

// Mock modular-rest/server
jest.mock("@modular-rest/server", () => ({
	getCollection: jest.fn(),
	Schema: class { },
	defineCollection: jest.fn(),
	Permission: class { },
}));

// Mock cron-parser
jest.mock("cron-parser", () => ({
	parseExpression: jest.fn(() => ({
		prev: () => ({
			toDate: () => new Date(Date.now() - 1000) // Default to 1 second ago for tests
		})
	}))
}));

// Mock node-schedule
jest.mock("node-schedule", () => ({
	scheduleJob: jest.fn(),
	scheduledJobs: {},
}));

describe("ScheduleService", () => {
	let mockCollection: any;

	beforeEach(() => {
		jest.clearAllMocks();
		mockCollection = {
			find: jest.fn(),
			findOne: jest.fn(),
			findOneAndUpdate: jest.fn(),
			updateOne: jest.fn(),
			create: jest.fn(),
			deleteOne: jest.fn(),
		};
		(getCollection as any).mockResolvedValue(mockCollection);

		// Reset registry
		(ScheduleService as any).registry = new Map();
		(ScheduleService as any).processingQueue = false;
	});

	describe("register", () => {
		it("should add a function to the registry", () => {
			const callback = jest.fn() as any;
			ScheduleService.register("test-fn", callback);
			expect((ScheduleService as any).registry.get("test-fn")).toBe(callback);
		});
	});

	describe("init", () => {
		it("should initialize active jobs from the database", async () => {
			const mockJobs = [
				{ name: "job1", cronExpression: "* * * * *", functionId: "fn1", args: {}, jobType: "recurrent" },
				{ name: "job2", cronExpression: "0 0 * * *", functionId: "fn2", args: { x: 1 }, jobType: "recurrent" },
			];
			mockCollection.find.mockResolvedValue(mockJobs);

			await ScheduleService.init();

			expect(mockCollection.find).toHaveBeenCalledWith({});
			expect(schedule.scheduleJob).toHaveBeenCalledTimes(2);
		});
	});

	describe("createJob", () => {
		it("should create a new job if it doesn't exist", async () => {
			mockCollection.findOne.mockResolvedValue(null);
			const options = {
				cronExpression: "* * * * *",
				functionId: "test-fn",
				args: { foo: "bar" },
				executionType: "normal" as const,
				jobType: "recurrent" as const,
			};

			await ScheduleService.createJob("new-job", "test-fn", options);

			expect(mockCollection.create).toHaveBeenCalledWith(expect.objectContaining({
				name: "new-job",
				functionId: "test-fn",
				state: "scheduled",
			}));
			expect(schedule.scheduleJob).toHaveBeenCalled();
		});

		it("should update an existing job", async () => {
			mockCollection.findOne.mockResolvedValue({ name: "existing-job" });
			const options = {
				cronExpression: "0 0 * * *",
				functionId: "updated-fn",
			};

			await ScheduleService.createJob("existing-job", "updated-fn", options);

			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ name: "existing-job" },
				expect.objectContaining({ $set: expect.not.objectContaining({ status: "active" }) })
			);
			expect(schedule.scheduleJob).toHaveBeenCalled();
		});

		it("should save timezone to database", async () => {
			mockCollection.findOne.mockResolvedValue(null);
			const options = {
				cronExpression: "* * * * *",
				functionId: "test-fn",
				timeZone: "Asia/Tokyo"
			};

			await ScheduleService.createJob("tz-create-job", "test-fn", options);

			expect(mockCollection.create).toHaveBeenCalledWith(expect.objectContaining({
				name: "tz-create-job",
				timeZone: "Asia/Tokyo"
			}));
		});
	});

	describe("deleteJob", () => {
		it("should cancel moving job and delete from database", async () => {
			const mockJob = { cancel: jest.fn() };
			(schedule.scheduledJobs as any)["job-to-delete"] = mockJob;

			await ScheduleService.deleteJob("job-to-delete");

			expect(mockJob.cancel).toHaveBeenCalled();
			expect(mockCollection.deleteOne).toHaveBeenCalledWith({ name: "job-to-delete" });
		});
	});

	describe("Execution Logic", () => {
		it("should execute Immediate jobs immediately after claiming", async () => {
			const jobData = {
				name: "immediate-job",
				functionId: "fn",
				executionType: "Immediate",
				jobType: "recurrent",
				cronExpression: "* * * * *",
				state: "scheduled",
			};

			const callback = jest.fn() as any;
			callback.mockResolvedValue(undefined);
			ScheduleService.register("fn", callback);

			// Mock scheduleJob callback trigger
			let jobCallback: any;
			(schedule.scheduleJob as jest.Mock).mockImplementation((name, cron, cb) => {
				jobCallback = cb;
				return { cancel: jest.fn() };
			});

			await ScheduleService.scheduleJobInternal(jobData);

			// Mock the findOneAndUpdate result for claiming
			mockCollection.findOneAndUpdate.mockResolvedValue({
				_id: "id1",
				...jobData,
				state: "executing"
			});

			// Trigger the scheduled job
			await jobCallback();

			expect(mockCollection.findOneAndUpdate).toHaveBeenCalled();
			expect(callback).toHaveBeenCalled();
			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ _id: "id1" },
				expect.objectContaining({ $set: expect.objectContaining({ state: "scheduled" }) })
			);
		});

		it("should handle 'once' jobs and mark them as executed", async () => {
			const jobData = {
				name: "once-job",
				functionId: "fn",
				executionType: "Immediate",
				jobType: "once",
				runAt: new Date(Date.now() + 10000),
				state: "scheduled",
			};

			const callback = jest.fn() as any;
			ScheduleService.register("fn", callback);

			let jobCallback: any;
			(schedule.scheduleJob as jest.Mock).mockImplementation((name, time, cb) => {
				jobCallback = cb;
				return { cancel: jest.fn() };
			});

			await ScheduleService.scheduleJobInternal(jobData);
			mockCollection.findOneAndUpdate.mockResolvedValue({ _id: "id2", ...jobData, state: "executing" });

			await jobCallback();

			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ _id: "id2" },
				expect.objectContaining({ $set: expect.objectContaining({ state: "executed" }) })
			);
		});

		it("should mark job as failed if registered function throws error", async () => {
			const jobData = {
				name: "failing-job",
				functionId: "fail-fn",
				executionType: "Immediate",
				jobType: "recurrent",
				cronExpression: "* * * * *",
				state: "scheduled",
			};

			const callback = jest.fn() as any;
			callback.mockRejectedValue(new Error("Test error"));
			ScheduleService.register("fail-fn", callback);

			let jobCallback: any;
			(schedule.scheduleJob as jest.Mock).mockImplementation((name, cron, cb) => {
				jobCallback = cb;
				return { cancel: jest.fn() };
			});

			await ScheduleService.scheduleJobInternal(jobData);
			mockCollection.findOneAndUpdate.mockResolvedValue({ _id: "id3", ...jobData, state: "executing" });

			await jobCallback();

			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ _id: "id3" },
				expect.objectContaining({ $set: expect.objectContaining({ state: "failed" }) })
			);
		});

		it("should queue normal jobs and process them sequentially", async () => {
			const jobData = {
				name: "normal-job",
				functionId: "fn",
				executionType: "normal",
				jobType: "recurrent",
				cronExpression: "* * * * *",
				state: "scheduled",
			};

			const callback = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 10))) as any;
			ScheduleService.register("fn", callback);

			let jobCallback: any;
			(schedule.scheduleJob as jest.Mock).mockImplementation((name, cron, cb) => {
				jobCallback = cb;
				return { cancel: jest.fn() };
			});

			await ScheduleService.scheduleJobInternal(jobData);

			// 1. Trigger fires, moves to 'queued'
			mockCollection.findOneAndUpdate
				.mockResolvedValueOnce({ ...jobData, state: "queued" }) // Trigger claim
				.mockResolvedValueOnce({ _id: "id1", ...jobData, state: "executing" }) // Queue processing find next
				.mockResolvedValueOnce(null); // Queue processing find next (empty)

			await jobCallback();
			// Wait for the fire-and-forget processQueue to complete
			for (let i = 0; i < 20; i++) {
				if (!(ScheduleService as any).processingQueue) break;
				await new Promise(resolve => setTimeout(resolve, 50));
			}

			expect(mockCollection.findOneAndUpdate).toHaveBeenCalledTimes(3);
			expect(callback).toHaveBeenCalled();
			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ _id: "id1" },
				expect.objectContaining({ $set: expect.objectContaining({ state: "scheduled" }) })
			);
		});
	});

	describe("Catch-up Mechanism", () => {
		it("should trigger catch-up for recurrent jobs with catchUp enabled and missed runs", async () => {
			const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
			const mockJobs = [
				{
					_id: "job-id",
					name: "catchup-job",
					cronExpression: "0 9 */1 * *", // Every day at 9 AM
					functionId: "fn",
					args: { test: 123 },
					jobType: "recurrent",
					catchUp: true,
					lastRun: pastDate,
					createdAt: pastDate,
					executionType: "Immediate"
				}
			];
			mockCollection.find.mockResolvedValue(mockJobs);
			mockCollection.findOneAndUpdate
				.mockResolvedValueOnce({ ...mockJobs[0], state: "executing" })
				.mockResolvedValue(null);

			const callback = jest.fn() as any;
			ScheduleService.register("fn", callback);

			await ScheduleService.init();

			// Verify catch-up was triggered
			expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
				expect.objectContaining({ name: "catchup-job", state: { $in: ["scheduled", "executed", "failed"] } }),
				expect.objectContaining({ $set: { state: "executing" } }),
				expect.any(Object)
			);
			expect(callback).toHaveBeenCalledWith(expect.objectContaining({
				test: 123,
				expectedTime: expect.any(Date),
				executedTime: expect.any(Date)
			}));
		});

		it("should NOT trigger catch-up if catchUp is false", async () => {
			const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
			const mockJobs = [
				{
					name: "no-catchup-job",
					cronExpression: "0 9 */1 * *",
					functionId: "fn",
					jobType: "recurrent",
					catchUp: false,
					lastRun: pastDate,
					createdAt: pastDate
				}
			];
			mockCollection.find.mockResolvedValue(mockJobs);
			mockCollection.findOneAndUpdate.mockResolvedValue(null);

			await ScheduleService.init();

			// In init(), checkCatchUp should not have called it, but processQueue will
			expect(mockCollection.findOneAndUpdate).toHaveBeenCalled();
		});

		it("should pass expectedTime and executedTime to non-catchup jobs too", async () => {
			const jobData = {
				name: "normal-job",
				functionId: "fn",
				executionType: "Immediate",
				jobType: "recurrent",
				cronExpression: "* * * * *",
				state: "scheduled",
				args: {}
			};

			const callback = jest.fn() as any;
			ScheduleService.register("fn", callback);

			let jobCallback: any;
			(schedule.scheduleJob as jest.Mock).mockImplementation((name, cron, cb) => {
				jobCallback = cb;
				return { cancel: jest.fn() };
			});

			await ScheduleService.scheduleJobInternal(jobData);
			mockCollection.findOneAndUpdate
				.mockResolvedValueOnce({ _id: "id", ...jobData, state: "executing" })
				.mockResolvedValue(null);

			await jobCallback();

			expect(callback).toHaveBeenCalledWith(expect.objectContaining({
				expectedTime: expect.any(Date),
				executedTime: expect.any(Date)
			}));
		});

		it("should use timezone when calculating past occurrences", async () => {
			const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
			const mockJobs = [
				{
					name: "catchup-tz-job",
					cronExpression: "0 9 */1 * *",
					functionId: "fn",
					jobType: "recurrent",
					catchUp: true,
					lastRun: pastDate,
					createdAt: pastDate,
					timeZone: "America/New_York"
				}
			];
			mockCollection.find.mockResolvedValue(mockJobs);
			mockCollection.findOneAndUpdate.mockResolvedValue(null);

			await ScheduleService.init();

			expect(parser.parseExpression).toHaveBeenCalledWith(
				"0 9 */1 * *",
				expect.objectContaining({ tz: "America/New_York" })
			);
		});
	});

	describe("TimeZone Support", () => {
		it("should schedule job with timezone if provided", async () => {
			const jobData = {
				name: "tz-job",
				functionId: "fn",
				cronExpression: "0 0 12 * * *",
				timeZone: "America/New_York",
				state: "scheduled",
				jobType: "recurrent",
			};

			await ScheduleService.scheduleJobInternal(jobData);

			expect(schedule.scheduleJob).toHaveBeenCalledWith(
				"tz-job",
				{ rule: "0 0 12 * * *", tz: "America/New_York" },
				expect.any(Function)
			);
		});

		it("should schedule normal cron string if no timezone provided", async () => {
			const jobData = {
				name: "no-tz-job",
				functionId: "fn",
				cronExpression: "0 0 12 * * *",
				state: "scheduled",
				jobType: "recurrent",
			};

			await ScheduleService.scheduleJobInternal(jobData);

			expect(schedule.scheduleJob).toHaveBeenCalledWith(
				"no-tz-job",
				"0 0 12 * * *",
				expect.any(Function)
			);
		});
	});
});
