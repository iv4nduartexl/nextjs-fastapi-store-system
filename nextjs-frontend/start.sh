#!/bin/bash

if [ "$NODE_ENV" = "production" ]; then
    echo "Running in PRODUCTION mode"
    pnpm run build
    pnpm run start
else
    echo "Running in DEVELOPMENT mode"
    pnpm run dev &
    node watcher.js
    wait
fi
