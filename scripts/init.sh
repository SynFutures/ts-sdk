#!/bin/bash
set -euo pipefail

packageName=${1:-}
if [ ! -f package.json ] || [ "$(node -p "require('./package.json').name")" != "@synfutures/ts-sdk" ]; then
    echo "Please run this command from the workspace root." >&2
    exit 1
fi
if [ -z "$packageName" ] || [[ ! "$packageName" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
    echo "Usage: bash scripts/init.sh package-name" >&2
    exit 1
fi

packageDir="./packages/$packageName"
if [ -e "$packageDir" ] || [ -L "$packageDir" ]; then
    echo "Refusing to overwrite existing target: $packageDir" >&2
    exit 1
fi

# An atomic directory creation also rejects a target created after the check.
mkdir "$packageDir"
mkdir "$packageDir/src" "$packageDir/test"
sed "s/{PACKAGE}/${packageName}/g" templates/package.json.tmpl > "$packageDir/package.json"
sed "s/{PACKAGE}/${packageName}/g" templates/README.md.tmpl > "$packageDir/README.md"
for config in tsconfig.json tsconfig.build.json; do
    ln -s "../../templates/$config.tmpl" "$packageDir/$config"
done
ln -s "../../templates/test/tsconfig.test.json.tmpl" "$packageDir/tsconfig.test.json"
echo "Created $packageDir"
