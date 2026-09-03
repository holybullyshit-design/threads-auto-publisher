#!/usr/bin/env python3
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"output"/"palja-reels"
FONT="/System/Library/Fonts/AppleSDGothicNeo.ttc"
entries=[]
for manifest in sorted(OUT.glob("2026-09-*/**/manifest.json")):
    spec=json.loads(manifest.read_text(encoding="utf-8"))
    if "2026-09-03"<=spec.get("date","")<="2026-09-12" and spec.get("stylePolicy",{}).get("screenCount")==2:
        stem="palja-reel-"+spec["date"]+"-"+spec["slotId"]
        entries.append((spec,manifest.parent/(stem+"-card-01.png"),manifest.parent/(stem+"-card-02.png")))
if len(entries)!=30: raise SystemExit("검수 대상이 30개가 아닙니다: "+str(len(entries)))

def sheet(card_index):
    thumb=(216,384); label_h=34
    canvas=Image.new("RGB",(thumb[0]*5,(thumb[1]+label_h)*6),"#0b1114")
    draw=ImageDraw.Draw(canvas); font=ImageFont.truetype(FONT,18)
    for i,(spec,c1,c2) in enumerate(entries):
        src=[c1,c2][card_index-1]
        im=Image.open(src).convert("RGB").resize(thumb,Image.Resampling.LANCZOS)
        x=(i%5)*thumb[0]; y=(i//5)*(thumb[1]+label_h)
        canvas.paste(im,(x,y))
        draw.text((x+8,y+thumb[1]+6),spec["date"][5:]+" "+spec["time"],font=font,fill="#f0c76e")
    target=OUT/("review-sheet-card-"+str(card_index)+".jpg")
    canvas.save(target,quality=91)
    print(target)

sheet(1); sheet(2)
