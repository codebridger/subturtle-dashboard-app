/**
 * Locks modular-rest's `/data-provider/*` routes to the signed-in user's own data.
 *
 * The data provider lets a client run find / update / insert / remove / aggregate on any
 * collection its permission list opens to it. modular-rest's `checkAccess` grants a
 * `user_access` permission to every signed-in user, for read and write alike, and never
 * looks at `onlyOwnData`, `ownerIdField`, `read` or `write`; the router adds no owner filter.
 * Without this guard any signed-in user can read and change every other user's profile,
 * phrases, sessions and subscription, and write to collections marked `write: false`.
 *
 * For callers who are not administrators the guard rewrites or refuses the request before
 * the router sees it:
 * - reads (find, find-one, count, aggregate) get the owner field forced to the caller;
 *   findByIds cannot carry a filter, so its result is filtered on the way out;
 * - writes are refused where the collection is not writable by clients, and otherwise get
 *   the owner field forced in the query (update-one, remove-one) or the document
 *   (insert-one); an update may not touch the owner field or a server-owned field;
 * - the request options that reach Mongoose unchecked are narrowed: `options` keys are
 *   called as query methods (`setQuery`, `deleteMany`, …), `types` rewrites body paths,
 *   aggregate stages like `$lookup` read other collections, and `populates` follows
 *   references a client can point at anyone's documents, so populated documents are
 *   pinned to the caller too.
 *
 * Registered through createRest's `onBeforeInit`, next to functionCallerGuard. Like that
 * guard it only decodes the token: the data-provider router's own auth middleware still
 * verifies the signature, so a forged administrator claim gains nothing here.
 */
import { Types } from "mongoose";
import { modelRegistry } from "@modular-rest/server";
import { decodeCaller } from "./function-caller-guard";
import { permissionGroups } from "./permissions";

// The slice of a Koa context the guard touches (the server has no Koa type package).
interface GuardContext {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  request: { body?: any };
  status: number;
  body: any;
}

// The parts of a modular-rest Permission the guard reads.
interface PermissionLike {
  accessType: string;
  read?: boolean;
  write?: boolean;
  onlyOwnData?: boolean;
  ownerIdField?: string;
}

// What the guard needs to know about a registered collection.
export interface CollectionInfo {
  permissions?: PermissionLike[];
  // A Mongoose schema; `path()` returns the SchemaType of a field, or undefined.
  schema?: { path(name: string): any };
}

export type CollectionLookup = (database: string, collection: string) => CollectionInfo | undefined;

// How the guard treats one collection for callers who are not administrators.
export interface CollectionPolicy {
  /** Field holding the owning user's id; null for shared data every user may read. */
  ownerField: string | null;
  /** Owner ids are stored as ObjectIds (aggregate does not cast, so the guard must). */
  ownerIsObjectId: boolean;
  /** Clients may insert, update and remove their own documents. */
  writable: boolean;
  /** Top-level fields only the server may set. */
  serverOwnedFields: string[];
}

// koa-router matches routes case-insensitively and tolerates a trailing slash; the guard
// also accepts repeated slashes and percent-encoding so it covers a superset of what the
// router will route.
const DATA_PROVIDER_PATH = /^\/+data-provider\/+([^/]+)\/*$/i;

const READ_OPS = ["find", "find-one", "count", "findbyids", "aggregate"];
const WRITE_OPS = ["update-one", "insert-one", "remove-one"];

// Fields modular-rest modules use for the owning user, for collections that don't name one.
const OWNER_FIELD_CANDIDATES = ["refId", "userId", "user_id", "owner"];

// Rules the permission lists don't spell out, keyed by `database.collection`.
const COLLECTION_RULES: Record<string, Partial<Pick<CollectionPolicy, "ownerField" | "writable">>> = {
  // modular-rest's own upload records: open to every end user through upload_file_access
  // with onlyOwnData false. Uploads and removals go through the /file routes, which keep
  // their own checks; through the data provider a user may only read their own records.
  "cms.file": { ownerField: "owner", writable: false },
  // Billing state the server keeps: a client that could write it could grant itself credits
  // or a paid tier. Clients read their own; only server code changes it.
  "user_content.subscription": { writable: false },
  "user_content.free_credit": { writable: false },
};

/**
 * Fields only the server may write, keyed by `database.collection`. Clients may read them,
 * but an insert or update that sets them is refused. Add a field here when the server
 * starts owning it, before any client could write it.
 */
