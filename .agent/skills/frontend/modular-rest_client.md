# Javascript Client [​](#javascript-client)

Thank you for choosing `modular-rest` to build your app. You can install the client by installing the package from npm.

## Install Client App [​](#install-client-app)

it assumed you already have a fronted project based on javascript, it dose not matter what framework you are using, you can use `modular-rest` with any javascript framework.

Just use below command:

npmyarn

sh

```
npm install @modular-rest/client
```

sh

```
yarn add @modular-rest/client
```

## Setup the client [​](#setup-the-client)

You need to setup the global configuration for the client in any initialization file of your project, for example in `src/index.js` file.

js

```
import { GlobalOptions } from "@modular-rest/client";

GlobalOptions.set({
	// the base url of the server, it should match with the server address
	host: 'http://localhost:8080',
});
```

## Use the client [​](#use-the-client)

Now you can use the client in your project, for example to use the `AuthService` service, import it as follows:

js

```
import { authentication, dataProvider } from '@modular-rest/client';

// first login with any available methods.
authentication.loginWithLastSession()

// After login, you can use either the dataProvider service or other available services of the client.
const cities = await dataProvider.find<City>({
  database: 'geography',
  collection: 'cities',
  query: { population: { $gt: 1000000 } },
  options: { limit: 10, sort: { population: -1 } }
});
```

# AuthService Service [​](#authservice-service)

The `AuthService` class handles the authentication process, including login, token management, and user session handling.

## Importing the Service [​](#importing-the-service)

To use the `AuthService` service, import it as follows:

typescript

```
import { authentication } from '@modular-rest/client';
```

## Public Properties [​](#public-properties)

Property

Description

user

The currently authenticated user, or null if no user is authenticated.

isLogin

A boolean indicating if the user is currently logged in.

## `login()` [​](#login)

Logs in the user with the provided credentials.

### Arguments [​](#arguments)

Argument

Type

Description

`identity`

`IdentityType`

The identity of the user (e.g., username or email).

`password`

`string`

The user's password.

`options`

`LoginOptionsType`

Additional login options.

### Return and Throw [​](#return-and-throw)

Returns

Description

`Promise<LoginResponseType>`

The login response data.

Throws

`Error` if the login fails.

### Example [​](#example)

typescript

```
authentication.login('user@example.com', 'password123', { rememberMe: true })
    .then(response => {
        console.log('Login successful:', response);
    })
    .catch(error => {
        console.error('Login failed:', error);
    });
```

## `loginWithLastSession()` [​](#loginwithlastsession)

Logs in with the last session if you pass `allowSave=true` in the last login.

### Arguments [​](#arguments-1)

Argument

Type

Description

`token`

`string`

The token for the last session (optional).

### Return and Throw [​](#return-and-throw-1)

Returns

Description

`Promise<User>`

The logged-in user data.

Throws

`Error` if the login fails.

### Example [​](#example-1)

typescript

```
authentication.loginWithLastSession()
    .then(user => {
        console.log('Logged in with last session:', user);
    })
    .catch(error => {
        console.error('Login with last session failed:', error);
    });
```

## `loginAsAnonymous()` [​](#loginasanonymous)

Logs in as an anonymous user and retrieves a token.

Return and Throw Table:

Returns

Description

`Promise<LoginResponseType>`

The login response data containing the token.

Throws

`Error` if the login fails.

### Example [​](#example-2)

typescript

```
authService.loginAsAnonymous()
    .then(response => {
        console.log('Anonymous login successful:', response);
    })
    .catch(error => {
        console.error('Anonymous login failed:', error);
    });
```

## `logout()` [​](#logout)

Logs out the current user and clears the session.

### Return and Throw [​](#return-and-throw-2)

Returns

Description

`void`

No return value.

Throws

None

### Example [​](#example-3)

typescript

```
authentication.logout();
```

## `verifyToken()` [​](#verifytoken)

Verifies the provided token.

### Arguments [​](#arguments-2)

Argument

Type

Description

`token`

`string`

The token to verify.

### Return and Throw [​](#return-and-throw-3)

Returns

Description

`Promise<VerifyTokenResponseType>`

The token verification response data.

Throws

`Error` if the token verification fails.

### Example [​](#example-4)

typescript

```
authentication.verifyToken('some-jwt-token')
    .then(response => {
        console.log('Token verification successful:', response);
    })
    .catch(error => {
        console.error('Token verification failed:', error);
    });
```

## `registerIdentity()` [​](#registeridentity)

Registers a user identity, the first step for creating a new account.

### Arguments [​](#arguments-3)

Argument

Type

Description

`identity`

`IdentityType`

The identity of the user.

### Return and Throw [​](#return-and-throw-4)

Returns

Description

`Promise<BaseResponseType>`

The registration response data.

Throws

`Error` if the registration fails.

