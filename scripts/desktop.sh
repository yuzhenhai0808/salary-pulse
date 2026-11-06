#!/bin/sh
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ -x "$project_root/.toolchains/cargo/bin/cargo" ]; then
  export CARGO_HOME="$project_root/.toolchains/cargo"
  export RUSTUP_HOME="$project_root/.toolchains/rustup"
  export PATH="$CARGO_HOME/bin:$PATH"
fi
cd "$project_root"
exec npm run tauri -- "$@"
