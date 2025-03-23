import { reply, getCollection } from "@modular-rest/server";
import Router from "koa-router";

const name = "flower";
const route = new Router();

route.get("/", async (ctx) => {
  ctx.body = reply.create("s", {
    message: "Your flower module is working!",
  });
});

route.get("/list", async (ctx) => {
  try {
    let collection = getCollection("flower", "wildflowers");
    let result = await collection.find({}).exec();

    ctx.body = reply.create("s", {
      data: result,
    });
  } catch (err: any) {
    ctx.throw(500, err.message || "Something went wrong");
  }
});

module.exports.name = name;
module.exports.main = route;
