# WrenJS

Using [emscripten](https://emscripten.org/) to transpile Bob Nystrom's [wren](http:wren.io) programming language to Javascript (version 0.4.0).

## Example

```js
import * as Wren from "./wren.js";

await Wren.load();

let vm = new Wren.VM();

vm.interpret("main", `System.print("Hello world!")`);
```

Most of Wren's C API is provided via the `VM` class.

## Documentation

The JavaScript API is documented by [wren.d.ts](src/wren.d.ts).

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
