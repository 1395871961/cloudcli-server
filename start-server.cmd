@echo off
cd /d "%~dp0"
npx tsx --tsconfig server/tsconfig.json server/index.js
