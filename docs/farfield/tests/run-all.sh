#!/bin/bash
# Far Field, Sequence 1: the whole automated check (about 12 minutes on the M2 Air). From the repo root:
#   bash docs/farfield/tests/run-all.sh            (PORT=9921 by default; one headless Chrome at a time)
# Needs Google Chrome and node 20+. Results: docs/farfield/tests/out/*.json and *.jpg, then a PASS/FAIL summary.
cd "$(dirname "$0")" || exit 1
mkdir -p out
t() { local s=$1; shift; UNCAPPED=1 perl -e 'alarm shift; exec @ARGV' "$s" "$@"; }
load() { perl -e 'for (1..10) { my ($l) = `sysctl -n vm.loadavg` =~ /([\d.]+)/; last if !$l || $l <= 25; print "load $l, waiting 60 s\n"; sleep 60 }'; }
node ../../../public/farfield/tools/check-search.mjs > out/check-search.txt 2>&1
load; t 900 node play.mjs fast "q=high&seed=1&mute=1" sneak-fast-mute > out/sneak-fast-mute.log 2>&1
load; t 900 node play.mjs firsttimer "q=high&seed=1" firsttimer > out/firsttimer.log 2>&1
load; t 600 node scen.mjs > out/scen.log 2>&1
load; t 600 node t-controls.mjs > out/controls.log 2>&1
load; t 1200 node t-reveal.mjs > out/reveal.log 2>&1
load; t 400 node t-slide.mjs > out/slide.log 2>&1
load; t 400 node t-detect.mjs > out/detect.log 2>&1
load; t 400 node t-linger.mjs > out/linger.log 2>&1
load; t 300 node t-room.mjs > out/room.log 2>&1
load; DSF=2 t 300 node t-fps.mjs > out/fps.log 2>&1
node summary.mjs
