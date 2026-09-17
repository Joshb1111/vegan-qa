#!/bin/zsh
# Rebuild every lite model: stitch pinholes, decimate, fresh padded atlas, rebake colour from the full model.
A="/Users/user/Desktop/Desktop - User’s MacBook Air/vegan-qa/public/assets"; S="/Users/user/Library/Application Support/Claude/scratch-workspaces/ef31e3c7-75d1-4840-a4c8-e9ec58a860d1/3685b11c-9bfc-46e5-8a83-7a038f1de787/scratch-2026-09-02-d62329"; B=/Applications/Blender.app/Contents/MacOS/Blender
OUT="$S/lite_new"; mkdir -p "$OUT"
jobs=(${=1})
for j in $jobs; do n=${j%%:*}; r=${j#*:}; t=${r%%:*}; x=${r##*:}; for try in 1 2; do
  out=$("$B" -b --offline-mode --python "$S/rebake.py" -- "$A/$n.glb" "$OUT/$n.glb" $t $x 82 2>&1 | grep -E "^DONE|Error|Traceback" | tail -2)
  if [[ "$out" == DONE* ]]; then echo "$out"; rm -f "$OUT/$n.glb.bake.png"; break; else echo "RETRY $n ($try): $out"; fi
done; done
echo ALLDONE