export const SERVER_OWNED_FIELDS: Record<string, string[]> = {
  // The multilingual profile state (ADR-006): set by server functions, never by clients.
  "user_content.profile": [
    "translationLanguage",
    "learningLanguage",
    "learningLanguages",
    "pausedLanguages",
    "onboardingState",
    "knowledgeMapEnabled",
  ],
};

// `options` keys are called as Mongoose query methods (`query[key](value)`), so only plain
// paging and shaping methods are allowed: `setQuery`, `merge`, `or`, `deleteMany`, … would
// replace the forced filter or turn a find into a write.
const READ_OPTION_KEYS = ["sort", "limit", "skip", "select"];

// update-one passes `options` straight to updateOne. `upsert` would insert the query's
// fields, which can include server-owned ones, so it is not on the list.
const UPDATE_OPTION_KEYS = ["arrayFilters"];

// A populate entry may name a path and the fields to select; `model`, `match`, `populate`
// and the rest would let it reach documents the guard has not pinned to the caller.
const POPULATE_KEYS = ["path", "select"];

// Aggregate stages a client may use. Anything else (`$lookup`, `$unionWith`,
// `$graphLookup`, `$merge`, `$out`, `$documents`, `$collStats`, …) is refused.
const AGGREGATE_STAGES = [
  "$match",
  "$project",
  "$addFields",
  "$set",
  "$unset",
  "$group",
  "$sort",
  "$limit",
  "$skip",
  "$count",
  "$unwind",
  "$sortByCount",
  "$bucket",
  "$bucketAuto",
  "$facet",
  "$replaceRoot",
  "$replaceWith",
  "$sample",
];

// Operators refused anywhere in a pipeline, including inside `$facet`: they read other
// collections, write, or run JavaScript on the database server.
const AGGREGATE_FORBIDDEN = ["$lookup", "$unionWith", "$graphLookup", "$merge", "$out", "$function", "$accumulator", "$where"];

// Every access type a non-administrator group holds; a permission of any other type is
// closed to them by modular-rest's own checkAccess.
const CLIENT_ACCESS_TYPES = new Set(
  permissionGroups.filter((group) => group.title !== "administrator").flatMap((group) => group.allowedAccessTypes)
);

class Refusal extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const forbid = (message: string) => new Refusal(403, `FORBIDDEN: ${message}`);
const malformed = (message: string) => new Refusal(400, message);

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Works out how the guard treats a collection, or null when no client can reach it. */
export function collectionPolicy(database: string, collection: string, info: CollectionInfo): CollectionPolicy | null {
  const reachable = (info.permissions || []).filter((permission) => CLIENT_ACCESS_TYPES.has(permission.accessType));
  if (reachable.length === 0) return null;

  const key = `${database}.${collection}`;
  const rule = COLLECTION_RULES[key] || {};
  const declared = reachable.find((permission) => permission.onlyOwnData);
  // A collection that doesn't declare onlyOwnData is still owned if its schema has an
  // owner field; writes there are refused unless a rule says otherwise.
  const ownerField =
    rule.ownerField !== undefined
      ? rule.ownerField
      : declared?.ownerIdField || OWNER_FIELD_CANDIDATES.find((field) => info.schema?.path(field)) || null;
  const writable = rule.writable !== undefined ? rule.writable : Boolean(declared?.write);

  return {
    ownerField,
    ownerIsObjectId: Boolean(ownerField && info.schema?.path(ownerField)?.instance === "ObjectId"),
    writable,
    serverOwnedFields: SERVER_OWNED_FIELDS[key] || [],
  };
}

/** Looks a collection up in modular-rest's registry of defined collections. */
function registryLookup(database: string, collection: string): CollectionInfo | undefined {
  return modelRegistry
    .getCollectionDefinitions()
    .find((definition: any) => definition.database === database && definition.collection === collection);
}

function decodedPath(path: string) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** Returns the client's filter with the owner field pinned to the caller. */
function ownQuery(query: unknown, policy: CollectionPolicy, callerId: string) {
  if (query !== undefined && query !== null && !isPlainObject(query)) throw malformed("query must be an object.");
  if (!policy.ownerField) return query;
  // Top-level filter fields are ANDed, so nothing else in the query ($or, $and, $expr, …)
  // can widen the match past the caller's documents.
  return { ...(query || {}), [policy.ownerField]: callerId };
}

