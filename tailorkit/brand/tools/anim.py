import json
L=json.load(open('letters.json')); UPM=L['upm']
BLUE='#2F6BFF'
def build(variant, dark=False, p=None):
    p=p or f"rm{variant}{'d' if dark else 'l'}"
    ink='#FFFFFF' if dark else '#1D1D1F'; night='#0A0A0B'
    mate='#7EA1FF' if dark else BLUE
    onink=night if dark else '#FFFFFF'          # letter colour inside the first square
    H=72; pad=4; sc=58/UPM; gap=20
    base=pad+32+(L['xheight']*sc)/2
    wx=pad+64+gap
    W=wx+L['total']*sc+pad
    # letters (wordmark)
    lets=''
    for i,l in enumerate(L['letters']):
        col=ink if i<4 else mate
        lets+=f'<g transform="translate({l["x"]:.1f} 0)"><path class="{p}-lt" style="--i:{i}" d="{l["d"]}" fill="{col}"/></g>'
    # the two squares: group at translate(pad,pad)
    sq1=f'<rect class="{p}-sq1" x="6" y="6" width="36" height="36" rx="11" fill="{ink}"/>'
    sq2=f'<rect class="{p}-sq2" x="22" y="22" width="36" height="36" rx="11" fill="{BLUE}"/>'
    ov=(f'<clipPath id="{p}-c"><rect x="6" y="6" width="36" height="36" rx="11"/></clipPath>'
        f'<g clip-path="url(#{p}-c)"><rect class="{p}-ov" x="22" y="22" width="36" height="36" rx="11" fill="#fff"/></g>')
    ck=f'<path class="{p}-ck" pathLength="1" d="M27 33.5L31.6 38L38.4 29.5" fill="none" stroke="{BLUE}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>'
    letters=''
    if variant==2:
        cs=11/L['cap']
        rx=16-L['R']['w']*cs/2; ry=16+11/2
        mx=47-L['M']['w']*cs/2; my=48+11/2
        letters=(f'<g transform="translate({rx:.2f} {ry:.2f}) scale({cs:.5f})"><path class="{p}-R" d="{L["R"]["d"]}" fill="{onink}"/></g>'
                 f'<g transform="translate({mx:.2f} {my:.2f}) scale({cs:.5f})"><path class="{p}-M" d="{L["M"]["d"]}" fill="#fff"/></g>')
    ease='cubic-bezier(.22,1,.36,1)'; spring='cubic-bezier(.34,1.56,.64,1)'
    d1=0 if variant==1 else .15
    css=f'''
.{p}-sq1{{animation:{p}-a .85s {ease} both}} .{p}-sq2{{animation:{p}-b .85s {ease} both}}
@keyframes {p}-a{{from{{opacity:0;transform:translate(-20px,-20px)}}}} @keyframes {p}-b{{from{{opacity:0;transform:translate(20px,20px)}}}}
.{p}-ov{{transform-box:fill-box;transform-origin:center;animation:{p}-o .5s .7s {spring} both}} @keyframes {p}-o{{from{{opacity:0;transform:scale(.5)}}}}
.{p}-ck{{stroke-dasharray:1;animation:{p}-k .45s 1.05s ease-out both}} @keyframes {p}-k{{from{{stroke-dashoffset:1}}}}
.{p}-lt{{animation:{p}-l .7s {ease} both;animation-delay:calc(1.45s + var(--i)*.075s)}} @keyframes {p}-l{{from{{opacity:0;transform:translateY(18px)}}}}
'''
    if variant==2:
        css+=f'''
.{p}-R,.{p}-M{{transform-box:fill-box;transform-origin:center;animation:{p}-f .5s .35s ease-out both}} @keyframes {p}-f{{from{{opacity:0}}}}
.{p}-R{{animation:{p}-f .5s .35s ease-out both,{p}-pu .6s 1.45s {ease}}} .{p}-M{{animation:{p}-f .5s .35s ease-out both,{p}-pu .6s 1.75s {ease}}}
@keyframes {p}-pu{{50%{{transform:scale(1.35)}}}}
'''
    css+=f'@media (prefers-reduced-motion:reduce){{[class^="{p}-"]{{animation:none!important}}}}'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.1f} {H}" width="{W:.0f}" height="{H}" role="img" aria-label="Rolemate"><style>{css}</style>'
            f'<g transform="translate({pad} {pad})">{sq1}{sq2}{ov}{ck}{letters}</g>'
            f'<g transform="translate({wx} {base:.2f}) scale({sc:.5f} {sc:.5f})">{lets}</g></svg>')
if __name__=='__main__':
    import os
    out='/home/user/filltheform/tailorkit/brand/animated'; os.makedirs(out,exist_ok=True)
    for v in (1,2):
        for dark in (False,True):
            open(f'{out}/rolemate-animated-{v}{"-dark" if dark else ""}.svg','w').write(build(v,dark))
    print(len(build(1)),len(build(2)))
