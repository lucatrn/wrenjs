import moduleFactory from '../tmp/wren.js';

let Module;
let HEAPU8;

export async function load() {
	if (!Module) {
		Module = {};
		Module = await moduleFactory();
		HEAPU8 = Module.HEAPU8;
		Module._VMs = {};
	}
}

export function getVersionNumber() {
	return Module.ccall('wrenGetVersionNumber', 'number', [], []);
}

export let ErrorType = {
	COMPILE:      0,
	RUNTIME:      1,
	STACK_TRACE:  2,
};

export let InterpretResult = {
	SUCCESS:        0,
	COMPILE_ERROR:  1,
	RUNTIME_ERROR:  2,
};

export let Type = {
	BOOL:     0,
	NUM:      1,
	FOREIGN:  2,
	LIST:     3,
	MAP:      4,
	NULL:     5,
	STRING:   6,
	UNKNOWN:  7,
};

export class VM {
	constructor(config) {
		this.config = Object.assign({}, defaultConfig, config);

		/** Pointer to C VM. */
		this._ptr = Module.ccall('shimNewVM',
			'number',
			[],
			[]
		);

		Module._VMs[this._ptr] = this;

		/** Write buffer. Flushed whenever we get a newline. */
		this._wb = "";
	}

	get Module() { return Module; }
	get heap() { return HEAPU8.buffer; }

	// // Since these are memory aligned, are they guaranteed to work with Wren's memory?
	// get getValue() { return Module.getValue; }
	// get setValue() { return Module.setValue; }


	// Called from C

	/**
	 * @param {string} importer
	 * @param {string} name
	 */
	_resolveModule(importer, name) {
		return this.config.resolveModuleFn(importer, name);
	}

	/**
	 * @param {string} name
	 * @returns {string}
	 */
	_loadModule(name) {
		let source = this.config.loadModuleFn(name);

		if (source && source.then) {
			// Handle Promise<string>
			//
			// Need to do extra work since C API expects sync source resolution, and WASM can't natively block on Promises.
			//
			// The solutions I've considered are:
			//
			// 1. Emscripten Asyncify.
			//      Works but has considerable size + speed impacts.
			//
			// 2. Re-write Wren to use a callback approach
			//      Problably the most performant option, but then we'd have a dependency on a fork of Wren and it's details.
			//
			// 3. Use `Fiber.suspend()` to block the Wren script until the source is loaded.
			//      This feels pretty hacky, but seems to work well?
			//      Although, this is actually a nice demonstration of Fibers' usefulness!
			//
			// I've gone with the last option since it's the simplest and has minimal performance impact.

			// Store a reference to to module Fiber in variable `__self`, then suspend.
			// (We want this variable name to be unusual, as to not be shadowed accidently by actual code).
			// Once we get the source, we interpret it in the same module name.
			// The scripts variables will still be put into same Module's context, but it'll be running in a seprate Fiber.
			source.then(resolvedSource => {
				if (resolvedSource == null) {
					// No loaded source is normally an error, but to Wren the script successfully loaded!
					// So send a fake version of the error back to the original Fiber.
					resolvedSource = `self__.transferError(${stringToWrenString(`Could not load module '${name}'`)})`;
				} else {
					// Run script and then transfer back to original Fiber at end.
					resolvedSource += "\nself__.transfer()";
				}

				this.interpret(name, resolvedSource);
			}, error => {
				console.warn(`Error loading module source for "${name}"`, error);

				// Need to send promise errors back to original Fiber.
				this.interpret(name, `self__.transferError(${stringToWrenString(String(error))})`);
			});

			return "var self__=Fiber.current\nFiber.suspend()\nself__=null";
		}

		return source;
	}

	/**
	 * @param {string} moduleName
	 * @param {string} className
	 * @param {boolean} isStatic
	 * @param {string} signature
	 * @returns {number} the function pointer
	 */
	_bindForeignMethod(moduleName, className, isStatic, signature) {
		/** @type {(vm: VM) => void} */
		let method = this.config.bindForeignMethodFn(moduleName, className, isStatic, signature);

		return method ? Module.addFunction(method.bind(null, this), "vi") : 0;
	}