function checkOptions(options: unknown, allowed: string[]) {
  if (options === undefined || options === null) return;
  if (!isPlainObject(options)) throw malformed("options must be an object.");
  const refused = Object.keys(options).filter((key) => !allowed.includes(key));
  if (refused.length > 0) throw forbid(`options not allowed: ${refused.join(", ")}.`);
}

function checkWritableFields(fields: string[], policy: CollectionPolicy) {
  for (const field of fields) {
    const root = field.split(".")[0];
    if (root === policy.ownerField) throw forbid(`the ${policy.ownerField} field can't be changed.`);
    if (policy.serverOwnedFields.includes(root)) throw forbid(`${root} is set by the server only.`);
  }
}

/** Every field path an update document would write, across operators and replacement form. */
function updatedFields(update: Record<string, any>) {
  const fields: string[] = [];
  for (const [key, value] of Object.entries(update)) {
    if (!key.startsWith("$")) {
      fields.push(key);
      continue;
    }
    if (!isPlainObject(value)) throw malformed(`${key} must be an object.`);
    fields.push(...Object.keys(value));
    // $rename writes to the new name as well as removing the old one.
    if (key === "$rename") fields.push(...Object.values(value).map(String));
  }
  return fields;
}

function findForbiddenOperator(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenOperator(item);
      if (found) return found;
    }
  } else if (isPlainObject(value)) {
    for (const [key, inner] of Object.entries(value)) {
      if (AGGREGATE_FORBIDDEN.includes(key)) return key;
      const found = findForbiddenOperator(inner);
      if (found) return found;
    }
  }
  return undefined;
}

function checkPipeline(pipeline: unknown) {
  if (!Array.isArray(pipeline)) throw malformed("pipelines must be an array.");
  for (const stage of pipeline) {
    const keys = isPlainObject(stage) ? Object.keys(stage) : [];
    if (keys.length !== 1) throw malformed("each pipeline stage must be an object with one stage operator.");
    if (!AGGREGATE_STAGES.includes(keys[0])) throw forbid(`aggregate stage ${keys[0]} is not allowed.`);
  }
  const forbidden = findForbiddenOperator(pipeline);
  if (forbidden) throw forbid(`aggregate operator ${forbidden} is not allowed.`);
}

/** The model a schema path references (`ref`), for single and array references. */
function refOf(info: CollectionInfo, path: string): unknown {
  const type = info.schema?.path(path);
  return type?.options?.ref ?? type?.caster?.options?.ref ?? type?.options?.type?.[0]?.ref;
}

/**
 * Rewrites `populates` so every populated document also belongs to the caller. A client can
 * store any id in its own documents (a bundle's `phrases`, say), so the owner filter on the
 * main query alone would still let populate read other users' documents.
 */
function ownPopulates(populates: unknown, request: PolicyRequest) {
  if (!Array.isArray(populates)) throw malformed("populates must be an array.");
  return populates.flatMap((entry) => {
    const spec = typeof entry === "string" ? { path: entry } : entry;
    if (!isPlainObject(spec) || typeof spec.path !== "string") throw malformed("each populate needs a path.");
    const refused = Object.keys(spec).filter((key) => !POPULATE_KEYS.includes(key));
    if (refused.length > 0) throw forbid(`populate options not allowed: ${refused.join(", ")}.`);

    // Mongoose reads "a b" as two paths.
    return spec.path
      .split(/\s+/)
      .filter(Boolean)
      .map((path: string) => {
        const ref = refOf(request.info, path);
        // modular-rest names each model after its collection, on its database's connection.
        const target = typeof ref === "string" ? request.lookup(request.database, ref) : undefined;
        const policy = target && collectionPolicy(request.database, ref as string, target);
        if (!policy) throw forbid(`${path} can't be populated.`);
        return {
          path,
          ...(spec.select !== undefined ? { select: spec.select } : {}),
          ...(policy.ownerField ? { match: { [policy.ownerField]: request.callerId } } : {}),
        };
      });
  });
}

function ownerValue(policy: CollectionPolicy, callerId: string) {
  if (!policy.ownerIsObjectId) return callerId;
  try {
    return new Types.ObjectId(callerId);
  } catch {
    throw forbid("the caller's id is not a valid owner id.");
  }
}

