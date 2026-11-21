#!/bin/sh
# Assemble the installable plugin folder in out/tarantula-pro.
set -e
cd "$(dirname "$0")"
npm run build
rm -rf out && mkdir -p out/tarantula-pro/dist out/tarantula-pro/py_modules
cp plugin.json package.json main.py LICENSE out/tarantula-pro/
cp dist/index.js out/tarantula-pro/dist/
cp py_modules/t3pro_protocol.py out/tarantula-pro/py_modules/
echo "install: sudo cp -r out/tarantula-pro ~/homebrew/plugins/ && sudo systemctl restart plugin_loader"
