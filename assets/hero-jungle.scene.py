#!/usr/bin/env python3
# Dichter Graustufen-Dschungel (Hero-Hintergrund), so nah wie moeglich an der Frey-Fahrzeugbeschriftung.
import math, random
W, H = 1600, 860
random.seed(20)

SKY_TOP="#FDFDFB"; SKY_BOT="#EEF0EA"
parts=[]
def P(s): parts.append(s)

BANANA="M50 112 C42 110 27 92 25 56 C24 30 40 10 50 4 C60 10 76 30 75 56 C73 92 58 110 50 112 Z"

def monstera_path(n=8, Rbase=48):
    O=(50,90)
    def pol(a,r): return (O[0]+r*math.cos(math.radians(a)), O[1]-r*math.sin(math.radians(a)))
    lo,hi=6,174
    centers=[hi - i*((hi-lo)/(n-1)) for i in range(n)]
    span=(hi-lo)/(n-1); wa=span*0.40
    d=f"M{O[0]:.1f} 99.5 "
    for i,a in enumerate(centers):
        R=Rbase*(0.66+0.40*math.sin(math.radians(a)))
        pl=pol(a+wa,R); tip=pol(a,R*1.16); pr=pol(a-wa,R)
        d+=f"L{pl[0]:.1f} {pl[1]:.1f} Q{tip[0]:.1f} {tip[1]:.1f} {pr[0]:.1f} {pr[1]:.1f} "
        if i<n-1:
            am=(a+centers[i+1])/2; nk=pol(am, R*0.30)
            d+=f"L{nk[0]:.1f} {nk[1]:.1f} "
    return d+f"L{O[0]:.1f} 99.5 Z"
MON=[monstera_path(7), monstera_path(8), monstera_path(9)]

def monstera(x,y,s,rot,color,op=1.0):
    P(f'<g transform="translate({x:.0f} {y:.0f}) rotate({rot:.0f}) scale({s:.2f}) translate(-50 -90)" '
      f'fill="{color}" opacity="{op:.2f}"><path d="{random.choice(MON)}"/></g>')

def banana(x,y,s,rot,color,op=1.0):
    P(f'<g transform="translate({x:.0f} {y:.0f}) rotate({rot:.0f}) scale({s:.2f}) translate(-50 -112)" '
      f'fill="{color}" opacity="{op:.2f}"><path d="{BANANA}"/></g>')

def frond(x0,y0,length,ang,curve,color,width=2.0,n=12,op=1.0,droop=0.0):
    a=math.radians(ang)
    ex=x0+math.cos(a)*length; ey=y0+math.sin(a)*length + droop*length
    nx=math.cos(a+math.pi/2); ny=math.sin(a+math.pi/2)
    cxp=(x0+ex)/2+nx*curve; cyp=(y0+ey)/2+ny*curve + droop*length*0.9
    s=[f'<g stroke="{color}" stroke-linecap="round" opacity="{op:.2f}" fill="none">']
    s.append(f'<path d="M{x0:.0f} {y0:.0f} Q{cxp:.0f} {cyp:.0f} {ex:.0f} {ey:.0f}" stroke-width="{width*1.25:.1f}"/>')
    for i in range(1,n+1):
        t=i/(n+1)
        px=(1-t)**2*x0+2*(1-t)*t*cxp+t*t*ex; py=(1-t)**2*y0+2*(1-t)*t*cyp+t*t*ey
        tx=2*(1-t)*(cxp-x0)+2*t*(ex-cxp); ty=2*(1-t)*(cyp-y0)+2*t*(ey-cyp)
        tl=math.hypot(tx,ty) or 1; tx/=tl; ty/=tl; pnx,pny=-ty,tx
        ll=length*0.14*(1-t*0.5)
        for side in (1,-1):
            lx=px+pnx*side*ll+tx*ll*0.7; ly=py+pny*side*ll+ty*ll*0.7
            s.append(f'<path d="M{px:.0f} {py:.0f} L{lx:.0f} {ly:.0f}" stroke-width="{width:.1f}"/>')
    s.append('</g>'); P(''.join(s))