	/**
	 * @param {string} moduleName
	 * @param {string} className
	 * @param {number} foreignClassMethodsPointer
	 */
	_bindForeignClass(moduleName, className, foreignClassMethodsPointer) {
		let methods = this.config.bindForeignClassFn(moduleName, className);

		if (methods) {
			let allocate = methods.allocate;
			let finalize = methods.finalize;

			let u32 = new Uint32Array(this.heap, foreignClassMethodsPointer);

			if (allocate) {
				u32[0] = Module.addFunction(allocate.bind(null, this), "vi");
			}
			if (finalize) {
				u32[1] = Module.addFunction(finalize, "vi");
			}
		}
	}

	/**
	 * @param {string} text
	 */
	_write(text) {
		// A `System.print("...")` will generate two calls to `WriteFn`, the second being a "\n".
		// So we try to accumulate writes into lines by splitting on "\n".
		let i = 0;
		let next;
		while ((next = text.indexOf("\n", i)) >= 0) {
			let line = this._wb + text.slice(i, next);
			this._wb = "";
			i = next + 1;
			this.config.writeFn(line);
		}
		this._wb += text.slice(i);
	}

	/**
	 * @param {number} errorType
	 * @param {string} moduleName
	 * @param {number} line
	 * @param {string} msg
	 */
	_error(errorType, moduleName, line, msg) {
		this.config.errorFn(errorType, moduleName, line, msg);
	}


	// C API Wrappers

	free() {
		Module.ccall('wrenFreeVM',
			null,
			['number'],
			[this._ptr]
		);
		delete Module._VMs[this._ptr]
		this._ptr = undefined;
	}

	collectGarbage() {
		Module.ccall('wrenCollectGarbage',
			null,
			['number'],
			[this._ptr]
		);
	}

	interpret(moduleName, src) {
		let stack = 0;

		let srcType;
		if (typeof src === "string") {
			srcType = "string";
		} else {
			stack = Module.stackSave();
			src = stackAllocUTF8ArrayAsCString(src);
			srcType = "number";
		}

		let result = Module.ccall('wrenInterpret',
			'number',
			['number', "string", srcType],
			[this._ptr, moduleName, src]
		);

		if (stack) {
			Module.stackRestore(stack);
		}

		return result;
	}

	makeCallHandle(signature) {
		return Module.ccall('wrenMakeCallHandle',
			'number',
			['number', 'string'],
			[this._ptr, signature]
		);
	}

	call(method) {
		let result = Module.ccall('wrenCall',
			'number',
			['number', 'number'],
			[this._ptr, method]
		);

		return result;
	}

	releaseHandle(handle) {
		Module.ccall('wrenReleaseHandle',
			null,
			['number', 'number'],
			[this._ptr, handle]
		);
	}


	getSlotCount() {
		return Module.ccall('wrenGetSlotCount',
			'number',
			['number'],
			[this._ptr]
		);
	}

	ensureSlots(numSlots) {
		Module.ccall('wrenEnsureSlots',
			null,
			['number', 'number'],
			[this._ptr, numSlots]
		);
	}

	getSlotType(slot) {
		return Module.ccall('wrenGetSlotType',
			'number',
			['number', 'number'],
			[this._ptr, slot]
		);
	}

	getSlotBool(slot) {
		return Module.ccall('wrenGetSlotBool',
			'boolean',
			['number', 'number'],
			[this._ptr, slot]
		);
	}

	getSlotBytes(slot, length) {
		let ptr = Module.ccall('wrenGetSlotBytes',
			'number',
			['number', 'number', 'number'],
			[this._ptr, slot, length]
		);

		return new Uint8Array(this.heap, ptr, length);
	}

	getSlotDouble(slot) {
		return Module.ccall('wrenGetSlotDouble',
			'number',
			['number', 'number'],
			[this._ptr, slot]
		);
	}

