#!/bin/bash

if [ -f /.dockerenv ]; then
    echo "Running in Docker"
    if [ "$NODE_ENV" = "production" ]; then
        echo "Running fastAPI in PRODUCTION mode"
        fastapi run app/main.py --host 0.0.0.0 --port 8000
    else
        echo "Running fastAPI in DEVELOPMENT mode"
        fastapi dev app/main.py --host 0.0.0.0 --port 8000 --reload &
        python watcher.py
        wait
    fi
else
    echo "Running locally with uv"
    uv run fastapi dev app/main.py --host 0.0.0.0 --port 8000 --reload &
    uv run python watcher.py
    wait
fi
