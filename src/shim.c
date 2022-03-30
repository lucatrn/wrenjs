#include "emscripten.h"
#include "wren.h"

// This C file contains the bindings that connect the world of wren to the world of JavaScript.

// The following are wrappers for functions normally attached to a WrenConfiguration.

// resolveModuleFn

const char* shimResolveModuleFn(WrenVM* vm, const char* importer, const char* name) {
	return (char*)EM_ASM_INT({
		return mallocString(
			Module._VMs[$0]._resolveModule(UTF8ToString($1), UTF8ToString($2))
		);
	}, vm, importer, name);
}


// loadModuleFn

void loadModuleComplete(WrenVM* vm, const char* module, WrenLoadModuleResult result) {
	if (result.source) {
		free((void*) result.source);
	}
}

WrenLoadModuleResult shimLoadModuleFn(WrenVM* vm, const char* name) {
	WrenLoadModuleResult result = {0};

	char* source = (char*)EM_ASM_INT({
		return mallocString(
			Module._VMs[$0]._loadModule(UTF8ToString($1))
		);
	}, vm, name);

	if (source) {
		result.source = source;
		result.onComplete = loadModuleComplete;
	}

	return result;
}


// bindForeignMethodFn

WrenForeignMethodFn shimBindForeignMethodFn(WrenVM* vm, const char* module, const char* className, bool isStatic, const char* signature) {
	return (WrenForeignMethodFn)EM_ASM_INT({
		return Module._VMs[$0]._bindForeignMethod(
			UTF8ToString($1),
			UTF8ToString($2),
			$3 === 1,
			UTF8ToString($4),
		);
	}, vm, module, className, isStatic, signature);
}


// bindForeignClassFn

void defaultAllocator(WrenVM* vm) {
	wrenSetSlotNewForeign(vm, 0, 0, 0);
}

WrenForeignClassMethods shimBindForeignClassFn(WrenVM* vm, const char* module, const char* className) {
	// We need to get two pointers, so we'll pass a reference to the struct and
	// set the pointers through JavaScript.
	WrenForeignClassMethods result;
	result.allocate = defaultAllocator;
	result.finalize = NULL;

	EM_ASM({
		return Module._VMs[$0]._bindForeignClass(
			UTF8ToString($1),
			UTF8ToString($2),
			$3,
		);
	}, vm, module, className, &result);

	return result;
}


// writeFn

void shimWriteFn(WrenVM* vm, const char* text) {
	EM_ASM({
		Module._VMs[$0]._write(UTF8ToString($1));
	}, vm, text);
}


// errorFn

void shimErrorFn(WrenVM* vm, WrenErrorType type, const char* module, int line, const char* message) {
	EM_ASM({
		Module._VMs[$0]._error($1, UTF8ToString($2), $3, UTF8ToString($4));
	}, vm, type, module, line, message);
}


// Main wrenNewVM shim, that sets the other callback shims.
// Use a Reusable WrenConfiguration.

WrenConfiguration config;

EMSCRIPTEN_KEEPALIVE
WrenVM* shimNewVM() {
	wrenInitConfiguration(&config);
	config.writeFn = shimWriteFn;
	config.errorFn = shimErrorFn;
	config.bindForeignMethodFn = shimBindForeignMethodFn;
	config.bindForeignClassFn = shimBindForeignClassFn;
	config.loadModuleFn = shimLoadModuleFn;
	config.resolveModuleFn = shimResolveModuleFn;

	return wrenNewVM(&config);
}
