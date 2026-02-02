# Key Concepts [​](#key-concepts)

Modular-rest is designed to minimize the amount of code needed to create a RESTful backend. With just a single call to the `createRest` function, you can have a fully functional RESTful backend up and running. To make it flexible and customizable, modular-rest introduces several key concepts that you should understand to effectively build your own logic on top of it.

## Configuration [​](#configuration)

The configuration object passed to the `createRest` function is the foundation of modular-rest. This object contains all the necessary information for modular-rest to set up the server. You can learn more about configuring your server in the [Quick Start](./quick-start.html) section.

## Modules [​](#modules)

Modules are the building blocks for implementing your business logic on top of modular-rest. Each module has its own dedicated directory where all relevant files and data structures are organized. This modular approach allows you to add unlimited modules to your project and scale it according to your needs. Learn more about working with modules in the [Modules](./modules/intro.html) section.

# Install Server App [​](#install-server-app)

Thank you for choosing `modular-rest` to build your app. You can install the server app in two ways:

## 1\. Create a new project [​](#_1-create-a-new-project)

In this way, you can create a new project with `modular-rest` server app. it will create a new folder with your project name and setup the project for you.

Just use below command:

npmyarn

sh

```
npm create @modular-rest/server@latest my-project
```

sh

```
yarn create @modular-rest/server my-project
```

And now you can start your project with below commands:

sh

```
cd my-project
npm install
npm start
```

## 2\. Add modular-rest server client to your project [​](#_2-add-modular-rest-server-client-to-your-project)

It assumed that you have initialized a project with npm, then use below command to install modular-rest server client.

npmyarn

sh

```
npm i @modular-rest/server --save
```

sh

```
yarn add @modular-rest/server
```

Now you can use modular-rest server client in your project.

ts

```
import { createRest } from '@modular-rest/server';

const app = createRest({
  port: '80',
  mongo: {
    mongoBaseAddress: 'mongodb://localhost:27017',
    dbPrefix: 'mrest_'
  },
  onBeforeInit: (koaApp) => {
    // do something before init with the koa app
  }
})
```

# Configuration Overview [​](#configuration-overview)

This guide provides an overview and detailed explanation of the configuration options available for `@modular-rest/server`.

## Quick Start [​](#quick-start)

To get started, you need to require `@modular-rest/server` and call `createRest` with your configuration object:

javascript

```
const { createRest } = require("@modular-rest/server");

const app = createRest({
  port: "80",
  // Additional configuration options...
});
```

### Health Chek [​](#health-chek)

You may need to check the server health, just request to below endpoint:

bash

```
GET:[base_url]/verify/ready
# {"status":"success"}
```

## Configuration Summary Table [​](#configuration-summary-table)

## Server and Middleware Configuration [​](#server-and-middleware-configuration)

*   **`cors`**: Defines Cross-Origin Resource Sharing (CORS) options to control how resources on your server can be requested from another domain.
*   **`port`**: Specifies the port number on which the server will listen for requests.
*   **`dontListen`**: If set to `true`, the server setup is done but it won't start listening. This is useful for cases where you want to perform tests or when integrating with another server.

## Modules and Upload Directory [​](#modules-and-upload-directory)

*   **`modulesPath`**: The directory path where your module files (`router.js`, `db.js`) are located.
*   **`uploadDirectory`**: The root directory where uploaded files are stored, you can mount this directory to a CDN or a cloud storage service.

## Static Files [​](#static-files)

*   **`staticPath`**: Provides detailed options for serving static files from your server, such as the root directory, caching options, and whether to serve gzipped content.

## Initialization Hooks [​](#initialization-hooks)

*   **`onBeforeInit`**: A function that is called before the Koa application is initialized. This allows you to add or configure middleware and routes.
*   **`onAfterInit`**: Similar to `onBeforeInit`, but this function is called after the application has been initialized.

## Database Configuration [​](#database-configuration)

*   **`mongo`**: Contains MongoDB configuration details like the database address, prefix for database names, and more.

## Security and Authentication [​](#security-and-authentication)

*   **`keypair`**: RSA keys used for authentication purposes.
*   **`adminUser`**: Credentials for an admin user, typically used for initial setup or administrative tasks.

## Customization and Extensions [​](#customization-and-extensions)

*   **`verificationCodeGeneratorMethod`**,
*   **`collectionDefinitions`**,
*   **`permissionGroups`**,
*   **`authTriggers`**

These properties allow for extending the functionality of `@modular-rest/server` by adding custom verification code generation logic, defining additional database collections, setting up permission groups, and specifying triggers for database operations.

## Example Configuration [​](#example-configuration)

Here's an example demonstrating how to configure some of these properties:

javascript

```
const { createRest } = require("@modular-rest/server");

const app = createRest({
  port: 3000,
  modulesPath: "./modules",
  staticPath: {
    rootDir: "./public",
    notFoundFile: "404.html",
    log: true,
  },
  mongo: {
    mongoBaseAddress: "mongodb://localhost:27017",
    dbPrefix: "myApp_",
  },
  onBeforeInit: (koaApp) => {
    // Custom middleware
    koaApp.use(customMiddleware());
  },
  adminUser: {
    email: "admin@example.com",
    password: "securepassword",
  },
});
```

This guide should give you a clear understanding of how to configure `@modular-rest/server` for your project, along with some examples to get you started.

# Modules [​](#modules-1)

