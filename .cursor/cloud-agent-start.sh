#!/usr/bin/env bash
set -euo pipefail

export WEBHOOK_MAP='{"default":"https://example.invalid/webhook"}'
cd src
exec npm start
