import { cronJobs, makeFunctionReference } from "convex/server";
const jobs=cronJobs();
jobs.interval("retry undelivered request events",{minutes:5},makeFunctionReference<"mutation">("delivery:retry"));
export default jobs;
