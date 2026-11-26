#!/bin/bash
set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")"
exec node dev-launch.cjs
