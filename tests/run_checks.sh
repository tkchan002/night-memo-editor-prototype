#!/bin/sh
node --check assets/app.js && python3 tests/check_project.py
