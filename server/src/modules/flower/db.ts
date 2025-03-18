import {
  CollectionDefinition,
  Schema,
  Schemas,
  Permission,
  PermissionTypes,
  DatabaseTrigger,
} from "@modular-rest/server";

module.exports = [
  new CollectionDefinition({
    db: "flower",
    collection: "wildflowers",
    schema: new Schema({
      name: String,
      description: String,
      image: Schemas.file,
    }),
    permissions: [
      new Permission({
        type: "god_access",
        read: true,
        write: true,
      }),
      new Permission({
        type: "anonymous_access",
        read: true,
      }),
    ],
    triggers: [
      new DatabaseTrigger("insert-one", ({ query, queryResult }) => {
        console.log("inserted", query);
      }),
    ],
  }),
];
