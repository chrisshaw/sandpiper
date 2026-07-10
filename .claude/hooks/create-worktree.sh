#!/bin/bash
# WorktreeCreate hook: put Claude Code worktrees in $HOME instead of
# .claude/worktrees. The worktrees are full repo copies; inside the repo they
# make vitest run every test twice (against the same test DB) and trip
# typescript-eslint on the second tsconfig.json, which used to require fork
# patches to vitest.config.ts and eslint.config.js.
set -euo pipefail

input=$(cat)
name=$(printf '%s' "$input" | jq -r '.worktree_name // .name // empty')
ref=$(printf '%s' "$input" | jq -r '.git_ref // empty')

if [ -z "$name" ]; then
  echo "WorktreeCreate hook: no worktree name in hook input" >&2
  exit 1
fi

base="$HOME/.claude-worktrees/$(basename "$PWD")"
mkdir -p "$base"
dir="$base/$name"

git worktree add -b "$name" "$dir" "${ref:-HEAD}" >&2 ||
  git worktree add --detach "$dir" "${ref:-HEAD}" >&2

echo "$dir"
