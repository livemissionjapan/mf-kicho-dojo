#!/bin/bash
# 絵の生成をレート制限が解けるまで30分ごとに再試行する。足りない絵（問題の場面・解説）を全部拾う。
cd "$(dirname "$0")/.."
LOG=_stock/retry_images.log
while true; do
  node -e '
    global.window={};const fs=require("fs");
    for (const f of ["a","b","add-1","add-2","add-3","add-4"]) { try { require("./data/questions-"+f+".js"); } catch(e){} }
    const q=[].concat(window.QUESTIONS_A||[],window.QUESTIONS_B||[],window.QUESTIONS_ADD1||[],window.QUESTIONS_ADD2||[],window.QUESTIONS_ADD3||[],window.QUESTIONS_ADD4||[]);
    const out=[];
    for (const x of q) { const id=x.img||x.id;
      if (!fs.existsSync("img/"+id+".jpg") && x.scene) out.push({id, scene:x.scene});
      if (!fs.existsSync("img/e-"+id+".jpg") && x.explainScene && x.type!=="journal") out.push({id:"e-"+id, scene:x.explainScene});
    }
    fs.writeFileSync("_stock/pending_images.json", JSON.stringify(out)); console.log(out.length);
  ' > _stock/pending_count.txt 2>/dev/null
  N=$(cat _stock/pending_count.txt)
  echo "$(date '+%m-%d %H:%M') pending=$N" >> $LOG
  if [ "$N" = "0" ]; then echo "$(date '+%m-%d %H:%M') all done" >> $LOG; break; fi
  # まず1枚だけ試す
  python3 - <<'PY'
import json; d=json.load(open("_stock/pending_images.json")); json.dump(d[:1],open("_stock/probe.json","w"))
PY
  python3 scripts/gen_images.py --input _stock/probe.json --parallel 1 --skip-existing > _stock/probe.log 2>&1
  if grep -q "1/1 .* OK" _stock/probe.log; then
    echo "$(date '+%m-%d %H:%M') probe OK → run $N" >> $LOG
    python3 scripts/gen_images.py --input _stock/pending_images.json --parallel 2 --skip-existing > _stock/pending_run.log 2>&1
    tail -1 _stock/pending_run.log >> $LOG
  else
    echo "$(date '+%m-%d %H:%M') still limited; sleep 30m" >> $LOG
    sleep 1800
  fi
done
