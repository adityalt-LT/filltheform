import json
W=json.load(open('word.json')); UPM=W['upm']; XH=W['xheight']
INK='#1D1D1F'; BLUE='#2F6BFF'
S=lambda **k: ' '.join(f'{a.replace("_","-")}="{b}"' for a,b in k.items())

def mark(kind, bg=True):
    """Return inner SVG (viewBox 0 0 64 64) for a mark. Uses currentColor for the ink parts."""
    if kind=='a':   # check-R on a blue app tile (centred and enlarged)
        tile='<rect width="64" height="64" rx="15" fill="%s"/>'%BLUE if bg else ''
        col='#fff' if bg else 'currentColor'
        tick=('#fff' if bg else BLUE)
        g=('<g transform="translate(32 32) scale(1.12) translate(-35.2 -32)">'
           f'<path d="M23 46V18M23 18H33.5A8.5 8.5 0 0 1 33.5 35H23" fill="none" stroke="{col}" stroke-width="6.2" stroke-linecap="round" stroke-linejoin="round"/>'
           f'<path d="M31.5 36L37 43L48 28" fill="none" stroke="{tick}" stroke-width="6.2" stroke-linecap="round" stroke-linejoin="round"/></g>')
        return tile+g
    if kind=='b':   # role + mate overlap = match
        return (f'<rect x="6" y="6" width="36" height="36" rx="11" fill="currentColor"/>'
                f'<rect x="22" y="22" width="36" height="36" rx="11" fill="{BLUE}"/>'
                f'<clipPath id="ov"><rect x="6" y="6" width="36" height="36" rx="11"/></clipPath>'
                f'<g clip-path="url(#ov)"><rect x="22" y="22" width="36" height="36" rx="11" fill="#fff"/></g>'
                f'<path d="M27 33.5L31.6 38L38.4 29.5" fill="none" stroke="{BLUE}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>')
    if kind=='c':   # chat bubble holding an R
        return (f'<path d="M22 5H42A17 17 0 0 1 59 22V32A17 17 0 0 1 42 49H27L14 59V47.4A17 17 0 0 1 5 32V22A17 17 0 0 1 22 5Z" fill="currentColor"/>'
                f'<path d="M23.5 38V16.5M23.5 16.5H32A6.2 6.2 0 0 1 32 28.9H23.5" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
                f'<path d="M31 28.9L38 38" fill="none" stroke="{BLUE}" stroke-width="5" stroke-linecap="round"/>')

def svg_mark(kind, color=INK, bg=True, size=64):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="{size}" height="{size}" style="color:{color}">{mark(kind,bg)}</svg>'

def lockup(kind, color=INK, mate=BLUE, bg=True, h=48):
    # mark scaled to h, wordmark font size chosen so x-height reads well beside it
    fs=h*0.92; sc=fs/UPM; gap=h*0.30
    wr=W['wRole']*sc; wm=W['wMate']*sc; wa=W['wAll']*sc
    base=h/2 + (XH*sc)/2
    total=h+gap+wa
    inner=mark(kind,bg)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total:.1f} {h}" width="{total:.0f}" height="{h}" style="color:{color}">'
            f'<g transform="scale({h/64:.4f})">{inner}</g>'
            f'<g transform="translate({h+gap:.2f},{base:.2f}) scale({sc:.5f})"><path d="{W["role"]}" fill="{color}"/>'
            f'<g transform="translate({W["wRole"]:.1f},0)"><path d="{W["mate"]}" fill="{mate}"/></g></g></svg>')

if __name__=='__main__':
    import os
    out='/home/user/filltheform/tailorkit/brand'; os.makedirs(out,exist_ok=True)
    for k in 'ab':
        open(f'{out}/mark-{k}.svg','w').write(svg_mark(k))
    rows=''
    for k,name in [('a','A · Check-R'),('b','B · Match')]:
        rows+=f'<section><h3>{name}</h3><div class="r"><div class="tile">{svg_mark(k,size=110)}</div><div class="tile dark">{svg_mark(k,color="#fff",size=110)}</div><div class="tile">{lockup(k)}</div><div class="tile dark">{lockup(k,color="#fff",mate="#7EA1FF")}</div><div class="tile sm">{svg_mark(k,size=32)}{svg_mark(k,size=16)}</div></div></section>'
    open('sheet.html','w').write(f'<!doctype html><meta charset=utf-8><style>body{{font:14px Inter,sans-serif;background:#FBFBFD;padding:30px}}h3{{margin:24px 0 10px}}.r{{display:flex;gap:16px;flex-wrap:wrap;align-items:center}}.tile{{background:#fff;padding:26px;border-radius:24px;box-shadow:0 8px 24px -12px rgba(0,0,0,.2);display:flex;gap:14px;align-items:center}}.dark{{background:#0A0A0B}}.sm{{padding:20px}}</style>{rows}')
