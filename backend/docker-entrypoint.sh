#!/bin/sh
set -e

echo "[entrypoint] applying database schema (prisma db push)..."
npx prisma db push --skip-generate

echo "[entrypoint] starting backend..."
exec node dist/main.js
