
/**
 * Asyncronusly loads the Wren WASM code, if not loaded alreadly.
 * 
 * Must be called before the {@link VM} is used.
 */
export function load(): Promise<void>

/**
 * Get the current wren version number as an integer (e.g. 4000 for version 0.4.0).
 */
export function getVersionNumber(): number;

/**
 * A single virtual machine for executing Wren code.
 */
export class VM {
	readonly config: VMConfiguration
	
	constructor(config?: Partial<VMConfiguration>)

	/**
	 * Disposes of all resources in use by the VM.
	 */
	free(): void;

	/**
	 * Immediately run the garbage collector to free unused memory.
	 */
	collectGarbage(): void;

	/**
	 * Runs [source], a string of Wren source code in a new fiber in [vm] in the
	 * context of resolved [moduleName].
	 */
	interpret(moduleName: string, source: string): InterpretResult;
}

/**
 * Confuration for the wren VM.
 * 
 * Equivalent C struct is `WrenConfiguration`.
 */
export interface VMConfiguration {
	/**
	 * The callback Wren uses to resolve a module name.
	 * 
	 * Some host applications may wish to support "relative" imports, where the
	 * meaning of an import string depends on the module that contains it. To
	 * support that without baking any policy into Wren itself, the VM gives the
	 * host a chance to resolve an import string.
	 * 
	 * Before an import is loaded, it calls this, passing in the name of the
	 * module that contains the import and the import string. The host app can
	 * look at both of those and produce a new "canonical" string that uniquely
	 * identifies the module. This string is then used as the name of the module
	 * going forward. It is what is passed to [loadModuleFn], how duplicate
	 * imports of the same module are detected, and how the module is reported in
	 * stack traces.
	 * 
	 * If you leave this function NULL, then the original import string is
	 * treated as the resolved string.
	 * 
	 * If an import cannot be resolved by the embedder, it should return NULL and
	 * Wren will report that as a runtime error.
	 * 
	 * Wren will take ownership of the string you return and free it for you, so
	 * it should be allocated using the same allocation function you provide
	 * above.
	 */
	resolveModuleFn: (importer: string, name: string) => string;
	
	/**
	 * The callback Wren uses to load a module's source code.
	 * 
	 * Since Wren does not talk directly to the file system, it relies on the
	 * embedder to physically locate and read the source code for a module. The
	 * first time an import appears, Wren will call this and pass in the name of
	 * the module being imported. The method will return a result, which contains
	 * the source code for that module. Memory for the source is owned by the 
	 * host application, and can be freed using the onComplete callback.
	 * 
	 * This will only be called once for any given module name. Wren caches the
	 * result internally so subsequent imports of the same module will use the
	 * previous source and not call this.
	 * 
	 * If a module with the given name could not be found by the embedder, it
	 * should return `null` and Wren will report that as a runtime error.
	 */
	loadModuleFn: (name: string) => null | {
		source: string;
		onComplete?: () => void;
	};

	/**
	 * The callback Wren uses to find a foreign method and bind it to a class.
	 * 
	 * When a foreign method is declared in a class, this will be called with the
	 * foreign method's module, class, and signature when the class body is
	 * executed. It should return a pointer to the foreign function that will be
	 * bound to that method.
	 * 
	 * If the foreign function could not be found, this should return NULL and
	 * Wren will report it as runtime error.
	 */
	bindForeignMethodFn: (moduleName: string, className: string, isStatic: boolean, signature: string) => ((vm: VM) => void);

	/**
	 * The callback Wren uses to find a foreign class and get its foreign methods.
	 * 
	 * When a foreign class is declared, this will be called with the class's
	 * module and name when the class body is executed. It should return the
	 * foreign functions uses to allocate and (optionally) finalize the bytes
	 * stored in the foreign object when an instance is created.
	 */
	bindForeignClassFn: (moduleName: string, className: string) => ((vm: VM) => void);

	/**
	 * The callback Wren uses to display text when `System.print()` or the other
	 * related functions are called.
	 * 
	 * By default {@link VM} just prints the string via `console.log()`.
	 */
	writeFn: (text: string) => void;

	/**
	 * The callback Wren uses to report errors.
	 * 
	 * When an error occurs, this will be called with the module name, line
	 * number, and an error message. If this is `NULL`, Wren doesn't report any
	 * errors.
	 * 
	 * By default {@link VM} just prints the information via `console.warn()`.
	 */
	errorFn: (errorType: any, moduleName: any, line: any, msg: any) => void;
}

/**
 * The type of error returned by the {@link VM}.
 */
export enum ErrorType {
	/** A syntax or resolution error detected at compile time. */
	COMPILE = 0,
	/** The error message for a runtime error. */
	RUNTIME = 1,
	/** One entry of a runtime error's stack trace. */
	STACK_TRACE = 2,
}

/**
 * The result of a VM interpreting wren source.
 */
export enum InterpretResult {
	/** The VM interpreted the source without error. */
	SUCCESS = 0,
	/** The VM experienced a compile error. */
	COMPILE_ERROR = 1,
	/** The VM experienced a runtime error. */
	RUNTIME_ERROR = 2,
}

/**
 * The type of an object stored in a slot.
 * 
 * This is not necessarily the object's *class*, but instead its low level representation type.
 */
export enum Type {
	BOOL = 0,
	NUM = 1,
	FOREIGN = 2,
	LIST = 3,
	MAP = 4,
	NULL = 5,
	STRING = 6,
	/** The object is of a type that isn't accessible by the C API. */
	UNKNOWN = 7,
}