Modules are the building blocks your logics on top of modular-rest. each module has a specific directory and all relevant files and data structure are placed in that directory. hence you can add unlimited modules to your project and scale it as much as you want.

## Structure [​](#structure)

All modules should be placed in the `modules` directory that you define and [introduce in the configuration object](/modular-rest/server-client-ts/quick-start.html#modules-path). Each module should have its own directory with the following structure, and all files should be placed in that directory but none of theme are required.

*   `db.js`: to define the database models and their relationships.
*   `functions`: to define functions that you want to be invoked by client library.
*   `router.js`: to define the routes and their handlers.

You can add more files and directories to your module based on your needs, but the above files are be recognized by modular-rest and will be imported to the server logic automatically on startup.

## Use Cases [​](#use-cases)

Let's see some examples to understand the concept of modules better.

#### **Blog Website**: [​](#blog-website)

Assume you want to create a blog website where people come and write their own blog posts, read other people's posts, and comment on them.

To modularize this project, you can create three modules:

*   `users`: to manage users and their profiles.
*   `posts`: to manage blog posts and their categories, tags, and content.
*   `comments`: to manage comments on blog posts and their replies.

#### **E-commerce Website**: [​](#e-commerce-website)

Assume you want to create an e-commerce website where people come and buy products, add them to their cart, and pay for them.

To modularize this project, you can create three modules:

*   `users`: to manage users and their profiles.
*   `products`: to manage products and their categories, prices, and descriptions.
*   `orders`: to manage orders and their statuses, like pending, shipped, and delivered.

#### **Video Editing Platform**: [​](#video-editing-platform)

Assume you want to create a video editing platform where people come and upload their videos, edit them, and share them with others.

To modularize this project, you can create three modules:

*   `users`: to manage users and their profiles.
*   `media-library`: to manage media files like videos, images, and audio files.
*   `editor-engine`: to manage the video editing process, like trimming, cropping, and adding effects to the videos.

# Concept [​](#concept)

In Modular-rest you have mongodb database support out of the box. you just need to define your data models in `db.[js|ts]` files. they have to be located in modules directory. for example if you have a module named `user` you have to create a file named `db.[js|ts]` in `modules/user` directory.

## How to Define a Collection [​](#how-to-define-a-collection)

> **defineCollection**(`options`): [`CollectionDefinition`](/modular-rest/server-client-ts/generative/classes/CollectionDefinition.html) & `object`

To have define any collection in your database you haveto use below method in your `db.[js|ts]` file and export an array of CollectionDefinition instances.

## Example [​](#example)

typescript

```
import { defineCollection } from '@modular-rest/server';

export default [
  defineCollection({
    database: 'users',
    collection: 'info',
    // schema: Schema,
    // permissions: Permission[]
    // trigger: DatabaseTrigger[]
  })
]

// Access the model directly:
const userCollection = defineCollection({...});
const UserModel = userCollection.model;
const users = await UserModel.find();
```

## Parameters [​](#parameters)

Parameter

Type

Description

`options`

{ `collection`: `string`; `database`: `string`; `mongoOption`: [`MongoOption`](/modular-rest/server-client-ts/generative/interfaces/_internal_.MongoOption.html); `permissions`: [`Permission`](/modular-rest/server-client-ts/generative/classes/Permission.html)\[\]; `schema`: `Schema`<`any`\>; `triggers`: [`DatabaseTrigger`](/modular-rest/server-client-ts/generative/classes/DatabaseTrigger.html)\[\]; }

The options for the collection

`options.collection`

`string`

The name of the collection to be configured

`options.database`

`string`

The name of the database where the collection resides

`options.mongoOption`?

[`MongoOption`](/modular-rest/server-client-ts/generative/interfaces/_internal_.MongoOption.html)

Optional MongoDB connection options. If not provided, will use config.mongo if available. This is used to pre-create the model before server startup.

`options.permissions`

[`Permission`](/modular-rest/server-client-ts/generative/classes/Permission.html)\[\]

List of permissions controlling access to the collection

`options.schema`

`Schema`<`any`\>

Mongoose schema definition for the collection **See** [https://mongoosejs.com/docs/5.x/docs/guide.html](https://mongoosejs.com/docs/5.x/docs/guide.html)

`options.triggers`?

[`DatabaseTrigger`](/modular-rest/server-client-ts/generative/classes/DatabaseTrigger.html)\[\]

Optional database triggers for custom operations

## Returns [​](#returns)

[`CollectionDefinition`](/modular-rest/server-client-ts/generative/classes/CollectionDefinition.html) & `object`

A CollectionDefinition instance with a model property that returns the mongoose model

## Schema [​](#schema)

You can define data stracture for your collection by passing a [mongoose schema](https://mongoosejs.com/docs/5.x/docs/guide.html) to `schema` option.

typescript

```
import { Schema } from '@modular-rest/server';

const userSchema = new Schema({ 
	name: String,
	age: Number
});

defineCollection({
	database: 'users',
	collection: 'info',
	schema: userSchema, 
	permissions: Permission[]
	trigger: DatabaseTrigger[]
})
```

### File Schema [​](#file-schema)

Modular-rest has a predefined file schema that you it is necessary to use this schema if your collection needs to store files.

**Note**: Modular-rest does not store the file directly in the database. Instead, it places the file in the [upload directory](/modular-rest/server-client-ts/quick-start.html#modules-and-upload-directory) specified in the [config object](/modular-rest/server-client-ts/quick-start.html#configuration-summary-table). The file information is then recorded in the database.

typescript

```
import { schemas } from '@modular-rest/server';

const userSchema = new Schema({
	name: String,
	age: Number,

	// Added this file to the parent schema
	avatar: schemas.file
});
```

## Permissions [​](#permissions)

The permission system in this framework provides a robust way to control access to your application's resources. It works by matching permission types that users have against those required by different parts of the system. [Read more](/modular-rest/server-client-ts/advanced/permission-and-user-access.html)

## Triggers [​](#triggers)

In a complex application, you may need to perform additional actions after a database operation. This is where triggers come in.

### Database Triggers [​](#database-triggers)

Database triggers allow you to define callbacks for specific database operations on a collection.

### CMS Triggers [​](#cms-triggers)

CMS triggers allow you to define callbacks for operations performed via the CMS. Defines a callback to be executed on specific CMS operations CmsTrigger

## Example [​](#example-1)

typescript

```
const trigger = new CmsTrigger('insert-one', (context) => {
  console.log('New CMS document inserted:', context.queryResult);
  // Perform additional actions after CMS document insertion.
});

// Use the trigger in RestOptions
const { app } = await createRest({
  authTriggers: [trigger],
  // ... other options
});
```

## Extends [​](#extends)

*   [`DatabaseTrigger`](/modular-rest/server-client-ts/generative/classes/DatabaseTrigger.html)

## Constructors [​](#constructors)

### Constructor [​](#constructor)

> **new CmsTrigger**(`operation`, `callback`?): `CmsTrigger`

Creates a new CmsTrigger instance

#### Example [​](#example-2)

typescript

```
// Log all CMS updates
const updateTrigger = new CmsTrigger('update-one', (context) => {
  console.log('CMS document updated:', context.queryResult);
});

// Track CMS document removals
const removeTrigger = new CmsTrigger('remove-one', (context) => {
  console.log('CMS document removed:', context.queryResult);
});
```

#### Parameters [​](#parameters-1)

Parameter

Type

Description

`operation`

[`CmsOperation`](/modular-rest/server-client-ts/generative/types/_internal_.CmsOperation.html)

The CMS operation to trigger on

`callback`?

(`context`) => `void`

The callback function to execute

#### Returns [​](#returns-1)

`CmsTrigger`

#### Overrides [​](#overrides)

`DatabaseTrigger.constructor`

## Properties [​](#properties)

Property

Type

Description

Inherited from

`callback`

(`context`) => `void`

The callback function to be executed

[`DatabaseTrigger`](/modular-rest/server-client-ts/generative/classes/DatabaseTrigger.html).[`callback`](/modular-rest/server-client-ts/generative/classes/DatabaseTrigger.html#callback)

`operation`

[`DatabaseOperation`](/modular-rest/server-client-ts/generative/types/_internal_.DatabaseOperation.html)

The CMS operation that triggers the callback

[`DatabaseTrigger`](/modular-rest/server-client-ts/generative/classes/DatabaseTrigger.html).[`operation`](/modular-rest/server-client-ts/generative/classes/DatabaseTrigger.html#operation)

## Methods [​](#methods)

### applyToSchema() [​](#applytoschema)

> **applyToSchema**(`schema`): `void`

Applies the trigger to a Mongoose schema

#### Parameters [​](#parameters-2)

Parameter

Type

Description

`schema`

`any`

The mongoose schema to apply the trigger to

#### Returns [​](#returns-2)

`void`

#### Inherited from [​](#inherited-from)

[`DatabaseTrigger`](/modular-rest/server-client-ts/generative/classes/DatabaseTrigger.html).[`applyToSchema`](/modular-rest/server-client-ts/generative/classes/DatabaseTrigger.html#applytoschema)

## Linking Collections [​](#linking-collections)

You can link any collection from same database into an schema to perform `populate queries`, but let me tell you what it is simply:

`Populate query` is a query that you can use to get data from linked collections. for example if you have a collection named `user` and you have a collection named `post` that each post has an author. you can link `user` collection into `post` collection and then you can use populate query to get author of each post, it you the user data in author field of each post.

More info on [populate queries](https://mongoosejs.com/docs/5.x/docs/populate.html).

typescript

```
import { Schema } from '@modular-rest/server';

const userSchema = new Schema({
	name: String,
	age: Number
});

const postSchema = new Schema({
	title: String,
	content: String,
	author: {
		type: Schema.Types.ObjectId,
		ref: 'user'
	}
});
```

## Cross Database Populate [​](#cross-database-populate)

While Mongoose's standard `populate()` works within the same database, Modular-rest enables cross-database population by leveraging the `modelRegistry`. This is useful when you have collections in different MongoDB databases that need to reference each other.

### Schema Level Reference [​](#schema-level-reference)

The most efficient way to handle cross-database population is to provide the model directly in the schema definition.

typescript

```
import { modelRegistry, Schema } from '@modular-rest/server';

// 1. Get the model from the other database
const userModel = modelRegistry.getModel('auth_db', 'users');

// 2. Define the schema using the model as a reference
const postSchema = new Schema({
    title: String,
    author: {
        type: Schema.Types.ObjectId,
        ref: userModel
    }
});
```

### Query Level Reference [​](#query-level-reference)

You can also provide the model at the query level if it wasn't defined in the schema.

typescript

```
// Use the model in your query
const posts = await postModel.find().populate({
	path: 'author',
	model: userModel 
});
```

For more details on accessing models, see the [Model Registry documentation](/modular-rest/server-client-ts/utility/model-registry.html).

## Full Example [​](#full-example)

Let's see a full example of `db.ts` file:

typescript

```
import { Schema, schemas, CollectionDefinition, Permission, DatabaseTrigger } from '@modular-rest/server';

const userSchema = new Schema({
	name: String,
	age: Number,

	// Added this file to the parent schema
	avatar: schemas.file
});

const postSchema = new Schema({
	title: String,
	content: String,
	author: {
		type: Schema.Types.ObjectId,
		ref: 'user'
	}
});

const userPermissions = [
	new Permission({
		new Permission({
			type: 'god_access',
			read: true,
			write: true,
		}),
		new Permission({
			type: 'user_access',
			read: true,
			write: true,
			onlyOwnData: true,
		}),
		new Permission({
			type: 'anonymous_access',
			read: true,
		}),
	})
];

const userTriggers = [
	new DatabaseTrigger('insert-one',
		(data) => {
			// send email to user
		}
	})
];

module.exports = [
	new CollectionDefinition({
		db: 'user',
		name: 'info',
		schema: userSchema,
		permissions: userPermissions,
		trigger: userTriggers
	}),
	new CollectionDefinition({
		db: 'user',
		name: 'post',
		schema: postSchema,
		permissions: userPermissions,
		trigger: userTriggers
	})
]
```

# Concept [​](#concept-1)

In the Modular-rest, functions are a powerful feature that allows developers to define and manage custom logic seamlessly within their APIs. Functions serve as a mechanism to remove traditional API development, eliminating the need to write routers directly.

By defining a function, a router will be generated for it automatically, allowing the client library to focus solely on the API call. This feature supports more dynamic and flexible application designs, ensuring that specific actions can be encapsulated and reused while enforcing permissions and maintaining security.

TIP

For information on how to call these functions from the client, see the [FunctionProvider client documentation](/modular-rest/js-client/function-provider.html).

## Define a Function [​](#define-a-function)

> **defineFunction**(`options`): `object`

To define a function you need to create a `functions.[js|ts]` in each module of your app and return am array called `functions`, and then define all your functions with calling the `defineFunction` method.

The `defineFunction` method serves as a core utility for creating custom functions dynamically. This method allows you to specify various parameters, including the name of the function, the permissions required for access, and the corresponding logic that should be executed when the function is invoked.

## Example [​](#example-3)

Here is an example illustrating how to use the `defineFunction` method effectively:

typescript

```
// /modules/myModule/functions.ts

import { defineFunction } from "@modular-rest/server";

const getServerTime = defineFunction({
  name: "getServerTime",
  permissionTypes: ["anonymous_access"],
  callback: (params) => {
    // return your data only
    return `
      Welcome, ${params.username}!
      The current server time is ${new Date().toLocaleString()}.
    `;

    // error handling,
    // client gets error code 400, and the message
    // throw new Error('An error occurred');
  },
});

module.exports.functions = [getServerTime];
```

In this example, we define a function named `getServerTime` that requires the `user` permission type to access. When the function is called, it will return a message containing the current server time and the username of the user who invoked the function.

* * *

By utilizing the `defineFunction` method, developers are empowered to create custom functionality effortlessly within the Modular REST framework, enhancing both the versatility and security of their applications.

## Parameters [​](#parameters-3)

Parameter

Type

Description

`options`

{ `callback`: (`args`) => `any`; `name`: `string`; `permissionTypes`: `string`\[\]; }

The function definition options. See [DefinedFunction](/modular-rest/server-client-ts/generative/interfaces/RestOptions.html#functions) for detailed parameter descriptions.

`options.callback`

(`args`) => `any`

The actual function implementation

`options.name`

`string`

Unique name of the function

`options.permissionTypes`

`string`\[\]

List of permission types required to run the function

## Returns [​](#returns-3)

`object`

The defined function object which system will use to generate a router for the function, generall the client library will use the router to call the function.

Name

Type

Description

`callback()`

(`args`) => `any`

The actual function implementation

`name`

`string`

Unique name of the function

`permissionTypes`

`string`\[\]

List of permission types required to run the function

## Throws [​](#throws)

If function name already exists, permission types are missing, or callback is invalid

# Custom Route [​](#custom-route)

In modular rest you have still the traditional way to create a route, by creating a `router.js` file in your module directory. This file should export below properties and will be taken automatically by the modular rest on the startup.

*   `name`: the name of the route, mostly same as the module name.
*   `main`: the main router object.

Note: route system is based on [koa-router](https://github.com/koajs/router/blob/master/API.md) package which is a plugin for express.js framework.

## Example [​](#example-4)

Assume you have a module named `flowers` and you want to create a list/id route for it. You can create a `router.js` file in the `modules/flowers` directory with the following content:

js

```
const Router = require('koa-router');
const name = 'flowers';

const flowerRouter = new Router();

flowerRouter.get('/list', (ctx) => {
	ctx.body = 'This is a list of flowers: Rose, Lily, Tulip';
});

flowerRouter.post('/:id', (ctx) => {
	const id = ctx.params.id;
	ctx.body = `Request Body: ${JSON.stringify(ctx.request.body)} and id: ${id}`;
    
})

module.exports.name = name;
module.exports.main = flowerRouter;
```

Now you can access your apis by sending a request to the following urls:

*   `GET http://localhost:80/flowers/list`
*   `POST http://localhost:80/flowers/1`

# Database Utilities [​](#database-utilities)

Contains utilities related to database operations.

## Get Collection [​](#get-collection)

> **getCollection**<`T`\>(`db`, `collection`): `Model`<`T`\>

**`Function`**

Gets a Mongoose model for a specific collection getCollection

## Example [​](#example-5)

typescript

```
const userModel = getCollection('myapp', 'users');
const users = await userModel.find();
```

## Type Parameters [​](#type-parameters)

Type Parameter

`T`

## Parameters [​](#parameters-4)

Parameter

Type

Description

`db`

`string`

Database name

`collection`

`string`

Collection name

## Returns [​](#returns-4)

`Model`<`T`\>

Mongoose model for the collection

## Throws [​](#throws-1)

If the collection doesn't exist

# File Utilities [​](#file-utilities)

File service class for handling file operations FileService

## Description [​](#description)

This class provides methods for managing file uploads, retrieval, and deletion. It handles physical file storage and database metadata management.

## Methods [​](#methods-1)

### getFileLink() [​](#getfilelink)

> **getFileLink**(`fileId`): `Promise`<`string`\>

Gets the public URL for a file

#### Example [​](#example-6)

typescript

```
import { fileService } from '@modular-rest/server';

const url = await fileService.getFileLink('file123');
// Returns: '/assets/jpeg/profile/1234567890.jpeg'
```

#### Parameters [​](#parameters-5)

Parameter

Type

Description

`fileId`

`string`

ID of the file

#### Returns [​](#returns-5)

`Promise`<`string`\>

The public URL

* * *

### getFilePath() [​](#getfilepath)

> **getFilePath**(`fileId`): `Promise`<`string`\>

Gets the physical path for a file

#### Example [​](#example-7)

typescript

```
import { fileService } from '@modular-rest/server';

const path = await fileService.getFilePath('file123');
// Returns: '/uploads/jpeg/profile/1234567890.jpeg'
```

#### Parameters [​](#parameters-6)

Parameter

Type

Description

`fileId`

`string`

ID of the file

#### Returns [​](#returns-6)

`Promise`<`string`\>

The physical path

* * *

### removeFile() [​](#removefile)

> **removeFile**(`fileId`): `Promise`<`boolean`\>

Deletes a file from disc and database

#### Example [​](#example-8)

typescript

```
import { fileService } from '@modular-rest/server';

await fileService.removeFile('file123');
```

#### Parameters [​](#parameters-7)

Parameter

Type

Description

`fileId`

`string`

ID of the file to delete

#### Returns [​](#returns-7)

`Promise`<`boolean`\>

True if deletion was successful

#### Throws [​](#throws-2)

If file is not found or deletion fails

* * *

### storeFile() [​](#storefile)

> **storeFile**(`options`): `Promise`<[`IFile`](/modular-rest/server-client-ts/generative/interfaces/_internal_.IFile.html)\>

Stores a file on disc and creates metadata in database

#### Example [​](#example-9)

typescript

```
import { fileService } from '@modular-rest/server';

const file = await fileService.storeFile({
  file: {
    path: '/tmp/upload.jpg',
    type: 'image/jpeg',
    name: 'profile.jpg',
    size: 1024
  },
  ownerId: 'user123',
  tag: 'profile',
  removeFileAfterStore: true
});
```

#### Parameters [​](#parameters-8)

Parameter

Type

Description

`options`

[`StoreFileOptions`](/modular-rest/server-client-ts/generative/interfaces/_internal_.StoreFileOptions.html)

File storage options

#### Returns [​](#returns-8)

`Promise`<[`IFile`](/modular-rest/server-client-ts/generative/interfaces/_internal_.IFile.html)\>

The created file document

#### Throws [​](#throws-3)

If upload directory is not set or storage fails

# Router Utilities [​](#router-utilities)

When you develop custom APIs in `router.[js|ts]` files, you might need to use some utilities to standardize your responses, handle errors, and manage pagination. The following utilities are available to help you with these tasks.

## Reply [​](#reply)

> **create**(`status`, `detail`): [`ResponseObject`](/modular-rest/server-client-ts/generative/interfaces/reply.ResponseObject.html)

Creates a response object with the given status and detail.

## Example [​](#example-10)

typescript

```
import { reply } from '@modular-rest/server';

// inside the router
const response = reply.create("s", { message: "Hello, world!" });
ctx.body = response;
ctx.status = 200;
```

## Parameters [​](#parameters-9)

Parameter

Type

Description

`status`

[`ResponseStatus`](/modular-rest/server-client-ts/generative/types/reply.ResponseStatus.html)

The status of the response. Can be "s" for success, "f" for fail, or "e" for error.

`detail`

`Record`<`string`, `any`\>

The detail of the response. Can contain any additional information about the response.

## Returns [​](#returns-9)

[`ResponseObject`](/modular-rest/server-client-ts/generative/interfaces/reply.ResponseObject.html)

The response object with the given status and detail.

## Paginator Maker [​](#paginator-maker)

> **create**(`count`, `perPage`, `page`): [`PaginationResult`](/modular-rest/server-client-ts/generative/interfaces/paginator.PaginationResult.html)

Creates a pagination object based on the given parameters.

## Example [​](#example-11)

typescript

```
import { paginator } from '@modular-rest/server';

const pagination = paginator.create(100, 10, 1);
// json response will be like this
// {
//   pages: 10,
//   page: 1,
//   from: 0,
//   to: 10,
// }
```

## Parameters [​](#parameters-10)

Parameter

Type

Description

`count`

`number`

The total number of items to paginate.

`perPage`

`number`

The number of items to display per page.

`page`

`number`

The current page number.

## Returns [​](#returns-10)

[`PaginationResult`](/modular-rest/server-client-ts/generative/interfaces/paginator.PaginationResult.html)

An object containing pagination information.

## Auth Middleware [​](#auth-middleware)

> **auth**(`ctx`, `next`): `Promise`<`void`\>

Authentication middleware that secures routes by validating user tokens and managing access control.

This middleware performs several key functions:

1.  Validates that the incoming request contains an authorization token in the header
2.  Verifies the token is valid by checking against the user management service
3.  Retrieves the associated user object if the token is valid
4.  Attaches the authenticated [User](/modular-rest/server-client-ts/generative/classes/_internal_.User.html) object on ctx.state.user for use in subsequent middleware/routes
5.  Throws appropriate HTTP errors (401, 412) if authentication fails

The middleware integrates with the permission system to enable role-based access control. The attached user object provides methods like hasPermission() to check specific permissions.

Common usage patterns:

*   Protecting sensitive API endpoints
*   Implementing role-based access control
*   Getting the current authenticated user
*   Validating user permissions before allowing actions

## Example [​](#example-12)

typescript

```
// Inside the router.ts file
import { auth } from '@modular-rest/server';
import { Router } from 'koa-router';

const name = 'flowers';

const flowerRouter = new Router();

flowerRouter.get('/list', auth, (ctx) => {
 // Get the authenticated user
 const user = ctx.state.user;

 // Then you can check the user's role and permission
 if(user.hasPermission('get_flower')) {
   ctx.body = 'This is a list of flowers: Rose, Lily, Tulip';
 } else {
   ctx.status = 403;
   ctx.body = 'You are not authorized to access this resource';
 }
});

module.exports.name = name;
module.exports.main = flowerRouter;
```

## Parameters [​](#parameters-11)

Parameter

Type

Description

`ctx`

`Context`

Koa Context object containing request/response data

`next`

`Next`

Function to invoke next middleware

## Returns [​](#returns-11)

`Promise`<`void`\>

## Throws [​](#throws-4)

401 - If no authorization header is present

## Throws [​](#throws-5)

412 - If token validation fails

# UserManager Service [​](#usermanager-service)

User manager class for handling user operations

This service provides functionality for managing users, including:

*   User registration and authentication
*   Password management
*   Token generation and verification
*   Temporary ID handling for password reset and verification

## Methods [​](#methods-2)

### changePassword() [​](#changepassword)

> **changePassword**(`query`, `newPass`): `Promise`<`void`\>

Changes a user's password

#### Example [​](#example-13)

typescript

```
import { userManager } from '@modular-rest/server';

try {
  await userManager.changePassword(
    { email: 'user@example.com' },
    'newpassword123'
  );
  console.log('Password changed successfully');
} catch (error) {
  console.error('Failed to change password:', error);
}
```

#### Parameters [​](#parameters-12)

Parameter

Type

Description

`query`

`Record`<`string`, `any`\>

Query to find the user

`newPass`

`string`

The new password

#### Returns [​](#returns-12)

`Promise`<`void`\>

Promise resolving when password is changed

#### Throws [​](#throws-6)

If user is not found or password change fails

* * *

### changePasswordForTemporaryID() [​](#changepasswordfortemporaryid)

> **changePasswordForTemporaryID**(`id`, `password`, `code`): `Promise`<`string`\>

Changes password for a temporary ID

#### Example [​](#example-14)

typescript

```
import { userManager } from '@modular-rest/server';

try {
  const token = await userManager.changePasswordForTemporaryID(
    'user@example.com',
    'newpassword123',
    '123456'
  );
  console.log('Password changed successfully');
} catch (error) {
  console.error('Failed to change password:', error);
}
```

#### Parameters [​](#parameters-13)

Parameter

Type

Description

`id`

`string`

The temporary ID

`password`

`string`

The new password

`code`

`string`

The verification code

#### Returns [​](#returns-13)

`Promise`<`string`\>

Promise resolving to the JWT token

#### Throws [​](#throws-7)

If verification code is invalid or user is not found

* * *

### generateVerificationCode() [​](#generateverificationcode)

> **generateVerificationCode**(`id`, `idType`): `string`

Generates a verification code for a user

#### Example [​](#example-15)

typescript

```
import { userManager } from '@modular-rest/server';

const code = userManager.generateVerificationCode('user@example.com', 'email');
// Returns: '123' (default) or custom generated code
```

#### Parameters [​](#parameters-14)

Parameter

Type

Description

`id`

`string`

User ID or identifier

`idType`

`string`

Type of ID (email, phone)

#### Returns [​](#returns-14)

`string`

Verification code

* * *

### getUserById() [​](#getuserbyid)

> **getUserById**(`id`): `Promise`<[`User`](/modular-rest/server-client-ts/generative/classes/_internal_.User.html)\>

Gets a user by their ID

#### Example [​](#example-16)

typescript

```
import { userManager } from '@modular-rest/server';

try {
  const user = await userManager.getUserById('user123');
  console.log('User details:', user);
} catch (error) {
  console.error('Failed to get user:', error);
}
```

#### Parameters [​](#parameters-15)

Parameter

Type

Description

`id`

`string`

The ID of the user

#### Returns [​](#returns-15)

`Promise`<[`User`](/modular-rest/server-client-ts/generative/classes/_internal_.User.html)\>

Promise resolving to the user

#### Throws [​](#throws-8)

If user model is not found or user is not found

* * *

### getUserByIdentity() [​](#getuserbyidentity)

> **getUserByIdentity**(`id`, `idType`): `Promise`<[`User`](/modular-rest/server-client-ts/generative/classes/_internal_.User.html)\>

Gets a user by their identity (email or phone)

#### Example [​](#example-17)

typescript

```
import { userManager } from '@modular-rest/server';

// Get user by email
const user = await userManager.getUserByIdentity('user@example.com', 'email');

// Get user by phone
const user = await userManager.getUserByIdentity('+1234567890', 'phone');
```

#### Parameters [​](#parameters-16)

Parameter

Type

Description

`id`

`string`

The identity of the user

`idType`

`string`

The type of the identity (phone or email)

#### Returns [​](#returns-16)

`Promise`<[`User`](/modular-rest/server-client-ts/generative/classes/_internal_.User.html)\>

Promise resolving to the user

#### Throws [​](#throws-9)

If user model is not found or user is not found

* * *

### getUserByToken() [​](#getuserbytoken)

> **getUserByToken**(`token`): `Promise`<[`User`](/modular-rest/server-client-ts/generative/classes/_internal_.User.html)\>

Gets a user by their JWT token

#### Example [​](#example-18)

typescript

```
import { userManager } from '@modular-rest/server';

try {
  const user = await userManager.getUserByToken('jwt.token.here');
  console.log('Authenticated user:', user);
} catch (error) {
  console.error('Invalid token:', error);
}
```

#### Parameters [​](#parameters-17)

Parameter

Type

Description

`token`

`string`

The JWT token of the user

#### Returns [​](#returns-17)

`Promise`<[`User`](/modular-rest/server-client-ts/generative/classes/_internal_.User.html)\>

Promise resolving to the user

#### Throws [​](#throws-10)

If token is invalid or user is not found

* * *

### isCodeValid() [​](#iscodevalid)

> **isCodeValid**(`id`, `code`): `boolean`

Checks if a verification code is valid

#### Example [​](#example-19)

typescript

```
import { userManager } from '@modular-rest/server';

const isValid = userManager.isCodeValid('user123', '123');
if (isValid) {
  // Proceed with verification
}
```

#### Parameters [​](#parameters-18)

Parameter

Type

Description

`id`

`string`

The ID of the user

`code`

`string`

The verification code

#### Returns [​](#returns-18)

`boolean`

Whether the verification code is valid

* * *

### issueTokenForUser() [​](#issuetokenforuser)

> **issueTokenForUser**(`email`): `Promise`<`string`\>

Issues a JWT token for a user by email

#### Example [​](#example-20)

typescript

```
import { userManager } from '@modular-rest/server';

try {
  const token = await userManager.issueTokenForUser('user@example.com');
  console.log('Issued token:', token);
} catch (error) {
  console.error('Failed to issue token:', error);
}
```

#### Parameters [​](#parameters-19)

Parameter

Type

Description

`email`

`string`

The email of the user

#### Returns [​](#returns-19)

`Promise`<`string`\>

Promise resolving to the JWT token

#### Throws [​](#throws-11)

If user is not found

* * *

### loginAnonymous() [​](#loginanonymous)

> **loginAnonymous**(): `Promise`<`string`\>

Logs in an anonymous user and returns their JWT token

#### Example [​](#example-21)

typescript

```
import { userManager } from '@modular-rest/server';

const token = await userManager.loginAnonymous();
console.log('Anonymous token:', token);
```

#### Returns [​](#returns-20)

`Promise`<`string`\>

Promise resolving to the JWT token

* * *

### loginUser() [​](#loginuser)

> **loginUser**(`id`?, `idType`?, `password`?): `Promise`<`string`\>

Logs in a user and returns their JWT token

#### Example [​](#example-22)

typescript

```
import { userManager } from '@modular-rest/server';

try {
  // Login with email
  const token = await userManager.loginUser('user@example.com', 'email', 'password123');

  // Login with phone
  const token = await userManager.loginUser('+1234567890', 'phone', 'password123');
} catch (error) {
  console.error('Login failed:', error);
}
```

#### Parameters [​](#parameters-20)

Parameter

Type

Default value

Description

`id`?

`string`

`''`

The ID of the user (email or phone)

`idType`?

`string`

`''`

The type of the ID (phone or email)

`password`?

`string`

`''`

The password of the user

#### Returns [​](#returns-21)

`Promise`<`string`\>

Promise resolving to the JWT token

#### Throws [​](#throws-12)

If user is not found or credentials are invalid

* * *

### registerTemporaryID() [​](#registertemporaryid)

> **registerTemporaryID**(`id`, `type`, `code`): `string`

Registers a temporary ID for verification or password reset

#### Example [​](#example-23)

typescript

```
import { userManager } from '@modular-rest/server';

const tempId = userManager.registerTemporaryID('user@example.com', 'password_reset', '123456');
```

#### Parameters [​](#parameters-21)

Parameter

Type

Description

`id`

`string`

The ID to register

`type`

`string`

The type of temporary ID

`code`

`string`

The verification code

#### Returns [​](#returns-22)

`string`

The registered ID

* * *

### registerUser() [​](#registeruser)

> **registerUser**(`detail`): `Promise`<`string`\>

Registers a new user

#### Example [​](#example-24)

typescript

```
import { userManager } from '@modular-rest/server';

try {
  const token = await userManager.registerUser({
    email: 'user@example.com',
    password: 'secure123',
    permissionGroup: 'user',
    phone: '+1234567890'
  });
  console.log('User registered successfully');
} catch (error) {
  console.error('Registration failed:', error);
}
```

#### Parameters [​](#parameters-22)

Parameter

Type

Description

`detail`

[`UserRegistrationDetail`](/modular-rest/server-client-ts/generative/interfaces/_internal_.UserRegistrationDetail.html)

User registration details

#### Returns [​](#returns-23)

`Promise`<`string`\>

Promise resolving to the JWT token

#### Throws [​](#throws-13)

If user model is not found or registration fails

* * *

### setCustomVerificationCodeGeneratorMethod() [​](#setcustomverificationcodegeneratormethod)

> **setCustomVerificationCodeGeneratorMethod**(`generatorMethod`): `void`

Sets a custom method for generating verification codes

#### Example [​](#example-25)

typescript

```
import { userManager } from '@modular-rest/server';

userManager.setCustomVerificationCodeGeneratorMethod((id, type) => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
});
```

#### Parameters [​](#parameters-23)

Parameter

Type

Description

`generatorMethod`

(`id`, `idType`) => `string`

Function that generates verification codes

#### Returns [​](#returns-24)

`void`

* * *

### submitPasswordForTemporaryID() [​](#submitpasswordfortemporaryid)

> **submitPasswordForTemporaryID**(`id`, `password`, `code`): `Promise`<`string`\>

Submits a password for a temporary ID

#### Example [​](#example-26)

typescript

```
import { userManager } from '@modular-rest/server';

try {
  const token = await userManager.submitPasswordForTemporaryID(
    'user@example.com',
    'newpassword123',
    '123456'
  );
  console.log('Password set successfully');
} catch (error) {
  console.error('Failed to set password:', error);
}
```

#### Parameters [​](#parameters-24)

Parameter

Type

Description

`id`

`string`

The temporary ID

`password`

`string`

The new password

`code`

`string`

The verification code

#### Returns [​](#returns-25)

`Promise`<`string`\>

Promise resolving to the JWT token

#### Throws [​](#throws-14)

If verification code is invalid or user is not found

# Concept [​](#concept-2)

The permission system in this framework provides a robust way to control access to your application's resources. It works by matching permission types that users have against those required by different parts of the system.

### How It Works? [​](#how-it-works)

At its core, the permission system uses access types - special flags like `user_access`, `advanced_settings`, or custom types you define. These access types are used in two key places:

1.  **Permission**: When defining collections or functions, you provide a list of Permission instances that specify which access types are required. Each Permission instance defines what operations (read/write) are allowed for a specific access type. For example, one Permission might allow read access for `user_access`, while another Permission enables write access for `advanced_settings`.
    
2.  **Permission Group**: Each user is assigned certain access types through their permission group. When they try to access a resource, the system checks if they have the required permission types.
    

The system only allows an operation when there's a match between the permission types required by the resource and those assigned to the user making the request.

## Permission [​](#permission)

## Permission Types [​](#permission-types)

## Access Types [​](#access-types)

## Access Definition [​](#access-definition)

## Permission Group [​](#permission-group)

# CORS [​](#cors)

Cross-Origin Resource Sharing (CORS) is a security feature implemented in web browsers to prevent malicious websites from accessing resources and data from another domain without permission. By default, web browsers enforce the same-origin policy, which restricts web pages from making requests to a different domain than the one that served the web page. CORS provides a way for servers to declare who can access their assets and under what conditions, enhancing security while enabling controlled cross-origin requests.

## Understanding CORS [​](#understanding-cors)

CORS is essential for modern web applications that integrate resources from different origins. For instance, if your web application hosted at `http://example.com` tries to request resources from `http://api.example.com`, the browser will block these requests unless the server at `http://api.example.com` includes the appropriate CORS headers in its responses to indicate that such requests are allowed.

The CORS mechanism involves the browser sending an `Origin` header with the origin of the requesting site to the server. The server then decides whether to allow or deny the request based on its CORS policy. If allowed, the server includes the `Access-Control-Allow-Origin` header in its response, specifying which origins can access the resources.

## CORS Configuration [​](#cors-configuration)

The `@modular-rest/server` framework uses `koa/cors` middleware to configure CORS policies. Here's how you can set it up:

### CORS Middleware Options [​](#cors-middleware-options)

Below is a detailed explanation of the CORS configuration options provided by `koa/cors` in `@modular-rest/server`:

### Example Configuration [​](#example-configuration-1)

Here's an example of how to configure CORS in your `@modular-rest/server` application:

javascript

```
import { createRest } from '@modular-rest/server';

const corsOptions = {
    origin: 'https://www.example.com',
    allowMethods: ['GET', 'POST'],
    credentials: true,
    secureContext: true,
};

const app = createRest({
    port: 3000,
    cors: corsOptions,
    // Other configuration options...
});
```

In this configuration:

*   CORS requests are only allowed from `https://www.example.com`.
*   Only `GET` and `POST` methods are permitted.
*   Credentials are allowed in cross-origin requests.
*   Secure context headers are enabled for added security.

## Conclusion [​](#conclusion)

Properly configuring CORS is crucial for securing your application and enabling necessary cross-origin requests. `@modular-rest/server` simplifies this process by integrating `koa/cors` middleware, providing a flexible and powerful way to define your CORS policy. By understanding and utilizing these settings, developers can ensure that their web applications are secure and functional across different domains.