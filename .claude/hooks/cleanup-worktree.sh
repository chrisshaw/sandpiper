#!/bin/bash
# WorktreeRemove hook: clean up worktrees created by create-worktree.sh.
# Only touches paths under $HOME/.claude-worktrees.
set -uo pipefail

input=$(cat)
path=$(printf '%s' "$input" | jq -r '.worktree_path // empty')

case "$path" in
  "$HOME/.claude-worktrees/"*)
    git worktree remove --force "$path" >&2 || true
    ;;
esac

exit 0
