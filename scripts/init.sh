#!/bin/bash

# Unofficial strict mode
set -euo pipefail
IFS=$'\n\t'

projectName=packages
packageName=${1:-}

ROOT_PACKAGE_NAME=$(jq --raw-output '.name' package.json)
if [ "$ROOT_PACKAGE_NAME" != "@synfutures/ts-sdk" ]; then
	echo "Please use the command in the project root directory."
	exit 1
fi

if [ -z "$packageName" ] || [[ "$packageName" =~ [^a-zA-Z0-9-] ]]; then
	echo "Usage: npm run init -- PACKAGE_NAME"
	exit 1
fi

packageDir="./$projectName/$packageName"
# Just in case package folder doesn't exist yet.
mkdir -p "$packageDir"
mkdir -p "$packageDir/src"
mkdir -p "$packageDir/test"

cp "./templates/package.json.tmpl" "$packageDir/package.json"
# Detect the operating system and choose the correct sed command
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' -e "s/{PACKAGE}/${packageName}/g" "$packageDir/package.json"
else
  sed -i -e "s/{PACKAGE}/${packageName}/g" "$packageDir/package.json"
fi
cp "./templates/README.md.tmpl" "$packageDir/README.md"

# copy_templates=(
# 	"eslint.config.js"
# )

link_templates=(
	"tsconfig.json"
	"tsconfig.build.json"
)

link_test_templates=(
	"tsconfig.test.json"
)

for i in "${link_templates[@]}"
do
	echo ${i}
	if [ ! -e "$packageDir/${i}" ];	then
		ln -vs "../../templates/$i.tmpl" "$packageDir/$i"
	fi
done

for i in "${link_test_templates[@]}"
do
	echo ${i}
	if [ ! -e "$packageDir/test/${i}" ];	then
		ln -vs "../../../templates/test/$i.tmpl" "$packageDir/test/$i"
	fi
done
