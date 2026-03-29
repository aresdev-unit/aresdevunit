#!/bin/bash
# Auto-bump patch version in package.json
cd "$(dirname "$0")/.."
current=$(node -p "require('./package.json').version")
IFS='.' read -r major minor patch <<< "$current"
new="$major.$minor.$((patch + 1))"
# Use node to update package.json preserving format
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '$new';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
echo "Version bumped: $current → $new"