### Example [​](#example-5)

typescript

```
authentication.registerIdentity({ idType: 'email', id: 'user@example.com' })
    .then(response => {
        console.log('Identity registered:', response);
    })
    .catch(error => {
        console.error('Identity registration failed:', error);
    });
```

## `validateCode()` [​](#validatecode)

Validates the provided code.

### Arguments [​](#arguments-4)

Argument

Type

Description

`code`

`string`

The code to validate.

### Return and Throw [​](#return-and-throw-5)

Returns

Description

`Promise<ValidateCodeResponseType>`

The validation response data.

Throws

`Error` if the validation fails.

### Example [​](#example-6)

typescript

```
authentication.validateCode('123456')
    .then(response => {
        console.log('Code validation successful:', response);
    })
    .catch(error => {
        console.error('Code validation failed:', error);
    });
```

## `submitPassword()` [​](#submitpassword)

Submits a password, the third step for creating a new account.

### Arguments [​](#arguments-5)

Argument

Type

Description

`options`

`object`

The password submission options.

`options.id`

`string`

The user identity.

`options.password`

`string`

The user's password.

`options.code`

`string`

The verification code.

### Return and Throw [​](#return-and-throw-6)

Returns

Description

`Promise<BaseResponseType>`

The password submission response data.

Throws

`Error` if the submission fails.

### Example [​](#example-7)

typescript

```
authentication.submitPassword({ id: 'user@example.com', password: 'newpassword', code: '123456' })
    .then(response => {
        console.log('Password submitted successfully:', response);
    })
    .catch(error => {
        console.error('Password submission failed:', error);
    });
```

## `changePassword()` [​](#changepassword)

Changes the user's password.

### Arguments [​](#arguments-6)

Argument

Type

Description

`options`

`object`

The password change options.

`options.id`

`string`

The user identity.

`options.password`

`string`

The new password.

`options.code`

`string`

The verification code.

### Return and Throw [​](#return-and-throw-7)

Returns

Description

`Promise<BaseResponseType>`

The password change response data.

Throws

`Error` if the change fails.

### Example [​](#example-8)

typescript

```
authentication.changePassword({ id: 'user@example.com', password: 'newpassword', code: '123456' })
    .then(response => {
        console.log('Password changed successfully:', response);
    })
    .catch(error => {
        console.error('Password change failed:', error);
    });
```

# DataProvider Service Documentation [​](#dataprovider-service-documentation)

The DataProvider service is a singleton class that provides methods for interacting with a database through HTTP requests. It offers various operations such as finding, updating, inserting, and aggregating data.

To use the DataProvider service, import it as follows:

typescript

```
import { dataProvider } from '@modular-rest/client'
```

## `list()` [​](#list)

Returns an object containing pagination information and controller methods for fetching paginated data.

### Arguments [​](#arguments-7)

Name

Type

Description

findOption

FindQueryType

Query options for finding data

paginationOption

Object

Options for pagination (limit, page, onFetched)

### Returns/Throws [​](#returns-throws)

Type

Description

`PaginatedResponseType<T>`

Object with pagination info and control methods

Error

Throws if the HTTP request fails

### Example [​](#example-9)

typescript

```
// Initialize a paginated list of red flowers
const flowerList = dataProvider.list<Flower>(
  {
    database: 'botany',
    collection: 'flowers',
    query: { color: 'red' }
  },
  { limit: 20, page: 1, onFetched: (flowers) => console.log(flowers) }
);

// Need Update pagination after initialization
await flowerList.updatePagination();

// Fetch the first page
await flowerList.fetchPage(1);
```

## `find()` [​](#find)

Retrieves an array of documents from the specified database and collection.

### Arguments [​](#arguments-8)

Name

Type

Description

options

FindQueryType

Query options for finding data

### Returns/Throws [​](#returns-throws-1)

Type

Description

`Promise<Array<T>>`

Resolves to an array of found documents

Error

Throws if the HTTP request fails

### Example [​](#example-10)

typescript

```
const cities = await dataProvider.find<City>({
  database: 'geography',
  collection: 'cities',
  query: { population: { $gt: 1000000 } },
  options: { limit: 10, sort: { population: -1 } }
});
```

## `findByIds()` [​](#findbyids)

Retrieves documents by their IDs from the specified database and collection.

### Arguments [​](#arguments-9)

Name

Type

Description

options

FindByIdsQueryType

Options for finding documents by IDs

### Returns/Throws [​](#returns-throws-2)

Type

Description

`Promise<Array<T>>`

Resolves to an array of found documents

Error

Throws if the HTTP request fails

### Example [​](#example-11)

typescript

```
const specificCities = await dataProvider.findByIds<City>({
  database: 'geography',
  collection: 'cities',
  ids: ['city123', 'city456', 'city789'],
  accessQuery: { country: 'USA' }
});
```

