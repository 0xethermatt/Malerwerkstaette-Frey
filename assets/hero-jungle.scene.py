#!/usr/bin/env python3
# Dichter Graustufen-Dschungel (Hero), so nah wie moeglich an der Frey-Fahrzeugfolie.
# Nutzt <defs> + <use> fuer kleine Dateigroesse bei hoher Dichte.
import math, random
W, H = 1600, 860
random.seed(7)

# --- kuehle, neutrale Graustufen wie auf der Folie ---
SKY_TOP="#FBFCFC"; SKY_BOT="#EDEFF1"
FAR   =["#DBDEE1","#CDD1D5","#E2E5E7"]
MID   =["#AEB4BA","#99A0A6"]
CANOPY=["#767D85","#646B73","#565C64"]
DARK  =["#414750","#333942","#262B32","#1C2027"]

# ---------- Formen ----------
def hw(y):
    v=1-((y-78)/74)**2
    return 40*math.sqrt(v) if v>0 else 0
def ell(cx,cy,a,b,ang,ns=9):
    d=""
    for i in range(ns+1):
        th=2*math.pi*i/ns; ex=a*math.cos(th); ey=b*math.sin(th)
        x=cx+ex*math.cos(ang)-ey*math.sin(ang); y=cy+ex*math.sin(ang)+ey*math.cos(ang)
        d+=("M" if i==0 else "L")+f"{x:.1f} {y:.1f} "
    return d+"Z "
def monstera_real(ws=1.0, jit=0):
    random.seed(100+jit)
    out=("M50 149 C22 146 7 112 11 70 C14 36 32 11 50 8 "
         "C68 11 86 36 89 70 C93 112 78 146 50 149 Z ")
    holes=""
    for y in [28,46,64,82,100,118,134]:
        w=hw(y)*ws
        if w<7: continue
        for sign in (1,-1):
            inner=6.0; outer=w*0.92
            cx=50+sign*(inner+outer)/2; cy=y-w*0.30
            a=(outer-inner)/2; b=2.6; ang=math.radians(-18*sign)
            if a>4: holes+=ell(cx,cy,a,b,ang)
    for y in [58,86,112]:
        for sign in (1,-1): holes+=ell(50+sign*11,y-6,3.0,4.4,0)
    return out+holes
BANANA="M50 112 C42 110 27 92 25 56 C24 30 40 10 50 4 C60 10 76 30 75 56 C73 92 58 110 50 112 Z"

def palm_group(Hc, fronds, n, fw):
    # Basis bei (0,0), Stamm nach oben (-Hc)
    topy=-Hc; s=[]
    s.append(f'<path d="M{-Hc*0.014:.0f} 0 Q-6 {-Hc/2:.0f} -2 {topy:.0f} L2 {topy:.0f} Q6 {-Hc/2:.0f} {Hc*0.014+3:.0f} 0 Z"/>')
    fl=Hc*0.62
    for k in range(fronds):
        ang=-172 + k*(164/(fronds-1)) + random.uniform(-4,4)
        droop=0.26+0.28*abs(math.cos(math.radians(ang)))
        length=fl*random.uniform(0.88,1.10); curve=fl*0.14*(1 if ang<-90 else -1)
        a=math.radians(ang)
        ex=math.cos(a)*length; ey=math.sin(a)*length+droop*length
        nx=math.cos(a+math.pi/2); ny=math.sin(a+math.pi/2)
        cxp=ex/2+nx*curve; cyp=ey/2+ny*curve+droop*length*0.9
        g=[f'<g stroke-width="{fw}" fill="none">']
        g.append(f'<path d="M0 {topy:.0f} Q{cxp:.0f} {topy+cyp:.0f} {ex:.0f} {topy+ey:.0f}" stroke-width="{fw*1.2:.1f}"/>')
        for i in range(1,n+1):
            t=i/(n+1)
            px=2*(1-t)*t*cxp+t*t*ex; py=topy+2*(1-t)*t*cyp+t*t*ey
            tx=2*(1-t)*cxp+2*t*(ex-cxp); ty=2*(1-t)*cyp+2*t*(ey-cyp)
            tl=math.hypot(tx,ty) or 1; tx/=tl; ty/=tl; pnx,pny=-ty,tx
            ll=length*0.14*(1-t*0.5)
            for side in (1,-1):
                lx=px+pnx*side*ll+tx*ll*0.7; ly=py+pny*side*ll+ty*ll*0.7
                g.append(f'<path d="M{px:.0f} {py:.0f} L{lx:.0f} {ly:.0f}"/>')
        g.append('</g>'); s.append(''.join(g))
    return ''.join(s)

