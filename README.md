# WrenJS

Using [emscripten](https://emscripten.org/) to transpile Bob Nystrom's [wren](http:wren.io) programming language to Javascript (version 0.4.0).

## Usage

Requires two files:

* [wren.js](out/wren.js) - A JavaScript module that manages talking to Wren in Wasm land.
* [wren.wasm](out/wren.wasm) - The C Wren API compiled to Wasm, with a few custom wrapper functions.

### Example

```js
import Wren from "./wren.js";

await Wren.load();

let vm = new Wren.VM();

vm.interpret("main", `System.print("Hello world!")`);
```

## Documentation

The JavaScript API is documented by [wren.d.ts](src/wren.d.ts).

The JavaScript API closely matches the C API, so the [official Wren Embedding guide](https://wren.io/embedding/) should be useful too.

[See here for live examples](https://luca.games/wrenjs/example/hello-world.html).

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

## Custom C Extensions


You can provide custom C code to provide foreign classes and methods, which works in conjucation with the JavaScript API.

Just provide the path to your C file as the first argument to the build script.

```
build.bat my_extensions.c
```

```c
// my_extensions.c

#include "wren.h"

// Return with [WrenForeignClassMethods.allocator] set to null to use JavaScript binder.
WrenForeignClassMethods bindForeignClass(WrenVM* vm, const char* module, const char* className) {
	// ...
}

// Return [null] to use JavaScript binder.
WrenForeignMethodFn bindForeignMethod(WrenVM* vm, const char* module, const char* className, bool isStatic, const char* signature) {
	// ...
}
```

> This script option is currently windows only.