	getSlotForeign(slot) {
		return Module.ccall('wrenGetSlotForeign',
			'number',
			['number', 'number'],
			[this._ptr, slot]
		);
	}

	getSlotString(slot) {
		return Module.ccall('wrenGetSlotString',
			'string',
			['number', 'number'],
			[this._ptr, slot]
		);
	}

	getSlotHandle(slot) {
		return Module.ccall('wrenGetSlotHandle',
			'number',
			['number', 'number'],
			[this._ptr, slot]
		);
	}

	setSlotBool(slot, value) {
		Module.ccall('wrenSetSlotBool',
			null,
			['number', 'number', 'boolean'],
			[this._ptr, slot, value]
		);
	}

	setSlotBytes(slot, bytes, length) {
		if (length == null) {
			length = bytes.byteLength;
		}

		Module.ccall('wrenSetSlotBytes',
			null,
			['number', 'number', 'array', 'number'],
			[this._ptr, slot, bytes, length]
		);
	}

	setSlotDouble(slot, value) {
		Module.ccall('wrenSetSlotDouble',
			null,
			['number', 'number', 'number'],
			[this._ptr, slot, value]
		);
	}

	setSlotNewForeign(slot, classSlot, size) {
		return Module.ccall('wrenSetSlotNewForeign',
			'number',
			['number', 'number', 'number', 'number'],
			[this._ptr, slot, classSlot, size]
		);
	}

	setSlotNewList(slot) {
		Module.ccall('wrenSetSlotNewList',
			null,
			['number', 'number'],
			[this._ptr, slot]
		);
	}

	setSlotNewMap(slot) {
		Module.ccall('wrenSetSlotNewMap',
			null,
			['number', 'number'],
			[this._ptr, slot]
		);
	}

	setSlotNull(slot) {
		Module.ccall('wrenSetSlotNull',
			null,
			['number', 'number'],
			[this._ptr, slot]
		);
	}

	setSlotString(slot, text) {
		let stack = 0;

		let textType;
		if (typeof text === "string") {
			textType = "string";
		} else {
			stack = Module.stackSave();
			text = stackAllocUTF8ArrayAsCString(text);
			textType = "number";
		}

		Module.ccall('wrenSetSlotString',
			null,
			['number', 'number', textType],
			[this._ptr, slot, text]
		);

		if (stack) {
			Module.stackRestore(stack);
		}
	}

	setSlotHandle(slot, handle) {
		Module.ccall('wrenSetSlotHandle',
			null,
			['number', 'number', 'number'],
			[this._ptr, slot, handle]
		);
	}

	getListCount(slot) {
		return Module.ccall('wrenGetListCount',
			'number',
			['number', 'number'],
			[this._ptr, slot]
		);
	}

	getListElement(listSlot, index, elementSlot) {
		Module.ccall('wrenGetListElement',
			null,
			['number', 'number', 'number', 'number'],
			[this._ptr, listSlot, index, elementSlot]
		);
	}

	setListElement(listSlot, index, elementSlot) {
		Module.ccall('wrenSetListElement',
			null,
			['number', 'number', 'number', 'number'],
			[this._ptr, listSlot, index, elementSlot]
		);
	}

	insertInList(listSlot, index, elementSlot) {
		Module.ccall('wrenInsertInList',
			null,
			['number', 'number', 'number', 'number'],
			[this._ptr, listSlot, index, elementSlot]
		);
	}

	getMapCount(slot) {
		return Module.ccall('wrenGetMapCount',
			'number',
			['number', 'number'],
			[this._ptr, slot]
		);
	}

	getMapContainsKey(mapSlot, keySlot) {
		return Module.ccall('wrenGetMapContainsKey',
			'boolean',
			['number', 'number', 'number'],
			[this._ptr, mapSlot, keySlot]
		);
	}

	getMapValue(mapSlot, keySlot, valueSlot) {
		Module.ccall('wrenGetMapValue',
			null,
			['number', 'number', 'number', 'number'],
			[this._ptr, mapSlot, keySlot, valueSlot]
		);
	}