def frond_group(length, n, fw):
    # gerader Wedel ab (0,0) nach oben, fuer Vordergrund-Spikes
    s=[f'<g stroke-width="{fw}" fill="none" stroke-linecap="round">']
    s.append(f'<path d="M0 0 L0 {-length:.0f}" stroke-width="{fw*1.2:.1f}"/>')
    for i in range(1,n+1):
        t=i/(n+1); py=-length*t
        ll=length*0.17*(1-t*0.4)
        for side in (1,-1):
            s.append(f'<path d="M0 {py:.0f} L{side*ll*0.9:.0f} {py-ll*0.7:.0f}"/>')
    s.append('</g>'); return ''.join(s)

# ---------- <defs> ----------
defs=[]
defs.append(f'<g id="m0" fill="currentColor" fill-rule="evenodd"><path d="{monstera_real(0.92,1)}"/></g>')
defs.append(f'<g id="m1" fill="currentColor" fill-rule="evenodd"><path d="{monstera_real(1.0,2)}"/></g>')
defs.append(f'<g id="m2" fill="currentColor" fill-rule="evenodd"><path d="{monstera_real(1.08,3)}"/></g>')
defs.append(f'<g id="ba" fill="currentColor"><path d="{BANANA}"/></g>')
random.seed(41)
defs.append(f'<g id="pA" fill="currentColor" stroke="currentColor" stroke-linecap="round">{palm_group(500,8,12,2.0)}</g>')
defs.append(f'<g id="pB" fill="currentColor" stroke="currentColor" stroke-linecap="round">{palm_group(500,7,12,2.0)}</g>')
defs.append(f'<g id="pC" fill="currentColor" stroke="currentColor" stroke-linecap="round">{palm_group(500,9,11,2.0)}</g>')
defs.append(f'<g id="fr" stroke="currentColor" fill="none">{frond_group(220,13,2.4)}</g>')

parts=[]
def P(s): parts.append(s)
MONS=["m0","m1","m2"]; PALMS=["pA","pB","pC"]

def use(idn, x, y, s, rot, color, op=1.0, anchor=(50,149)):
    ax,ay=anchor
    P(f'<use href="#{idn}" transform="translate({x:.0f} {y:.0f}) rotate({rot:.0f}) scale({s:.3f}) translate({-ax:.0f} {-ay:.0f})" color="{color}" opacity="{op:.2f}"/>')
def mon(x,y,s,rot,color,op=1.0): use(random.choice(MONS),x,y,s,rot,color,op,(50,149))
def ban(x,y,s,rot,color,op=1.0): use("ba",x,y,s,rot,color,op,(50,112))
def palm(x,baseY,height,color,sway=0,op=1.0):
    # Palme: Basis (0,0), Hoehe via scale (Symbol Hc=500)
    P(f'<use href="#{random.choice(PALMS)}" transform="translate({x+sway:.0f} {baseY:.0f}) scale({height/500:.3f})" color="{color}" opacity="{op:.2f}"/>')
def spike(x,y,s,rot,color,op=1.0): use("fr",x,y,s,rot,color,op,(0,0))

def grass(x,baseY,h,color,blades=8,op=1.0):
    g=[f'<g stroke="{color}" stroke-linecap="round" fill="none" opacity="{op:.2f}">']
    for _ in range(blades):
        dx=random.uniform(-h*0.42,h*0.42); bh=h*random.uniform(0.5,1.05); cx=x+dx*0.4
        g.append(f'<path d="M{x:.0f} {baseY:.0f} Q{cx:.0f} {baseY-bh*0.6:.0f} {x+dx:.0f} {baseY-bh:.0f}" stroke-width="{random.uniform(1.8,3.0):.1f}"/>')
    g.append('</g>'); P(''.join(g))

def bird(x,y,s,color,op=0.5):
    P(f'<path d="M{x:.0f} {y:.0f} q{s:.0f} {-s*0.7:.0f} {s*2:.0f} 0 q{s:.0f} {-s*0.7:.0f} {s*2:.0f} 0" stroke="{color}" stroke-width="{s*0.3:.1f}" fill="none" stroke-linecap="round" opacity="{op:.2f}"/>')

def lighten(x,y):
    dx=(x-360)/470; dy=(y-360)/320
    return min(1.0,0.32+0.68*math.hypot(dx,dy))
def mix(hexc,f):
    c=hexc.lstrip('#'); r,g,b=int(c[0:2],16),int(c[2:4],16),int(c[4:6],16)
    sr,sg,sb=0xEC,0xEE,0xF0
    return f'#{int(sr+(r-sr)*f):02x}{int(sg+(g-sg)*f):02x}{int(sb+(b-sb)*f):02x}'

