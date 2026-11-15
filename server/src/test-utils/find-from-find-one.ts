/**
 * For unit tests that mock a per-user collection (Leitner, Pool, board) with `findOne`.
 * The services now list a learner's documents with `find` and pick the language in code
 * (`languages/language-docs.ts`). This adds a `find` that answers from the mocked
 * `findOne`, so those tests keep their set-up:
 * - the listing call (it has a projection) returns the `findOne` result;
 * - the load by `_id` returns that same document;
 * - any other `find` goes to the test's own `find` mock, if it has one.
 * A mocked document with no `language` is given `"en"`, so no adoption write shows up in
 * the mock's calls. The adoption itself is tested on a real in-memory MongoDB.
 */
import { jest } from "@jest/globals";

export function findFromFindOne<T extends Record<string, any>>(mock: T): T {
  const own = mock.find;
  let last: any = null;
  (mock as any).find = jest.fn(async (filter: any, projection?: any) => {
    if (projection) {
      last = await mock.findOne(filter);
      if (last && last.language === undefined) last.language = "en";
      return last ? [last] : [];
    }
    if (filter && "_id" in filter) return last ? [last] : [];
    return own ? own(filter, projection) : [];
  });
  return mock;
}
