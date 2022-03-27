
// This file provides utilities to the inline EM_ASM JavaScript found in [shim.c]. 

/**
 * @param {string|undefined|null} jsString
 * @returns {number} The string's pointer
 */
function mallocString(jsString) {
	if (!jsString) return 0;
	var len = lengthBytesUTF8(jsString) + 1;
	var heapString = _malloc(len);
	stringToUTF8(jsString, heapString, len);
	return heapString;
}
