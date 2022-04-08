import Wren from "../out/wren.js";

// This file mocks the main "wren.js" file, whilst also creating the UI for the the example pages.

let pages = location.pathname.split("/");
let currentPage = pages[pages.length - 1];

let examples = [
	"hello-world",
	"load-module",
	"resolve-module",
	"foreign-method",
	"foreign-class",
	"foreign-class-super",
];

let elements = [];
let extraStyleCodeElements = [];

function createCode(title, lang, src) {
	let sourceElementTitle = document.createElement("h2");
	sourceElementTitle.textContent = title;

	let sourceElement = document.createElement("pre");
	let sourceElementCode = document.createElement("code");

	sourceElementCode.className = "language-" + lang;
	sourceElement.append(sourceElementCode);

	elements.push(
		sourceElementTitle,
		sourceElement,
	);

	src = Promise.resolve(src);

	src.then(rsrc => {
		sourceElementCode.textContent = rsrc.trim();
	});

	extraStyleCodeElements.push(
		src.then(() => sourceElementCode)
	);
}


// Create file selector.
let exampleSelector = document.createElement("select");
exampleSelector.onchange = () => {
	location.assign(exampleSelector.value);
};

for (let example of examples) {
	let title = example.replace(/-/g, " ");
	title = title[0].toUpperCase() + title.slice(1);

	let page = example + ".html";

	exampleSelector.append(new Option(title, page, undefined, page === currentPage));
}

elements.push(exampleSelector);


// Get extra source elements provided through <code data-src="..."></pre>
for (let node of Array.from(document.body.childNodes)) {
	if (node instanceof Comment && node.nodeValue.startsWith("#include")) {
		let src = node.nodeValue.slice(9);
		let dot = src.lastIndexOf(".");
		let ext = src.slice(dot + 1);

		createCode(
			src,
			ext,
			fetch(src).then(response => response.text())
		);
	}
}


// Display main JavaScript source.
createCode(
	"JavaScript",
	"javascript",
	document.body.querySelector("script").textContent.trim()
);


// Get outputs container.
let outputElement = document.createElement("section");
outputElement.className = "output";

elements.push(
	outputElement,
);


// Add element to document.
document.body.append(...elements);


// Set custom write & error functions.
let defaultWriteFn = Wren.defaultConfig.writeFn;
let defaultErrorFn = Wren.defaultConfig.errorFn;

Wren.defaultConfig.writeFn = (text) => {
	defaultWriteFn(text);

	print(text, "write");
};

let currError = null;

Wren.defaultConfig.errorFn = (errorType, moduleName, line, msg) => {
	let s = defaultErrorFn(errorType, moduleName, line, msg);

	if (errorType === Wren.ErrorType.RUNTIME) {
		currError = print(s, "error");
	} else if (errorType === Wren.ErrorType.STACK_TRACE) {
		currError.append("\n  " + s);
	} else {
		print(s, "error");
	}
};

function print(text, className) {
	let element = document.createElement("div");
	element.className = "out";

	outputElement.append(element);

	let inner = document.createElement("span");
	inner.className = className;
	inner.textContent = text;

	element.append(inner);

	return inner;
}


// Get Prism syntax highlighting
async function loadScripts() {
	await import("https://unpkg.com/prismjs@1.27.0/components/prism-core.min.js");
	await import("https://unpkg.com/prismjs@1.27.0/plugins/autoloader/prism-autoloader.min.js");

	self.Prism.plugins.autoloader.languages_path = "https://unpkg.com/prismjs@1.27.0/components/";

	for (let p of extraStyleCodeElements) {
		self.Prism.highlightElement(await p);
	}
	
}
loadScripts();


// Re-export Wren module.
export default Wren;
