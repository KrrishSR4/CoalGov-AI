#!/bin/bash
python -m app.migrate
python -m uvicorn app.main:app --host 0.0.0.0 --port 10000