# ================= AUFBAU =================
P(f'<rect width="{W}" height="{H}" fill="url(#sky)"/>')
random.seed(7)

# 1) ferne, zarte Palmen + schwache Staemme (Nebel)
for i in range(13):
    x=random.uniform(-30,W+30); h=random.uniform(360,600); base=random.uniform(640,720)
    palm(x,base,h,mix(random.choice(FAR),lighten(x,base-h)),random.uniform(-12,12),0.9)
for _ in range(10):
    tx=random.uniform(0,W); P(f'<path d="M{tx:.0f} 760 L{tx+random.uniform(-8,8):.0f} {random.uniform(280,460):.0f}" stroke="{mix("#C6CBCF",0.7)}" stroke-width="{random.uniform(2,4):.1f}" opacity="0.5"/>')

# 2) mittlere Palmen
for i in range(8):
    x=random.uniform(-20,W+20); h=random.uniform(440,650); base=random.uniform(720,795)
    palm(x,base,h,mix(random.choice(MID),lighten(x,base-h)),random.uniform(-14,14),1)

# 3) haengende Monstera-Kronendecke oben (volle Breite) + Ranken
xx=-30
while xx<W+40:
    f=lighten(xx,40)
    mon(xx, random.uniform(-46,26), random.uniform(1.5,2.5), 180+random.uniform(-26,26), mix(random.choice(CANOPY),f), 0.96)
    xx+=random.uniform(84,120)
for _ in range(7):
    vx=random.uniform(480,1180)
    P(f'<path d="M{vx:.0f} -10 C{vx+16:.0f} 130 {vx-16:.0f} 250 {vx+8:.0f} 360" stroke="{mix("#767D85",0.7)}" stroke-width="1.5" fill="none" opacity="0.55"/>')

# 4) Understory (mittelgrau)
for i in range(12):
    x=random.uniform(-20,W+20); base=random.uniform(720,800); f=lighten(x,base-140)
    if random.random()<0.6: mon(x,base,random.uniform(1.8,2.7),random.uniform(-16,16),mix(random.choice(["#8b9198","#767d85"]),f),1)
    else: ban(x,base,random.uniform(2.0,3.0),random.uniform(-18,18),mix(random.choice(["#8b9198","#767d85"]),f),1)

# 5) dichter dunkler Vordergrund — grosse, detaillierte Monstera
x=-40
while x<W+50:
    edge = x<W*0.30 or x>W*0.62
    hf=1.0 if edge else 0.60
    base=H+10+random.uniform(-6,10); k=random.random(); c=random.choice(DARK)
    if k<0.46: mon(x,base,random.uniform(2.2,3.4)*hf,random.uniform(-20,20),c,1)
    elif k<0.68: ban(x,base,random.uniform(2.2,3.4)*hf,random.uniform(-18,18),c,1)
    elif k<0.84: palm(x,base,random.uniform(300,470)*hf,c,random.uniform(-12,12),1)
    else: grass(x,base,random.uniform(80,150)*hf,c,9,1)
    x+=random.uniform(46,74)
# grosse Monstera vorne an den Raendern
for x in [50,140,230,1380,1480,1560,70,1520]:
    mon(x,H+12,random.uniform(2.8,3.8),random.uniform(-22,22),random.choice(DARK[2:]),1)
for x in [110,1450]:
    ban(x,H+8,random.uniform(3.0,3.8),random.uniform(-14,14),random.choice(DARK[2:]),1)
for x in [300,700,1100,1500]:
    grass(x,H+6,random.uniform(90,150),random.choice(DARK[1:]),10,1)
P(f'<path d="M0 {H-36} Q400 {H-64} 800 {H-42} T1600 {H-36} L1600 {H} L0 {H} Z" fill="{DARK[3]}"/>')

# 6) Voegel
for _ in range(7):
    bird(random.uniform(650,1300),random.uniform(120,320),random.uniform(7,12),mix("#565c64",0.7),0.5)

svg=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" preserveAspectRatio="xMidYMax slice">'
     f'<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
     f'<stop offset="0" stop-color="{SKY_TOP}"/><stop offset="1" stop-color="{SKY_BOT}"/></linearGradient>'
     + ''.join(defs) + '</defs>' + ''.join(parts) + '</svg>')
open('hero-jungle.svg','w').write(svg)
print('wrote hero-jungle.svg', len(svg), 'bytes,', len(parts), 'uses')