def palm(x,baseY,height,color,sway=0,fronds=10,fw=2.0,op=1.0,n=12):
    topx=x+sway; topy=baseY-height
    P(f'<path d="M{x-height*0.016:.0f} {baseY:.0f} Q{(x+topx)/2-7:.0f} {(baseY+topy)/2:.0f} {topx-2:.0f} {topy:.0f} '
      f'L{topx+2:.0f} {topy:.0f} Q{(x+topx)/2+7:.0f} {(baseY+topy)/2:.0f} {x+height*0.016+3:.0f} {baseY:.0f} Z" fill="{color}" opacity="{op:.2f}"/>')
    fl=height*0.62
    for k in range(fronds):
        ang=-172 + k*(164/(fronds-1)) + random.uniform(-4,4)
        droop=0.26+0.28*abs(math.cos(math.radians(ang)))   # seitliche Wedel haengen staerker
        frond(topx,topy,fl*random.uniform(0.88,1.10),ang,fl*0.14*(1 if ang<-90 else -1),color,fw,n,op,droop)

def grass(x,baseY,h,color,blades=9,op=1.0):
    g=[f'<g stroke="{color}" stroke-linecap="round" fill="none" opacity="{op:.2f}">']
    for _ in range(blades):
        dx=random.uniform(-h*0.42,h*0.42); bh=h*random.uniform(0.5,1.05); cx=x+dx*0.4
        g.append(f'<path d="M{x:.0f} {baseY:.0f} Q{cx:.0f} {baseY-bh*0.6:.0f} {x+dx:.0f} {baseY-bh:.0f}" stroke-width="{random.uniform(1.8,3.2):.1f}"/>')
    g.append('</g>'); P(''.join(g))

def bird(x,y,s,color,op=0.5):
    P(f'<path d="M{x:.0f} {y:.0f} q{s:.0f} {-s*0.7:.0f} {s*2:.0f} 0 q{s:.0f} {-s*0.7:.0f} {s*2:.0f} 0" '
      f'stroke="{color}" stroke-width="{s*0.3:.1f}" fill="none" stroke-linecap="round" opacity="{op:.2f}"/>')

# helle "Text-Insel" links-oben: dort Elemente aufhellen/ausduennen
def lighten(x, y, base):
    # naeher an der Textinsel -> heller (mehr Nebel)
    dx=(x-330)/430; dy=(y-360)/300
    d=math.hypot(dx,dy)
    return min(1.0, 0.35+0.65*d)   # 0.35 (Textzone) .. 1.0

def mix(hexc, f):
    # mische Farbe Richtung Nebel (SKY) mit Faktor (1=voll, 0=Nebel)
    c=hexc.lstrip('#'); r,g,b=int(c[0:2],16),int(c[2:4],16),int(c[4:6],16)
    sr,sg,sb=0xEA,0xEC,0xE6
    r=int(sr+(r-sr)*f); g=int(sg+(g-sg)*f); b=int(sb+(b-sb)*f)
    return f'#{r:02x}{g:02x}{b:02x}'

# ================= AUFBAU (hinten -> vorne) =================
P(f'<rect width="{W}" height="{H}" fill="url(#sky)"/>')

# 1) ferner Palmenwald (hell) — hohe Palmen mit sichtbaren Staemmen
for i in range(15):
    x=random.uniform(-30,W+30); h=random.uniform(370,610)
    base=random.uniform(650,725)
    c=mix(random.choice(["#CDD3C8","#C0C7BA","#D6DBD1"]), lighten(x,base-h,None))
    palm(x,base,h,c,random.uniform(-14,14),fronds=random.randint(7,8),fw=1.3,op=0.95,n=12)

# 2) mittlerer Palmenwald (mittelgrau) — hoeher, Staemme sichtbar
for i in range(11):
    x=random.uniform(-20,W+20); h=random.uniform(450,690)
    base=random.uniform(730,805)
    c=mix(random.choice(["#AEB6A9","#9AA290","#8B9482"]), lighten(x,base-h,None))
    palm(x,base,h,c,random.uniform(-16,16),fronds=random.randint(7,9),fw=1.7,op=1,n=12)

