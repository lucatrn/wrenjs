#!/bin/bash
clear

mkdir -p tmp

if ! [[ -d "./wren" ]]; then
    echo "Installing local Wren source code"

    git clone https://github.com/wren-lang/wren.git --branch 0.4.0

    cd wren
    python3 util/generate_amalgamation.py > wren.c
    cd ../
fi

if ! [[ -d "./node_modules" ]]; then
    echo "Installing JavaScript dependencies"

    npm install
fi

if ! [[ -d "./emsdk" ]]; then
    echo "Installing local emscripten"

    git clone https://github.com/emscripten-core/emsdk.git --branch 2.0.21
    ./emsdk/emsdk install latest
    ./emsdk/emsdk activate latest
fi

source emsdk/emsdk_env.sh

fn=`scripts/exports.js`

echo
echo "Building Emscripten"

emcc -DWREN_OPT_RANDOM -DWREN_OPT_META \
    wren/wren.c src/shim.c -I wren/src/include -o tmp/wren.js \
    -O3 -s WASM=1 \
    -s ASSERTIONS=0 -s ENVIRONMENT='web' \
    -s MODULARIZE=1 -s EXPORT_ES6=1 \
    -s FILESYSTEM=0 -s SINGLE_FILE=0 \
    -s ALLOW_MEMORY_GROWTH=1 -s ALLOW_TABLE_GROWTH=1 \
    -s INCOMING_MODULE_JS_API=[] -s DYNAMIC_EXECUTION=0 \
    -s EXPORTED_RUNTIME_METHODS=["ccall","addFunction"] \
    -s EXPORTED_FUNCTIONS=$fn \
    -Werror --memory-init-file 0 \

npx rollup ./src/wren.js --file ./tmp/wren-bundle.js --format esm --name "Wren"

terser -o ./out/wren.js -c -m -- ./tmp/wren-bundle.js

mv tmp/wren.wasm out
cp src/wren.d.ts out

echo "Build Complete: /out/wren.js /out/wren.wasm"
