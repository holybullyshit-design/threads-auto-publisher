#!/usr/bin/env python3
import argparse, json, os, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT=Path(__file__).resolve().parents[2]
ASSETS=ROOT/"public"/"instagram-cards"/"assets"
BG=ASSETS/"dark-brand-bg.png"
LOGO=ASSETS/"palja-logo.png"
AUDIO=ASSETS/"audio"/"reality-meta-sound-collection.mp4"
AUDIO_START_SECONDS=0
MARU=ASSETS/"fonts"/"MaruBuri-Bold.ttf"
NOTO=ASSETS/"fonts"/"NotoSerifCJKkr-Bold.otf"
GOTHIC=Path("/System/Library/Fonts/AppleSDGothicNeo.ttc")
W,H,FPS=1080,1920,30
WHITE,GOLD,RED,MUTED,EDGE="#F7F1E5","#F0C76E","#E05243","#C8BDA8","#D7A846"

try:
    import imageio_ffmpeg
except ImportError:
    sys.path.insert(0,str(ROOT/"output"/".video-deps"))
    import imageio_ffmpeg
FFMPEG=imageio_ffmpeg.get_ffmpeg_exe()

def ft(path,size,index=0): return ImageFont.truetype(str(path),size,index=index)

def fit(draw,text,path,max_width,start,index=0):
    for size in range(start,19,-1):
        f=ft(path,size,index)
        b=draw.textbbox((0,0),text,font=f)
        if b[2]-b[0]<=max_width: return f
    raise ValueError("글자 폭 초과: "+text)

def center(draw,text,y,max_width,size,color,path=MARU,index=0):
    f=fit(draw,text,path,max_width,size,index)
    b=draw.textbbox((0,0),text,font=f)
    draw.text((W/2-(b[0]+b[2])/2,y-b[1]),text,font=f,fill=color)

def center_box(draw,text,rect,size,color,path=MARU,index=0):
    x1,y1,x2,y2=rect
    f=fit(draw,text,path,x2-x1-48,size,index)
    b=draw.textbbox((0,0),text,font=f)
    draw.text(((x1+x2)/2-(b[0]+b[2])/2,(y1+y2)/2-(b[1]+b[3])/2),text,font=f,fill=color)

def avatar(im,draw):
    size,y=126,65
    src=ImageOps.fit(Image.open(LOGO).convert("RGBA"),(size,size),method=Image.Resampling.LANCZOS)
    mask=Image.new("L",(size,size),0); ImageDraw.Draw(mask).ellipse((0,0,size-1,size-1),fill=255)
    x=(W-size)//2
    draw.ellipse((x-5,y-5,x+size+5,y+size+5),fill="#F3EBDD",outline=GOLD,width=4)
    im.paste(src,(x,y),mask)

def mixed_brand(draw,rect,size=29):
    runs=[]; total=0
    for text,path in [("팔자명가 · ",MARU),("八字名家",NOTO)]:
        f=ft(path,size); b=draw.textbbox((0,0),text,font=f); width=b[2]-b[0]
        runs.append((text,f,b,width)); total+=width
    x1,y1,x2,y2=rect; x=(x1+x2-total)/2; cy=(y1+y2)/2
    for text,f,b,width in runs:
        draw.text((x-b[0],cy-(b[1]+b[3])/2),text,font=f,fill=GOLD); x+=width

def base():
    im=Image.open(BG).convert("RGBA").resize((W,H),Image.Resampling.LANCZOS)
    im=Image.alpha_composite(im,Image.new("RGBA",(W,H),(3,12,17,140)))
    d=ImageDraw.Draw(im)
    d.rounded_rectangle((34,40,1046,1770),radius=28,outline=EDGE,width=3)
    avatar(im,d); mixed_brand(d,(280,198,800,242))
    return im,d

def condensed(im,text,rect,size,color,bold=False,ratio=.86):
    x1,y1,x2,y2=rect; f=ft(GOTHIC,size,6 if bold else 0); probe=ImageDraw.Draw(im)
    b=probe.textbbox((0,0),text,font=f)
    layer=Image.new("RGBA",(b[2]-b[0]+20,b[3]-b[1]+20),(0,0,0,0)); ld=ImageDraw.Draw(layer)
    ld.text((10-b[0],10-b[1]),text,font=f,fill=color)
    layer=layer.resize((int(layer.width*ratio),layer.height),Image.Resampling.LANCZOS)
    im.alpha_composite(layer,(int(x1+((x2-x1)-layer.width)/2),int(y1+((y2-y1)-layer.height)/2)))