# 3) haengende Kronendecke von oben (volle Breite)
xx=-40
while xx<W+40:
    f=lighten(xx,40,None)
    if random.random()<0.5:
        monstera(xx, random.uniform(-40,30), random.uniform(1.7,2.8), random.uniform(150,210), mix(random.choice(["#8B9482","#77806C","#67705E"]),f), 0.95)
    else:
        frond(xx, random.uniform(-30,20), random.uniform(150,240), random.uniform(240,300), random.uniform(-60,60), mix(random.choice(["#828B77","#6E7763"]),f), 2.0, 12, 0.9, droop=0.5)
    xx+=random.uniform(46,78)
# haengende Ranken
for _ in range(6):
    vx=random.uniform(500,1150)
    P(f'<path d="M{vx:.0f} -10 C{vx+14:.0f} 140 {vx-14:.0f} 250 {vx+6:.0f} 350" stroke="#8b9482" stroke-width="1.5" fill="none" opacity="0.5"/>')

# 4) Understory (mitteldunkel)
for i in range(16):
    x=random.uniform(-20,W+20); base=random.uniform(720,800)
    f=lighten(x,base-120,None)
    k=random.random(); c=mix(random.choice(["#79826F","#69715E","#5c6551"]),f)
    if k<0.55: monstera(x,base,random.uniform(1.8,2.9),random.uniform(-20,20),c,1)
    elif k<0.88: banana(x,base,random.uniform(1.9,3.0),random.uniform(-18,18),c,1)
    else: frond(x,base,random.uniform(150,240),random.uniform(-150,-30),random.uniform(-40,40),c,2.2,12,1,droop=0.1)

# 5) dichter dunkler Vordergrund (unteres ~45%) — sehr dicht, ueberlappend
DARK=["#3B433A","#2F362E","#252B25","#1D231E"]
x=-40
while x<W+50:
    edge = x<W*0.30 or x>W*0.60
    hf = 1.0 if edge else 0.66     # Mitte niedriger halten (Chamaeleon/Text)
    base=H+8+random.uniform(-6,10)
    k=random.random(); c=random.choice(DARK)
    if k<0.40: monstera(x,base,random.uniform(2.0,3.2)*hf,random.uniform(-22,22),c,1)
    elif k<0.72: banana(x,base,random.uniform(2.2,3.4)*hf,random.uniform(-18,18),c,1)
    elif k<0.86: palm(x,base,random.uniform(300,470)*hf,c,random.uniform(-14,14),fronds=8,fw=2.4,op=1,n=12)
    else: grass(x,base,random.uniform(70,150)*hf,c,10,1)
    x+=random.uniform(40,66)
# zusaetzliche grosse Blaetter ganz vorne an den Raendern
for x in [40,120,200,1400,1500,1580, 60,1540]:
    monstera(x,H+10,random.uniform(2.6,3.6),random.uniform(-24,24),random.choice(DARK[2:]),1)
for x in [90,180,1440,1560]:
    banana(x,H+6,random.uniform(2.8,3.8),random.uniform(-16,16),random.choice(DARK[2:]),1)
# schliessende dunkle Unterkante
P(f'<path d="M0 {H-40} Q400 {H-70} 800 {H-45} T1600 {H-40} L1600 {H} L0 {H} Z" fill="{DARK[3]}"/>')

# 6) Voegel
for _ in range(8):
    bird(random.uniform(650,1300),random.uniform(120,320),random.uniform(7,12),"#6e7763",0.5)

svg=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" preserveAspectRatio="xMidYMax slice">'
     f'<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
     f'<stop offset="0" stop-color="{SKY_TOP}"/><stop offset="1" stop-color="{SKY_BOT}"/></linearGradient></defs>'
     + ''.join(parts) + '</svg>')
open('hero-jungle.svg','w').write(svg)
print('wrote hero-jungle.svg', len(svg), 'bytes,', len(parts), 'parts')