## `findOne()` [​](#findone)

Retrieves a single document from the specified database and collection.

### Arguments [​](#arguments-10)

Name

Type

Description

options

FindQueryType

Query options for finding a single document

### Returns/Throws [​](#returns-throws-3)

Type

Description

`Promise<T>`

Resolves to the found document

Error

Throws if the HTTP request fails

### Example [​](#example-12)

typescript

```
const capital = await dataProvider.findOne<City>({
  database: 'geography',
  collection: 'cities',
  query: { isCapital: true, country: 'France' }
});
```

## `count()` [​](#count)

Counts the number of documents matching the specified query.

### Arguments [​](#arguments-11)

Name

Type

Description

options

FindQueryType

Query options for counting documents

### Returns/Throws [​](#returns-throws-4)

Type

Description

`Promise<number>`

Resolves to the count of matching documents

Error

Throws if the HTTP request fails

### Example [​](#example-13)

typescript

```
const roseCount = await dataProvider.count({
  database: 'botany',
  collection: 'flowers',
  query: { genus: 'Rosa' }
});
```

## `updateOne()` [​](#updateone)

Updates a single document in the specified database and collection.

### Arguments [​](#arguments-12)

Name

Type

Description

options

UpdateQueryType

Query and update options for modifying a document

### Returns/Throws [​](#returns-throws-5)

Type

Description

`Promise<any>`

Resolves to the result of the update operation

Error

Throws if the HTTP request fails

### Example [​](#example-14)

typescript

```
const updateResult = await dataProvider.updateOne({
  database: 'geography',
  collection: 'cities',
  query: { name: 'New York' },
  update: { $set: { population: 8500000 } }
});
```

## `insertOne()` [​](#insertone)

Inserts a single document into the specified database and collection.

### Arguments [​](#arguments-13)

Name

Type

Description

options

InsertQueryType

Options for inserting a new document

### Returns/Throws [​](#returns-throws-6)

Type

Description

`Promise<any>`

Resolves to the result of the insert operation

Error

Throws if the HTTP request fails

### Example [​](#example-15)

typescript

```
const newFlower = await dataProvider.insertOne({
  database: 'botany',
  collection: 'flowers',
  doc: { name: 'Sunflower', genus: 'Helianthus', color: 'yellow' }
});
```

## `removeOne()` [​](#removeone)

Removes a single document from the specified database and collection.

### Arguments [​](#arguments-14)

Name

Type

Description

options

FindQueryType

Query options for removing a document

### Returns/Throws [​](#returns-throws-7)

Type

Description

`Promise<any>`

Resolves to the result of the remove operation

Error

Throws if the HTTP request fails

### Example [​](#example-16)

typescript

```
const removeResult = await dataProvider.removeOne({
  database: 'geography',
  collection: 'cities',
  query: { name: 'Ghost Town', population: 0 }
});
```

## `aggregate()` [​](#aggregate)

Performs an aggregation operation on the specified database and collection.

### Arguments [​](#arguments-15)

Name

Type

Description

options

AggregateQueryType

Options for the aggregation pipeline

### Returns/Throws [​](#returns-throws-8)

Type

Description

`Promise<Array<T>>`

Resolves to the result of the aggregation

Error

Throws if the HTTP request fails

### Example [​](#example-17)

typescript

```
const flowerStats = await dataProvider.aggregate<FlowerStats>({
  database: 'botany',
  collection: 'flowers',
  pipelines: [
    { $group: { _id: '$color', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ],
  accessQuery: { genus: { $in: ['Rosa', 'Tulipa'] } }
});
```

# FileProvider Service Documentation [​](#fileprovider-service-documentation)

The FileProvider service is responsible for managing file operations such as uploading, removing, and retrieving file information. It provides methods to interact with files on the server and manage file metadata.

To use the FileProvider service, import it as follows:

javascript

```
import { fileProvider } from '@modular-rest/client'
```

## `uploadFile()` [​](#uploadfile)

Uploads a file to the server.

### Arguments [​](#arguments-16)

Name

Type

Description

file

string | Blob

The file to be uploaded

onProgress

(progressEvent: ProgressEvent) => void

Callback function to track upload progress

tag

string (optional)

Tag for the file, defaults to "untagged"

### Return and Throw [​](#return-and-throw-8)

Type

Description

`Promise<FileDocument>`

Resolves with the uploaded file document

Error

Throws an error if the upload fails

### Example [​](#example-18)

javascript

```
const file = new Blob(['Hello, World!'], { type: 'text/plain' });
const onProgress = (event) => console.log(`Upload progress: ${event.loaded / event.total * 100}%`);

fileProvider.uploadFile(file, onProgress, 'documents')
  .then(fileDoc => console.log('Uploaded file:', fileDoc))
  .catch(error => console.error('Upload failed:', error));
```