	setMapValue(mapSlot, keySlot, valueSlot) {
		Module.ccall('wrenSetMapValue',
			null,
			['number', 'number', 'number', 'number'],
			[this._ptr, mapSlot, keySlot, valueSlot]
		);
	}

	removeMapValue(mapSlot, keySlot, removedValueSlot) {
		Module.ccall('wrenRemoveMapValue',
			null,
			['number', 'number', 'number', 'number'],
			[this._ptr, mapSlot, keySlot, removedValueSlot]
		);
	}

	getVariable(moduleName, name, slot) {
		Module.ccall('wrenGetVariable',
			null,
			['number', 'string', 'string', 'number'],
			[this._ptr, moduleName, name, slot]
		);
	}

	hasVariable(moduleName, name) {
		return Module.ccall('wrenHasVariable',
			'boolean',
			['number', 'string', 'string'],
			[this._ptr, moduleName, name]
		);
	}

	/**
	* Returns true if [moduleName] has been imported/resolved before, false if not.
	* @return {boolean} whether the module has been imported/resolved before.
	* @param {string} moduleName the name of the wren module.
	*/
	hasModule(moduleName) {
		return Module.ccall('wrenHasModule',
			'boolean',
			['number', 'string'],
			[this._ptr, moduleName]
		);
	}

	/**
	* Sets the current fiber to be aborted, and uses the value in [slot] as the
	* runtime error object.
	* @param {number} slot the index of the slot.
	*/
	abortFiber(slot) {
		Module.ccall('wrenAbortFiber',
			null,
			['number', 'number'],
			[this._ptr, slot]
		);
	}
}

function stackAllocUTF8ArrayAsCString(src) {
	if (src instanceof ArrayBuffer) {
		src = new Uint8Array(src);
	}

	let nullTerminated = src[src.length - 1] === 0;
	let len = nullTerminated ? src.length : src.length + 1;
	
	let ptr = Module.stackAlloc(len);

	HEAPU8.set(src, ptr);

	if (!nullTerminated) {
		HEAPU8[ptr + len - 1] = 0;
	}

	return ptr;
}

function stringToWrenString(s) {
	let r = '"';

	for (let i = 0; i < s.length; i++) {
		let c = s[i];
		if (c === "\\") {
			r += "\\\\";
		} else if (c === "%" || c === '"') {
			r += "\\" + c;
		} else {
			r += c;
		}
	}

	return r + '"';
}

export let defaultConfig = {
	resolveModuleFn     : defaultResolveModuleFn,
	loadModuleFn        : defaultLoadModuleFn,
	bindForeignMethodFn : defaultBindForeignMethodFn,
	bindForeignClassFn  : defaultBindForeignClassFn,
	writeFn             : defaultWriteFn,
	errorFn             : defaultErrorFn,
};

function defaultResolveModuleFn(importer, name) {
	return name;
}

async function defaultLoadModuleFn(name) {
	return null;
}

function defaultBindForeignMethodFn(moduleName, className, isStatic, signature) {
	return function(vm) {};
}

function defaultBindForeignClassFn(moduleName, className) {
	return null;
}

function defaultWriteFn(line) {
	console.log("WREN: " + line);
}

function defaultErrorFn(errorType, moduleName, line, message) {
	let s;
	if (errorType === 0) {
		// Compile Error
		s = `Compile Error [${moduleName}:${line}]: ${message}`;
	} else if (errorType === 1) {
		// Runtime Error
		s = `Error: ${message}`;
	} else if (errorType === 2) {
		// Stack strack
		s = `at ${message} ${moduleName}:${line}`;
	}
	console.error("WREN: " + s);
	return s;
}

export default {
	load: load,
	getVersionNumber: getVersionNumber,
	ErrorType: ErrorType,
	InterpretResult: InterpretResult,
	Type: Type,
	VM: VM,
	defaultConfig: defaultConfig,
};
