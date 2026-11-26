#!/bin/bash
set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")"
printf '%s\n' 'Deprecated launcher: use Jetstream Dev.command instead.'
exec bash './Jetstream Dev.command'