## `uploadFileToURL()` [​](#uploadfiletourl)

Uploads a file to a specific URL.

### Arguments [​](#arguments-17)

Name

Type

Description

url

string

The URL to upload the file to

file

string

Blob

body

any (optional)

Additional data to be sent with the request

onProgress

(progressEvent: ProgressEvent) => void

Callback function to track upload progress

tag

string

Tag for the file

### Return and Throw [​](#return-and-throw-9)

Type

Description

`Promise<any>`

Resolves with the response from the server

Error

Throws an error if the upload fails

### Example [​](#example-19)

javascript

```
const url = 'https://api.example.com/upload';
const file = new Blob(['Flower data'], { type: 'text/plain' });
const body = { category: 'flora' };
const onProgress = (event) => console.log(`Upload progress: ${event.loaded / event.total * 100}%`);

fileProvider.uploadFileToURL(url, file, body, onProgress, 'botanical')
  .then(response => console.log('Upload response:', response))
  .catch(error => console.error('Upload failed:', error));
```

## `removeFile()` [​](#removefile)

Removes a file from the server.

### Arguments [​](#arguments-18)

Name

Type

Description

id

string

The ID of the file to be removed

### Return and Throw [​](#return-and-throw-10)

Type

Description

`Promise<any>`

Resolves with the response from the server

Error

Throws an error if the removal fails

### Example [​](#example-20)

javascript

```
const fileId = '123456789';

fileProvider.removeFile(fileId)
  .then(response => console.log('File removed successfully:', response))
  .catch(error => console.error('File removal failed:', error));
```

## `getFileLink()` [​](#getfilelink)

Generates a URL for accessing a file.

### Arguments [​](#arguments-19)

Name

Type

Description

fileDoc

`{ fileName: string; format: string; tag: string }`

File document object

overrideUrl

string (optional)

Optional URL to override the default

rootPath

string (optional)

Root path for the file, defaults to "assets"

### Return and Throw [​](#return-and-throw-11)

Type

Description

string

The generated URL for the file

### Example [​](#example-21)

javascript

```
const fileDoc = {
  fileName: 'city_map.jpg',
  format: 'images',
  tag: 'maps'
};

const fileUrl = fileProvider.getFileLink(fileDoc);
console.log('File URL:', fileUrl);
```

## `getFileDoc()` [​](#getfiledoc)

Retrieves a file document by its ID and user ID.

### Arguments [​](#arguments-20)

Name

Type

Description

id

string

The ID of the file

userId

string

The ID of the user who owns the file

### Return and Throw [​](#return-and-throw-12)

Type

Description

`Promise<FileDocument>`

Resolves with the file document

Error

Throws an error if the file document cannot be found

### Example [​](#example-22)

javascript

```
const fileId = '987654321';
const userId = 'user123';

fileProvider.getFileDoc(fileId, userId)
  .then(fileDoc => console.log('File document:', fileDoc))
  .catch(error => console.error('Failed to retrieve file document:', error));
```

## `getFileDocsByTag()` [​](#getfiledocsbytag)

Retrieves file documents by tag and user ID.

### Arguments [​](#arguments-21)

Name

Type

Description

tag

string

The tag to search for

userId

string

The ID of the user who owns the files

### Return and Throw [​](#return-and-throw-13)

Type

Description

`Promise<FileDocument[]>`

Resolves with an array of file documents

Error

Throws an error if the file documents cannot be found

### Example [​](#example-23)

javascript

```
const tag = 'flowers';
const userId = 'user456';

fileProvider.getFileDocsByTag(tag, userId)
  .then(fileDocs => console.log('File documents:', fileDocs))
  .catch(error => console.error('Failed to retrieve file documents:', error));
```

# FunctionProvider Service Documentation [​](#functionprovider-service-documentation)

The FunctionProvider service allows executing server-side functions from the client. It provides a simple interface to run named functions with arguments and receive the result.

TIP

To learn how to define functions on the server, check out the [Server-side Functions documentation](/modular-rest/server-client-ts/modules/functions.html).

To use the FunctionProvider service, import it as follows:

javascript

```
import { functionProvider } from '@modular-rest/client'
```

## `run()` [​](#run)

Executes a server-side function.

### Arguments [​](#arguments-22)

Name

Type

Description

options

`{ name: string; args: any }`

Object containing function name and arguments

### Return and Throw [​](#return-and-throw-14)

Type

Description

`Promise<any>`

Resolves with the result returned by the server-side function

Error

Throws an error if the function execution fails or returns an error

### Example [​](#example-24)

javascript

```
const options = {
  name: 'calculateSum',
  args: { a: 10, b: 20 }
};

functionProvider.run(options)
  .then(result => console.log('Function result:', result))
  .catch(error => console.error('Function execution failed:', error));
```

This would be the HttpClient service documentation