def render(spec,output,cover):
    out=Path(output); out.parent.mkdir(parents=True,exist_ok=True)
    im1,d1=base()
    center(d1,spec["kicker"],255,600,28,MUTED,NOTO)
    for i,line in enumerate(spec["titleLines"]):
        has_hanja=any("\u4e00"<=c<="\u9fff" for c in line)
        center(d1,line,325+i*95,900,76 if i==1 else 68,GOLD if i==1 else WHITE,NOTO if has_hanja else MARU)
    d1.rounded_rectangle((145,610,935,674),radius=28,fill=(20,37,40,230),outline="#6C5B38",width=2)
    center(d1,spec["evidence"],624,735,29,MUTED,NOTO)
    top,row_h=720,124
    for i,item in enumerate(spec["items"]):
        row,col=divmod(i,2); x1,x2=100+col*450,520+col*450; y1,y2=top+row*row_h,top+row*row_h+90
        if item["focus"]:
            d1.rounded_rectangle((x1+18,y1,x2-18,y2),radius=18,fill=(74,27,25,214),outline="#A14B3D",width=2)
        else:
            d1.line((x1+26,y2+11,x2-26,y2+11),fill=(113,95,59,110),width=1)
        condensed(im1,str(item["year"])+"년생  "+item["zodiac"],(x1+24,y1,x2-20,y2),47,GOLD if item["focus"] else WHITE,item["focus"],.84)
    center(d1,"※ 절기 기준 띠 흐름",1375,520,27,MUTED,GOTHIC)
    card1=out.with_name(out.stem+"-card-01.png"); im1.convert("RGB").save(card1,quality=96)

    im2,d2=base()
    center(d2,"내 년생이 화면에 있었다면?",330,900,69,WHITE)
    center(d2,"팔자명가가 현실적인 대응 순서를 정리했습니다",438,900,40,MUTED,GOTHIC)
    action=(104,555,976,724)
    d2.rounded_rectangle(action,radius=30,fill=(17,35,39,240),outline=GOLD,width=3)
    center_box(d2,"팔로우 + 댓글에 ‘"+spec["keyword"]+"’",action,60,GOLD)
    center(d2,"DM으로 핵심 해결책을 보내드려요",820,860,53,GOLD)
    info=(145,945,935,1265)
    d2.rounded_rectangle(info,radius=24,fill=(8,22,26,224),outline="#6C5B38",width=2)
    center(d2,"받게 될 내용",990,650,38,GOLD)
    center(d2,spec["rewards"][0],1080,710,42,WHITE,GOTHIC,6)
    center(d2,spec["rewards"][1],1150,760,42,WHITE,GOTHIC,6)
    d2.rounded_rectangle((410,1345,670,1415),radius=10,fill="#8F2C24")
    mixed_brand(d2,(410,1345,670,1415),26)
    card2=out.with_name(out.stem+"-card-02.png"); im2.convert("RGB").save(card2,quality=96)

    if not AUDIO.exists(): raise FileNotFoundError("팔자명가 릴스 배경음 누락: "+str(AUDIO))
    subprocess.run([FFMPEG,"-y","-loop","1","-t","4.1","-i",str(card1),"-loop","1","-t","4.1","-i",str(card2),
      "-ss",str(AUDIO_START_SECONDS),"-t","8.2","-i",str(AUDIO),
      "-filter_complex","[0:v][1:v]xfade=transition=fade:duration=0.2:offset=3.9,format=yuv420p[v];"
      "[2:a]atrim=duration=8,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.3,"
      "afade=t=out:st=7.45:d=0.55,loudnorm=I=-19:TP=-2:LRA=7[a]",
      "-map","[v]","-map","[a]","-t","8","-r","30","-c:v","libx264","-preset","medium","-crf","17",
      "-c:a","aac","-b:a","128k","-ar","48000","-movflags","+faststart",str(out)],
      check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    Image.open(card1).save(cover,quality=94)

def main():
    p=argparse.ArgumentParser(); p.add_argument("manifest"); p.add_argument("output"); p.add_argument("cover")
    a=p.parse_args()
    with open(a.manifest,encoding="utf-8") as f: spec=json.load(f)
    render(spec,a.output,a.cover)

if __name__=="__main__": main()
