import { CmsTrigger, getCollection } from "@modular-rest/server";

export const authTriggers: CmsTrigger[] = [
  new CmsTrigger("insert-one", (context) => {
    getCollection("user_content", "phrase_bundle").insertMany([
      {
        refId: context.queryResult._id,
        title: "Everyday English",
        phrases: [],
      },
      {
        refId: context.queryResult._id,
        title: "Slangs",
        phrases: [],
      },
      {
        refId: context.queryResult._id,
        title: "Academic English",
        phrases: [],
      },
    ]);
  }),
];
