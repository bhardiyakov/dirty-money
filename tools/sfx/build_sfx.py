#!/usr/bin/env python3
# Monta assets/sfx a partir das gravações baixadas (tools/sfx/FONTES.md): recorta passos/tiros/socos/cápsulas pelo ATAQUE (onset), faz
# loops sem emenda (motor, sirene, pneu, multidão) com cross-fade, normaliza, converte para mono e grava MP3 (avulsos) ou WAV (loops).
# Uso: python3 tools/sfx/build_sfx.py <pasta com os originais> [saída=assets/sfx]
import os, re, sys, json, subprocess, numpy as np

RAW = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else 'assets/sfx'
os.makedirs(OUT, exist_ok=True)
SR = 32000
manifest = {}

def load(name, sr=SR, ss=None, t=None, hp=None):
    cmd = ['ffmpeg', '-v', 'error']
    if ss is not None: cmd += ['-ss', str(ss)]
    if t is not None: cmd += ['-t', str(t)]
    cmd += ['-i', os.path.join(RAW, name), '-ac', '1', '-ar', str(sr)]
    if hp: cmd += ['-af', f'highpass=f={hp}:poles=2']           # (tira o ronco grave de fundo: trânsito, vento no microfone)
    cmd += ['-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).copy()

def env(x, ms=4):
    k = max(1, int(SR * ms / 1000)); a = np.abs(x)
    return np.convolve(a, np.ones(k) / k, mode='same')

def onsets(x, thr=0.3, gap=0.12, pre=0.012):
    e = env(x); th = e.max() * thr; out = []; last = -1e9
    above = e > th
    i = 1
    while i < len(e):
        if above[i] and not above[i - 1] and (i - last) / SR > gap:
            out.append(max(0, i - int(pre * SR))); last = i
        i += 1
    return out

def fade(y, fi=0.003, fo=0.04):
    y = y.copy(); a = int(fi * SR); b = int(fo * SR)
    if a: y[:a] *= np.linspace(0, 1, a)
    if b and b < len(y): y[-b:] *= np.linspace(1, 0, b)
    return y

def trim_tail(y, floor=0.02, pad=0.02):
    e = env(y, 10); th = e.max() * floor
    idx = np.where(e > th)[0]
    return y[: (idx[-1] + int(pad * SR)) if len(idx) else len(y)]

def trim_head(y, floor=0.05, pre=0.008):
    e = env(y, 3); idx = np.where(e > e.max() * floor)[0]
    return y[max(0, idx[0] - int(pre * SR)):] if len(idx) else y

# Portão suave: o que fica bem abaixo do pico (o chiado/ronco de fundo entre um som e outro) é abaixado.
def gate(y, floor=0.06, ms=8):
    e = env(y, ms); th = e.max() * floor
    g = np.clip((e / (th or 1)) ** 2, 0, 1)
    return y * g

# Volume constante (para os loops: aceleração, sirene chegando — o volume não sobe e desce a cada volta).
def flatten(y, win=0.25):
    k = int(win * SR); r = np.sqrt(np.convolve(y ** 2, np.ones(k) / k, mode='same')) + 1e-4
    return y * (np.median(r) / r) ** 0.85

def crest(y):
    r = np.sqrt(np.mean(y ** 2)) or 1e-9; return np.abs(y).max() / r

def norm_peak(y, db=-1.0):
    p = np.abs(y).max() or 1; return y * (10 ** (db / 20) / p)

def norm_rms(y, db=-20.0):
    r = np.sqrt(np.mean(y ** 2)) or 1; y = y * (10 ** (db / 20) / r)
    p = np.abs(y).max()
    return y * (0.98 / p) if p > 0.98 else y

# Os loops vão em MP3 com uma "aba" repetida nas duas pontas (o fim antes do começo e o começo depois do fim): o atraso do
# decodificador de MP3 desloca tudo por igual, então tocar de `ls` a `le` emenda sem buraco em qualquer navegador.
WRAP = 0.3

def write(name, y, kind='mp3', sr=SR, meta=None):
    path = os.path.join(OUT, name + '.mp3')
    meta = dict(meta or {})
    if kind == 'wav':                                                  # (loop)
        p = int(WRAP * SR); L = len(y)
        y = np.concatenate([y[-p:], y, y[:p]])
        meta.update(ls=WRAP, le=round(WRAP + L / SR, 4))
    raw = np.clip(y, -1, 1).astype(np.float32).tobytes()
    cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-']
    cmd += ['-ar', str(sr), '-c:a', 'libmp3lame', '-b:a', '96k' if kind == 'mp3' else '80k']
    cmd += [path]
    subprocess.run(cmd, input=raw, check=True)
    manifest[name] = dict(file=os.path.basename(path), dur=round(len(y) / SR, 3), **meta)

def shots(src, name, n, dur, thr=0.3, gap=0.15, ss=None, t=None, db=-1.0, pick='spread', tail=0.02, hp=None, gt=None, cr=0, cut=False, shape=0):
    x = load(src, ss=ss, t=t, hp=hp); on = onsets(x, thr, gap)
    near = onsets(x, thr * 0.6, 0.06)                             # (o próximo ataque, mesmo fraco: o corte para antes dele)
    cands = []
    for o in on:
        nx = [q for q in near if q > o + int(0.07 * SR)]
        end = min(o + int(dur * SR), (nx[0] - int(0.012 * SR)) if (nx and cut) else len(x))
        y = x[o:end]
        if len(y) < int((min(dur, 0.12) if cut else dur * 0.5) * SR): continue
        if cr and crest(y) < cr: continue                         # (só o que tem batida: o resto é ruído de fundo)
        if gt: y = gate(y, gt)
        if shape: y = y * np.exp(-np.arange(len(y)) / (shape * SR))   # (cai como um passo: o chiado contínuo some)
        if cut and len(trim_tail(y, tail)) < int(0.09 * SR): continue  # (estalo curto demais: batida no microfone)
        cands.append((np.abs(y).max() * (crest(y) if pick == 'clean' else 1), o, y))
    if not cands: raise SystemExit(f'sem ataques em {src}')
    if pick in ('loud', 'clean'): cands.sort(key=lambda c: -c[0])
    else:
        step = max(1, len(cands) // n); cands = cands[::step]
    got = 0
    for k, (_, o, y) in enumerate(cands[:n]):
        y = fade(trim_tail(y, tail)); write(f'{name}_{k + 1}', norm_peak(y, db), meta=dict(src=src, at=round(o / SR, 3)))
        got += 1
    return got

# Montagem de pedaços reais (ex.: recarregar = pente sai + pente entra + ferrolho; explosão = estouro + estrondo).
def mix(name, parts, db=-1.0, fo=0.08, dur=None, tf=0.02):
    segs = []
    for src, ss, t, at, gain, rate in parts:
        y = trim_head(load(src, ss=ss, t=t))
        if rate != 1:                                                       # (troca de tom por reamostragem)
            idx = np.arange(0, len(y) - 1, rate); y = np.interp(idx, np.arange(len(y)), y).astype(np.float32)
        segs.append((int(at * SR), y * gain))
    n = max(o + len(y) for o, y in segs); out = np.zeros(n, np.float32)
    for o, y in segs: out[o:o + len(y)] += y
    if dur: out = out[:int(dur * SR)]
    write(name, norm_peak(fade(trim_tail(out, tf, pad=fo + 0.02), fo=fo), db), meta=dict(src=[p[0] for p in parts]))

def loop(src, name, ss, t, xf=0.25, db=-18.0, sr=SR, meta=None, flat=False, hp=None, tune=False):
    x = load(src, ss=ss, t=t + xf + (0.1 if tune else 0), hp=hp)
    if flat: x = flatten(x)
    f = int(xf * SR); n = min(int(t * SR), len(x) - f)
    if tune:                                            # som com TOM (buzina): o comprimento que cai em fase com o começo (sem "batimento" na emenda)
        ref = x[:f]; best = (-2, n)
        for m in range(n - int(0.02 * SR), min(n + int(0.02 * SR), len(x) - f)):
            seg = x[m:m + f]; c = np.dot(seg, ref) / (np.linalg.norm(seg) * np.linalg.norm(ref) + 1e-9)
            if c > best[0]: best = (c, m)
        n = best[1]
    body = x[:n].copy(); tailx = x[n:n + f]
    w = np.linspace(0, 1, f)
    body[:f] = body[:f] * w + tailx * (1 - w)         # o fim (que continua) entra por baixo do começo: emenda sem clique
    write(name, norm_rms(body, db), kind='wav', sr=sr, meta=dict(src=src, ss=ss, loop=True, **(meta or {})))

def one(src, name, ss=None, t=None, db=-1.0, fo=0.06, kind='mp3', hp=None, head=0.05, maxd=None):
    y = load(src, ss=ss, t=t, hp=hp)
    if head: y = trim_head(y, head)
    if maxd: y = y[:int(maxd * SR)]
    y = fade(trim_tail(y, pad=fo + 0.02), fo=fo)
    write(name, norm_peak(y, db), kind=kind, meta=dict(src=src, ss=ss))

B = lambda i: f'bsb_{i}.ogg'
G = lambda f: os.path.join('oga_some', f)

# ---------------------------------------------------------------- passos (5 variações por chão)
shots(B('0514'), 'step_concrete', 6, 0.30, thr=0.25, hp=110, gt=0.07, cr=4.0, pick='clean', gap=0.25, cut=True, shape=0.07)
shots(B('1318'), 'run_concrete', 5, 0.22, thr=0.3, hp=110, gt=0.07, cr=4.0, pick='clean', gap=0.25, cut=True, shape=0.07)
shots(B('1253'), 'step_grass', 5, 0.34, thr=0.25, hp=110, gt=0.07, cr=4.0, pick='clean', gap=0.25, cut=True, shape=0.07)
shots(B('1254'), 'run_grass', 4, 0.26, thr=0.3, hp=110, gt=0.07, cr=4.0, pick='clean', gap=0.25, cut=True, shape=0.07)
shots(B('0137'), 'step_leaves', 5, 0.40, thr=0.25, hp=110, gt=0.07, cr=4.0, pick='clean', gap=0.25, cut=True, shape=0.07)
shots(B('0510'), 'step_gravel', 5, 0.34, thr=0.25, hp=110, gt=0.07, cr=4.0, pick='clean', gap=0.25, cut=True, shape=0.07)
shots(B('3202'), 'step_dirt', 5, 0.30, thr=0.25, hp=110, gt=0.07, cr=4.0, pick='clean', gap=0.25, cut=True, shape=0.07)
shots(B('0208'), 'step_sand', 5, 0.34, thr=0.25, hp=110, gt=0.07, cr=4.0, pick='clean', gap=0.25, cut=True, shape=0.07)
shots(B('0495'), 'step_mud', 4, 0.40, thr=0.25, hp=110, gt=0.07, cr=4.0, pick='clean', gap=0.25, cut=True, shape=0.07)
shots(B('0690'), 'step_water', 4, 0.45, thr=0.25, hp=110, gt=0.07, cr=4.0, pick='clean', gap=0.25, cut=True, shape=0.07)
shots(B('0165'), 'step_wood', 5, 0.30, thr=0.25, hp=110, gt=0.07, cr=4.0, pick='clean', gap=0.25, cut=True, shape=0.07)
shots(B('0376'), 'step_tile', 5, 0.28, thr=0.25, hp=110, gt=0.07, cr=4.0, pick='clean', gap=0.25, cut=True, shape=0.07)
shots(B('0166'), 'step_heels', 5, 0.24, thr=0.3, hp=110, gt=0.07, cr=4.0, pick='clean', gap=0.25, cut=True, shape=0.07)
shots(B('0373'), 'step_slipper', 5, 0.24, thr=0.3, hp=110, gt=0.07, cr=4.0, pick='clean', gap=0.25, cut=True, shape=0.07)
# ---------------------------------------------------------------- armas
shots(B('0438'), 'gun_pistol', 3, 0.9, thr=0.5, gap=0.3, pick='loud', tail=0.01)
one(B('0437'), 'gun_smg', maxd=0.55, fo=0.3)                      # (Beretta M12: um disparo; a rajada repete com tom variado)
one(B('0397'), 'gun_heavy', maxd=0.9, fo=0.35)                     # (Winchester Magnum: o tiro grosso do atirador)
shots(B('2853'), 'gun_rifle', 2, 0.9, thr=0.5, gap=0.3, pick='loud', tail=0.01)
shots(B('2854'), 'gun_rifle_b', 2, 0.9, thr=0.5, gap=0.3, pick='loud', tail=0.01)
shots(B('0532'), 'gun_shotgun', 2, 0.85, thr=0.5, gap=0.4, pick='loud', tail=0.01)
shots(B('1355'), 'casing', 2, 0.5, thr=0.3)
shots(B('1356'), 'casing_b', 2, 0.5, thr=0.3)
one(B('1357'), 'casing_c', maxd=0.6, fo=0.1); one(B('1359'), 'casing_d', maxd=0.6, fo=0.1)
mix('gun_reload', [(B('1988'), 0.2, 0.4, 0.0, 1.0, 1), (B('1989'), 0.2, 0.45, 0.42, 1.0, 1), (B('1985'), 0, 0.45, 0.82, 1.3, 1)], fo=0.04)
one(B('1984'), 'gun_cock', t=0.8, fo=0.04)
mix('explosion_1', [(B('1807'), 0, 0.2, 0, 1.0, 1), (B('1023'), 0, 4.0, 0.015, 2.2, 1)], fo=0.6, tf=0.004)
mix('explosion_2', [(B('1808'), 0, 0.3, 0, 1.0, 1), (B('1023'), 0, 4.0, 0.02, 2.2, 0.82), (B('1806'), 0, 0.5, 0.04, 0.5, 0.9)], fo=0.6, tf=0.004)
one(B('1023'), 'explosion_far', fo=0.6)
# ---------------------------------------------------------------- impactos
for k, i in enumerate(['0105', '0444', '0806', '2459']): shots(B(i), 'punch_' + 'abcd'[k], 1, 0.4, thr=0.4, pick='loud', hp=60, gt=0.05)
one('oga_qubodup-crash.ogg', 'crash_1')
mix('crash_2', [('oga_qubodup-crash.ogg', 0, 0.6, 0, 0.45, 0.9), (B('1773'), 0, 1.3, 0.03, 0.9, 1)], fo=0.25)
mix('crash_3', [('oga_qubodup-crash.ogg', 0, 0.6, 0, 0.45, 1.1), (B('1776'), 0, 1.6, 0.02, 0.8, 0.95)], fo=0.35, dur=1.5)
mix('crash_4', [('oga_qubodup-crash.ogg', 0, 0.6, 0, 0.45, 0.8), (B('1778'), 0.05, 1.2, 0.0, 0.9, 1)], fo=0.3)
one(B('0655'), 'car_bump', t=1.2)
one(B('0148'), 'glass_1', maxd=1.4, fo=0.25); one(B('0771'), 'glass_2', maxd=0.9, fo=0.25)
# ---------------------------------------------------------------- pneu, sirene, buzina
loop(B('2369'), 'tire_screech', ss=0.4, t=1.4, xf=0.2, db=-16)
shots(B('2368'), 'tire_squeal', 2, 1.4, thr=0.3, gap=0.8, pick='loud')
loop('muted_sirens_preview.mp3', 'siren_wail', ss=58.15, t=5.05, xf=0.3, db=-16, flat=True, hp=300)
loop('muted_sirens_preview.mp3', 'siren_yelp', ss=13.0, t=3.0, xf=0.15, db=-16, flat=True, hp=300)
# buzinas: 4 de carro (cada carro do trânsito fica com a sua), a "fon-fon" dos antigos, 2 de moto, caminhão e ônibus
one(B('0258'), 'horn_car_a', t=1.5)                                 # padrão (≈ 520 Hz)
one(B('0850'), 'horn_car_b', ss=4.3, t=2.5)                        # aguda, longa
one(B('3438'), 'horn_car_c', ss=2.15, t=0.6, fo=0.08)             # grave (sedã/SUV)
one(B('0969'), 'horn_car_d', ss=1.4, t=0.55, fo=0.06)             # curtinha de carro pequeno
one(B('2542'), 'horn_old', t=1.3, fo=0.1)                          # "fon-fon" de buzina antiga
one(B('0260'), 'horn_moto_a', t=0.6, fo=0.05)                      # moto: bipe curto
one(B('3506'), 'horn_moto_b', t=0.9, fo=0.06)                      # moto: aguda
one(B('2721'), 'horn_truck', t=1.0, fo=0.1)
one(B('3594'), 'horn_bus', t=2.0)
one(B('0275'), 'bell_bike_1', t=1.3, fo=0.3); one(B('1042'), 'bell_bike_2', t=1.6, fo=0.4)   # campainha da bicicleta
loop(B('0258'), 'horn_stuck', ss=0.35, t=0.8, xf=0.03, db=-14, tune=True)      # buzina presa (motorista caído no volante)
# ---------------------------------------------------------------- mar e água
loop(B('1446'), 'sea_surf', ss=20, t=20, xf=1.5, db=-20, sr=24000)  # ondas quebrando na areia
loop(B('0698'), 'sea_open', ss=30, t=18, xf=1.5, db=-20, sr=24000)  # mar aberto (no barco, nadando longe)
shots(B('1513'), 'swim_stroke', 5, 0.55, thr=0.3, gap=0.6, pick='loud', hp=90, gt=0.08, shape=0.16)        # braçada (remada da mão na água)
for k, i in enumerate(['1529', '1530', '1531', '1532', '1533', '1534']): one(B(i), f'splash_small_{k + 1}', maxd=0.8, fo=0.25)
one(B('1519'), 'splash_big_1', maxd=1.6, fo=0.5); one(B('1521'), 'splash_big_2', maxd=1.8, fo=0.5)
# ---------------------------------------------------------------- gritos (pânico: tiro, crime) — sem palavras
one('oga2/female_scream_1.ogg', 'scream_f_1', fo=0.15)
one('oga2/high_pitch_scream.mp3', 'scream_f_2', maxd=1.5, fo=0.35)
one('oga2/screams_0.ogg', 'scream_f_3', ss=0, t=1.4, fo=0.15)
one('oga2/screams_0.ogg', 'scream_f_4', ss=3.3, t=1.2, fo=0.15)
one('oga2/yell/yelling sounds/3yell1.wav', 'scream_m_1', fo=0.2)
one('oga2/yell/yelling sounds/3yell14.wav', 'scream_m_2', fo=0.15)
one('oga2/yell/yelling sounds/1yell3.wav', 'scream_m_3', fo=0.12)
one(B('2361'), 'scream_m_4', fo=0.08)
# ---------------------------------------------------------------- notificações do celular
one(B('1111'), 'notify_msg', maxd=1.3, fo=0.3)                      # mensagem chegando
one(B('2063'), 'notify_a', fo=0.05); one(B('2059'), 'notify_b', fo=0.05)
one(B('1398'), 'notify_ok', maxd=1.4, fo=0.4)                        # deu certo (entrega, pagamento)
# ---------------------------------------------------------------- fogos de artifício (gravados: rubberduck/OGA e BigSoundBank)
F = lambda n: f'oga3/bangs/{n}.ogg'
for k, n in enumerate(['bang_01', 'bang_03', 'bang_06', 'bang_09', 'fw_01', 'fw_03', 'fw_06']): one(F(n), f'fw_burst_{k + 1}', fo=0.25)
one(B('2672'), 'fw_burst_8', ss=1.15, t=1.9, fo=0.5)                    # o estouro grande do show
one(F('fw_04'), 'fw_launch_1', t=0.28, fo=0.08)                         # o "tum" do morteiro lançando a bomba
one(F('cannon_05'), 'fw_launch_2', t=0.32, fo=0.1); one(F('cannon_03'), 'fw_launch_3', t=0.32, fo=0.1)
one(F('fw_02'), 'fw_crackle_1', fo=0.2)                                  # o crepitar das estrelas caindo
one(B('2672'), 'fw_crackle_2', ss=20.2, t=1.8, fo=0.45); one(B('2672'), 'fw_crackle_3', ss=25.0, t=1.8, fo=0.45)
shots(B('1050'), 'fw_far', 5, 2.0, thr=0.3, gap=1.5, pick='loud', tail=0.005, cut=True)   # estouros ao longe (o eco nos morros)
# ---------------------------------------------------------------- multidão (loops longos)
loop(B('3515'), 'crowd_street', ss=5, t=16, xf=1.0, db=-20, sr=24000)
loop(B('2728'), 'crowd_market', ss=8, t=16, xf=1.0, db=-20, sr=24000)
# ---------------------------------------------------------------- motor (marcha lenta de verdade, uma por família; o jogo sobe o tom com o giro)
# rpm = a marcha lenta da gravação (o jogo toca a 1× na marcha lenta do perfil e acelera a reprodução com o giro)
loop(B('0187'), 'eng_car', ss=21.2, t=4.0, xf=0.3, db=-16, sr=24000, meta=dict(rpm=800), flat=True)       # 4 cilindros limpo
loop(B('0675'), 'eng_beater', ss=1.6, t=2.6, xf=0.25, db=-16, sr=24000, meta=dict(rpm=800), flat=True)    # escapamento furado (carro velho)
loop(B('0534'), 'eng_v8', ss=14.2, t=4.0, xf=0.3, db=-16, sr=24000, meta=dict(rpm=700), flat=True)        # AC Cobra (V8)
loop(B('1145'), 'eng_truck', ss=4.0, t=3.0, xf=0.25, db=-16, sr=24000, meta=dict(rpm=650))                # caminhão a diesel
loop(B('0884'), 'eng_moto', ss=15.0, t=3.0, xf=0.25, db=-16, sr=24000, meta=dict(rpm=1350), flat=True)    # moto
loop(B('0872'), 'starter', ss=1.0, t=1.4, xf=0.12, db=-18, sr=24000)                                      # motor de arranque girando
# ---------------------------------------------------------------- câmbio e freio de mão (gravados dentro do carro)
for k, f in enumerate(['gear01.wav', 'gear04.wav', 'gear07.wav', 'gear10.wav']): one(G(f), f'gear_{k + 1}', t=0.8, fo=0.08, head=0.2)
one(G('handbrake.wav'), 'handbrake', t=1.2, head=0.15)

# sfx.json (o jogo lê): grupos de variações — 'punch_a_1', 'punch_b_1'… viram 'punch'; 'gun_rifle_b_1' entra em 'gun_rifle'.
groups = {}
for k, v in manifest.items():
    e = dict(f=v['file'], d=v['dur'], **{q: v[q] for q in ('rpm', 'ls', 'le') if q in v})
    groups.setdefault(re.sub(r'(_[a-d])?(_\d+)?$', '', k), []).append(e)
json.dump(groups, open(os.path.join(OUT, 'sfx.json'), 'w'), separators=(',', ':'))
json.dump(manifest, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'origem.json'), 'w'), ensure_ascii=False, indent=1)
tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print(len(manifest), 'sons,', round(tot / 1024), 'KB')
