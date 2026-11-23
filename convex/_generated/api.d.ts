/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as admin from "../admin.js";
import type * as branding from "../branding.js";
import type * as dashboard from "../dashboard.js";
import type * as deadlines from "../deadlines.js";
import type * as projectVendors from "../projectVendors.js";
import type * as projectViews from "../projectViews.js";
import type * as report from "../report.js";
import type * as requirements from "../requirements.js";
import type * as scoreTotals from "../scoreTotals.js";
import type * as scorerHistory from "../scorerHistory.js";
import type * as scorerNames from "../scorerNames.js";
import type * as scores from "../scores.js";
import type * as security from "../security.js";
import type * as vendorAnswerBackfill from "../vendorAnswerBackfill.js";
import type * as vendorAnswers from "../vendorAnswers.js";
import type * as vendorAuth from "../vendorAuth.js";
import type * as vendorDeadlines from "../vendorDeadlines.js";
import type * as vendorHistoryBackfill from "../vendorHistoryBackfill.js";
import type * as workspaceSeed from "../workspaceSeed.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  admin: typeof admin;
  branding: typeof branding;
  dashboard: typeof dashboard;
  deadlines: typeof deadlines;
  projectVendors: typeof projectVendors;
  projectViews: typeof projectViews;
  report: typeof report;
  requirements: typeof requirements;
  scoreTotals: typeof scoreTotals;
  scorerHistory: typeof scorerHistory;
  scorerNames: typeof scorerNames;
  scores: typeof scores;
  security: typeof security;
  vendorAnswerBackfill: typeof vendorAnswerBackfill;
  vendorAnswers: typeof vendorAnswers;
  vendorAuth: typeof vendorAuth;
  vendorDeadlines: typeof vendorDeadlines;
  vendorHistoryBackfill: typeof vendorHistoryBackfill;
  workspaceSeed: typeof workspaceSeed;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
