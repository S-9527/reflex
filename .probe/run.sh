#!/bin/bash
cd /home/anguish/workspace/reflex
export XDG_CACHE_HOME=$PWD/.probe/cache
export XDG_STATE_HOME=$PWD/.probe/state
export XDG_DATA_HOME=$HOME/.local/share
mkdir -p "$XDG_CACHE_HOME" "$XDG_STATE_HOME"
script -qec "nvim --headless -c 'luafile $PWD/scripts/probe-resize.lua' -c 'qa!'" /dev/null
