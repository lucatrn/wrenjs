import Wren from "../out/wren.js";

let pages = location.pathname.split("/");
let currentPage = pages[pages.length - 1];

let examples = [
	"hello-world",
	"resolve-module",
	"load-module",
	"foreign-method",
	"foreign-class",
];

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

let sourceElement = document.createElement("pre");
sourceElement.textContent = document.body.querySelector("script").textContent.trim();

let outputElement = document.createElement("section");
outputElement.className = "output";

document.body.append(
	exampleSelector,
	sourceElement,
	outputElement,
);

// Set custom write & error functions.
let defaultWriteFn = Wren.defaultConfig.writeFn;
let defaultErrorFn = Wren.defaultConfig.errorFn;

Wren.defaultConfig.writeFn = (text) => {
	defaultWriteFn(text);

	print(text, "write");
};

Wren.defaultConfig.errorFn = (errorType, moduleName, line, msg) => {
	let s = defaultErrorFn(errorType, moduleName, line, msg);

	print(s, "error");
};

function print(text, className) {
	let element = document.createElement("div");
	element.className = "out";
	
	let inner = document.createElement("span");
	inner.className = className;
	inner.textContent = text;

	element.append(inner);
	outputElement.append(element);
}

export default Wren;
