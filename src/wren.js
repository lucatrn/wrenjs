import moduleFactory from '../tmp/wren.js';

let Module;

export async function load() {
	if (!Module) {
		Module = await moduleFactory();
		Module._VMs = {};
		Module._values = [];
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

export let Result = {
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
		let defaultConfig = {
			resolveModuleFn     : defaultResolveModuleFn,
			loadModuleFn        : defaultLoadModuleFn,
			bindForeignMethodFn : defaultBindForeignMethodFn,
			bindForeignClassFn  : defaultBindForeignClassFn,
			writeFn             : defaultWriteFn,
			errorFn             : defaultErrorFn,
		}
		this.config = Object.assign(defaultConfig, config);

		this._pointer = Module.ccall('shimNewVM',
			'number',
			[],
			[]
		);

		Module._VMs[this._pointer] = this;

		/** Write buffer. Flushed whenever we get a newline. */
		this._wb = "";
	}

	get Module() { return Module; }
	get heap() { return Module.HEAP8.buffer; }

	// // Since these are aligned, are they guaranteed to work with Wren's memory?
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
		return this.config.loadModuleFn(name);
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
			[this._pointer]
		);
		delete Module._VMs[this._pointer]
		this._pointer = undefined;
	}

	collectGarbage() {
		Module.ccall('wrenCollectGarbage',
			null,
			['number'],
			[this._pointer]
		);
	}

	interpret(moduleName, src) {
		return Module.ccall('wrenInterpret',
			'number',
			['number', 'string', 'string'],
			[this._pointer, moduleName, src]
		);
	}

	makeCallHandle(signature) {
		return Module.ccall('wrenMakeCallHandle',
			'number',
			['number', 'string'],
			[this._pointer, signature]
		);
	}

	call(method) {
		let result = Module.ccall('wrenCall',
			'number',
			['number', 'number'],
			[this._pointer, method]
		);

		return result;
	}

	releaseHandle(handle) {
		Module.ccall('wrenReleaseHandle',
			null,
			['number', 'number'],
			[this._pointer, handle]
		);
	}


	getSlotCount() {
		return Module.ccall('wrenGetSlotCount',
			'number',
			['number'],
			[this._pointer]
		);
	}

	ensureSlots(numSlots) {
		Module.ccall('wrenEnsureSlots',
			null,
			['number', 'number'],
			[this._pointer, numSlots]
		);
	}

	getSlotType(slot) {
		return Module.ccall('wrenGetSlotType',
			'number',
			['number', 'number'],
			[this._pointer, slot]
		);
	}

	getSlotBool(slot) {
		return Module.ccall('wrenGetSlotBool',
			'boolean',
			['number', 'number'],
			[this._pointer, slot]
		);
	}

	getSlotBytes(slot, length) {
		let ptr = Module.ccall('wrenGetSlotBytes',
			'number',
			['number', 'number', 'number'],
			[this._pointer, slot, length]
		);

		return new Uint8Array(this.heap, ptr, length);
	}

	getSlotDouble(slot) {
		return Module.ccall('wrenGetSlotDouble',
			'number',
			['number', 'number'],
			[this._pointer, slot]
		);
	}

	getSlotForeign(slot) {
		return Module.ccall('wrenGetSlotForeign',
			'number',
			['number', 'number'],
			[this._pointer, slot]
		);
	}

	getSlotString(slot) {
		return Module.ccall('wrenGetSlotString',
			'string',
			['number', 'number'],
			[this._pointer, slot]
		);
	}

	getSlotHandle(slot) {
		return Module.ccall('wrenGetSlotHandle',
			'number',
			['number', 'number'],
			[this._pointer, slot]
		);
	}

	setSlotBool(slot, value) {
		Module.ccall('wrenSetSlotBool',
			null,
			['number', 'number', 'boolean'],
			[this._pointer, slot, value]
		);
	}

	setSlotBytes(slot, bytes, length) {
		Module.ccall('wrenSetSlotBytes',
			null,
			['number', 'number', 'array', 'number'],
			[this._pointer, slot, bytes, length]
		);
	}

	setSlotDouble(slot, value) {
		Module.ccall('wrenSetSlotDouble',
			null,
			['number', 'number', 'number'],
			[this._pointer, slot, value]
		);
	}

	setSlotNewForeign(slot, classSlot, size) {
		return Module.ccall('wrenSetSlotNewForeign',
			'number',
			['number', 'number', 'number', 'number'],
			[this._pointer, slot, classSlot, size]
		);
	}

	setSlotNewList(slot) {
		Module.ccall('wrenSetSlotNewList',
			null,
			['number', 'number'],
			[this._pointer, slot]
		);
	}

	setSlotNewMap(slot) {
		Module.ccall('wrenSetSlotNewMap',
			null,
			['number', 'number'],
			[this._pointer, slot]
		);
	}

	setSlotNull(slot) {
		Module.ccall('wrenSetSlotNull',
			null,
			['number', 'number'],
			[this._pointer, slot]
		);
	}

	setSlotString(slot, text) {
		Module.ccall('wrenSetSlotString',
			null,
			['number', 'number', 'string'],
			[this._pointer, slot, text]
		);
	}

	setSlotHandle(slot, handle) {
		Module.ccall('wrenSetSlotHandle',
			null,
			['number', 'number', 'number'],
			[this._pointer, slot, handle]
		);
	}

	getListCount(slot) {
		return Module.ccall('wrenGetListCount',
			'number',
			['number', 'number'],
			[this._pointer, slot]
		);
	}

	getListElement(listSlot, index, elementSlot) {
		Module.ccall('wrenGetListElement',
			null,
			['number', 'number', 'number', 'number'],
			[this._pointer, listSlot, index, elementSlot]
		);
	}

	setListElement(listSlot, index, elementSlot) {
		Module.ccall('wrenSetListElement',
			null,
			['number', 'number', 'number', 'number'],
			[this._pointer, listSlot, index, elementSlot]
		);
	}

	insertInList(listSlot, index, elementSlot) {
		Module.ccall('wrenInsertInList',
			null,
			['number', 'number', 'number', 'number'],
			[this._pointer, listSlot, index, elementSlot]
		);
	}

	getMapCount(slot) {
		return Module.ccall('wrenGetMapCount',
			'number',
			['number', 'number'],
			[this._pointer, slot]
		);
	}

	getMapContainsKey(mapSlot, keySlot) {
		return Module.ccall('wrenGetMapContainsKey',
			'boolean',
			['number', 'number', 'number'],
			[this._pointer, mapSlot, keySlot]
		);
	}

	getMapValue(mapSlot, keySlot, valueSlot) {
		Module.ccall('wrenGetMapValue',
			null,
			['number', 'number', 'number', 'number'],
			[this._pointer, mapSlot, keySlot, valueSlot]
		);
	}

	setMapValue(mapSlot, keySlot, valueSlot) {
		Module.ccall('wrenSetMapValue',
			null,
			['number', 'number', 'number', 'number'],
			[this._pointer, mapSlot, keySlot, valueSlot]
		);
	}

	removeMapValue(mapSlot, keySlot, removedValueSlot) {
		Module.ccall('wrenRemoveMapValue',
			null,
			['number', 'number', 'number', 'number'],
			[this._pointer, mapSlot, keySlot, removedValueSlot]
		);
	}

	getVariable(moduleName, name, slot) {
		Module.ccall('wrenGetVariable',
			null,
			['number', 'string', 'string', 'number'],
			[this._pointer, moduleName, name, slot]
		);
	}

	hasVariable(moduleName, name) {
		return Module.ccall('wrenHasVariable',
			'boolean',
			['number', 'string', 'string'],
			[this._pointer, moduleName, name]
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
			[this._pointer, moduleName]
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
			[this._pointer, slot]
		);
	}
}

function defaultResolveModuleFn(importer, name) {
	return name;
}

function defaultLoadModuleFn(name) {
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

function defaultErrorFn(errorType, moduleName, line, msg) {
	let s = "WREN: ";
	if (errorType === 0) {
		s += "[" + moduleName + " line " + line + "] [Error] " + msg + "\n";
	} else if (errorType === 1) {
		s += "[" + moduleName + " line " + line + "] in " + msg + "\n";
	} else if (errorType === 2) {
		s += "[Runtime Error] " + msg + "\n";
	}
	console.error(s);
}