// One data-provider request, resolved against the collection it targets.
interface PolicyRequest {
  op: string;
  body: Record<string, any>;
  database: string;
  info: CollectionInfo;
  policy: CollectionPolicy;
  callerId: string;
  lookup: CollectionLookup;
}

/** Rewrites the body in place so the request only reaches the caller's own documents. */
function applyPolicy(request: PolicyRequest) {
  const { op, body, policy, callerId } = request;
  // `types` makes the router rewrite arbitrary body paths after this guard has run.
  if (body.types !== undefined) throw forbid("types is not allowed.");

  if (WRITE_OPS.includes(op)) {
    if (!policy.writable) throw forbid("this collection is read-only for clients.");
    if (!policy.ownerField) throw forbid("this collection is read-only for clients.");
  }

  switch (op) {
    case "find":
    case "find-one":
      checkOptions(body.options, READ_OPTION_KEYS);
      body.query = ownQuery(body.query, policy, callerId);
      if (body.populates !== undefined) body.populates = ownPopulates(body.populates, request);
      break;
    case "count":
    case "remove-one":
      body.query = ownQuery(body.query, policy, callerId);
      break;
    case "update-one": {
      checkOptions(body.options, UPDATE_OPTION_KEYS);
      // An update pipeline (an array) can compute any field from any other; refuse it.
      if (!isPlainObject(body.update)) throw malformed("update must be an object.");
      checkWritableFields(updatedFields(body.update), policy);
      body.query = ownQuery(body.query, policy, callerId);
      break;
    }
    case "insert-one": {
      if (!isPlainObject(body.doc)) throw malformed("doc must be an object.");
      checkWritableFields(
        Object.keys(body.doc).filter((key) => key !== policy.ownerField),
        policy
      );
      body.doc = { ...body.doc, [policy.ownerField as string]: callerId };
      break;
    }
    case "aggregate":
      checkPipeline(body.pipelines);
      if (policy.ownerField) {
        body.pipelines = [{ $match: { [policy.ownerField]: ownerValue(policy, callerId) } }, ...body.pipelines];
      }
      break;
    case "findbyids":
      // Handled on the way out: the router builds its own filter from `ids`.
      break;
  }
}

/** Keeps only the caller's documents in a findByIds result. */
function filterOwnResults(ctx: GuardContext, policy: CollectionPolicy, callerId: string) {
  const data = ctx.body?.data;
  if (!policy.ownerField || !Array.isArray(data)) return;
  const field = policy.ownerField;
  ctx.body = { ...ctx.body, data: data.filter((doc: any) => doc && String(doc[field]) === callerId) };
}

export function createDataProviderGuard(lookup: CollectionLookup) {
  return async function dataProviderGuard(ctx: GuardContext, next: () => Promise<unknown>) {
    const match = DATA_PROVIDER_PATH.exec(ctx.path) || DATA_PROVIDER_PATH.exec(decodedPath(ctx.path));
    if (!match) return next();

    const op = decodedPath(match[1]).toLowerCase();
    // Unknown operations have no handler; the router answers them.
    if (!READ_OPS.includes(op) && !WRITE_OPS.includes(op)) return next();

    const caller = decodeCaller(ctx.headers.authorization);
    if (caller?.isAdmin) return next();

    try {
      // The router rejects these too; refusing here keeps the guard from being skipped.
      if (!caller) throw new Refusal(401, "authentication is required");

      const body = ctx.request.body;
      if (!isPlainObject(body)) throw malformed("the request body must be an object.");
      // The router indexes its permission table with these values, so `["profile"]` would
      // reach the profile collection; insist on strings so the guard sees the same name.
      if (typeof body.database !== "string" || typeof body.collection !== "string") {
        throw malformed("database and collection must be strings.");
      }

      const info = lookup(body.database, body.collection);
      // No definition means no permission: the router refuses the request itself.
      const policy = info && collectionPolicy(body.database, body.collection, info);
      if (!policy) return next();

      applyPolicy({ op, body, database: body.database, info, policy, callerId: caller.id, lookup });

      await next();
      if (op === "findbyids") filterOwnResults(ctx, policy, caller.id);
    } catch (error) {
      if (!(error instanceof Refusal)) throw error;
      ctx.status = error.status;
      ctx.body = { status: "error", message: error.message };
    }
  };
}

export const dataProviderGuard = createDataProviderGuard(registryLookup);
