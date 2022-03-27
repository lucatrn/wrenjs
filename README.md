# WrenJS

Using [emscripten](https://emscripten.org/) to transpile Bob Nystrom's [wren](http:wren.io) programming language to Javascript (version 0.4.0).

## Usage

Requires two files:

* [wren.js](out/wren.js) - A JavaScript module that manages talking to Wren in Wasm land.
* [wren.wasm](out/wren.wasm) - The C Wren API compiled to Wasm, with a few custom wrapper functions.

### Example

```js
import * as Wren from "./wren.js";

await Wren.load();

let vm = new Wren.VM();

vm.interpret("main", `System.print("Hello world!")`);
```

## Documentation

The JavaScript API is documented by [wren.d.ts](src/wren.d.ts).

The JavaScript API closely matches the C API, so the [official Wren Embedding guide](https://wren.io/embedding/) should be useful too.

For examples see [the example folder](example).

## Build Instructions

Supported platforms:

- Windows
- Mac
- Ubuntu-like

Required tools:

- python
- nodejs
- git

### Mac / Ubuntu

Run `build.sh`.

### Windows

Run `build.bat`.
