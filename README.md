# @swarmica/msw-auto-mock

A cli tool to generate **stable** mock data from OpenAPI descriptions for [msw](https://github.com/mswjs/msw).

## Why

We already have all the type definitions from OpenAPI spec so hand-writing every response resolver is completely unnecessary.

Install:

```sh
npm i @swarmica/msw-auto-mock -D
```

Read from your OpenAPI descriptions and output generated code:

```sh
# can be http url or a file path on your machine, support both yaml and json.
npx msw-auto-mock http://your_openapi.json -o ./mock
```

For Node.js integration, you can import from `your_output/node.js`:

```js
import { server } from './mock/node.js';
```

## Options

- `-o, --output`: specify output file path or output to stdout.
- `-t, --includes <keywords>`: specify keywords to match if you want to generate mock data only for certain requests, multiple keywords can be seperated with comma.
- `-e, --excludes <keywords>`: specify keywords to exclude, multiple keywords can be seperated with comma.
- `--base-url`: output code with specified base url or fallback to server host specified in OpenAPI.
- `-c, --codes <keywords>`: comma separated list of status codes to generate responses for
- `--typescript`: Generate TypeScript files instead of JavaScript files.
- `-h, --help`: show help info.
