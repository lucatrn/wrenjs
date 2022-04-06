@echo off

if not exist tmp mkdir tmp

if not exist wren (
	echo "Installing local Wren source code"

	git clone https://github.com/wren-lang/wren.git

	cd wren
	python util/generate_amalgamation.py >wren.c
	cd ..
)

if not exist node_modules (
	echo "Installing JavaScript dependencies"

	call npm install
)

if not exist emsdk (
	echo "Installing local emscripten"

	git clone https://github.com/emscripten-core/emsdk.git
    call emsdk/emsdk.bat install latest
    call emsdk/emsdk.bat activate latest
)

call emsdk/emsdk_env.BAT

for /f %%i in ('node scripts/exports.js') do set fn=%%i

echo:
echo Building Emscripten

call emcc -DWREN_OPT_RANDOM -DWREN_OPT_META ^
    wren/wren.c src/shim.c -I wren/src/include -o tmp/wren.js ^
    -O3 -s WASM=1 ^
    -s ASSERTIONS=0 -s ENVIRONMENT='web' ^
    -s MODULARIZE=1 -s EXPORT_ES6=1 ^
    -s FILESYSTEM=0 -s SINGLE_FILE=0 ^
    -s ALLOW_MEMORY_GROWTH=1 -s ALLOW_TABLE_GROWTH=1 ^
    -s INCOMING_MODULE_JS_API=[] -s DYNAMIC_EXECUTION=0 ^
    -s EXPORTED_RUNTIME_METHODS=["ccall","addFunction"] ^
    -s "EXPORTED_FUNCTIONS=%fn%" ^
    --pre-js src/wren-asm-common.js ^
    -Werror --memory-init-file 0

echo Building JavaScript

call rollup src/wren.js --file tmp/wren-bundle.js --format esm --name "Wren"

call terser -o out/wren.js -c -m --module -- tmp/wren-bundle.js

move tmp\wren.wasm out
copy src\wren.d.ts out

echo Build Complete: /out/wren.js /out/wren.wasm
