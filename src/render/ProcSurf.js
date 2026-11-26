// ============================================================================
// ProcSurf — superfícies DESENHADAS NO SHADER, sem textura: nítidas de perto, sem chuvisco de longe (o detalhe some pela derivada), e
// sem ocupar memória de vídeo. Cada uma é um plugin de material (StandardMaterial) que pinta a cor base pela UV da malha:
//   calcadao   o calçadão da praia: as ondas largas de pedra portuguesa preta sobre a branca, com as pedrinhas e o rejunte
//              (UV = metros/6 ao longo e de través, como a textura de antes: 512 × 768, ~2 MB)
//   pitch      o gramado do estádio: as faixas do corte e as linhas do campo (UV 0..1 no campo, 640 × 480 "px" como o desenho de
//              antes: ~1,6 MB)
//   brick · zinc · plank · roof · glass · door   o BARRACO do protagonista por fora (world/HouseView.js; antes as texturas hs*): o bloco
//              com o reboco caído aos pedaços, a chapa de zinco ondulada com as emendas e a ferrugem escorrida, as tábuas pintadas e
//              desbotadas, o telhado de zinco (pela posição no mundo), o vidro com o caixilho e a porta de tábua. UV das paredes =
//              metros / 3,2, como antes.
// `?superficies=2d` volta às texturas.
// ============================================================================

const ProcSurf = {
    get on() {
        if (typeof location !== 'undefined' && /[?&]superficies=2d\b/.test(location.search)) return false;
        return !!(typeof Config !== 'undefined' && Config.art && Config.art.procSurf !== false);
    },
    KIND: { calcadao: 1, pitch: 2, brick: 3, zinc: 4, plank: 5, roof: 6, glass: 7, door: 8 },

    // Liga o desenho `kind` no material (a cor difusa fica branca: o desenho é a cor base).
    apply(m, kind) {
        if (!this._cls) this._cls = this._plugin();
        m.diffuseColor = BABYLON.Color3.White();
        new this._cls(m, this.KIND[kind]);
        return m;
    },

    _plugin() {
        return class ProcSurfPlugin extends BABYLON.MaterialPluginBase {
            constructor(m, kind) { super(m, 'ProcSurf', 126, { PROCSURF: 0 }); this.kind = kind; this._enable(true); }
            getClassName() { return 'ProcSurfPlugin'; }
            prepareDefinesBeforeAttributes(d) { d._needUVs = true; }
            prepareDefines(d) { d.PROCSURF = this.kind; }
            getCustomCode(type) {
                if (type === 'vertex') return {
                    CUSTOM_VERTEX_DEFINITIONS: 'varying vec2 psUV;',
                    CUSTOM_VERTEX_MAIN_END: `
                        #ifdef UV1
                        psUV = uv;
                        #else
                        psUV = vec2(0.0);
                        #endif`,
                };
                return { CUSTOM_FRAGMENT_DEFINITIONS: ProcSurf.GLSL_DEFS, CUSTOM_FRAGMENT_BEFORE_LIGHTS: ProcSurf.GLSL_MAIN };
            }
        };
    },
};

// (sem ponto e vírgula em comentário GLSL: o Babylon corta a linha ali — os comentários ficam fora das strings)
ProcSurf.GLSL_DEFS = `
varying vec2 psUV;
float psH(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float psLine(float d, float w, float aa) { return 1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, abs(d)); }
float psBox(vec2 p, vec2 c, vec2 h) { vec2 q = abs(p - c) - h; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
float psN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(psH(i), psH(i + vec2(1.0, 0.0)), f.x), mix(psH(i + vec2(0.0, 1.0)), psH(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 psRust(vec2 p, vec3 c, float k) {
    float st = psN(vec2(p.x * 9.0, p.y * 0.8)) * psN(p * 1.3 + 7.0);
    return mix(c, vec3(0.56, 0.33, 0.18) * (0.8 + 0.4 * psN(p * 6.0)), smoothstep(0.32, 0.6, st) * k);
}
`;

ProcSurf.GLSL_MAIN = `
#if PROCSURF == 1
{
    vec2 P = psUV * 6.0;
    #ifdef WEBGL2
    float aa = max(length(fwidth(P)), 0.002);
    #else
    float aa = 0.03;
    #endif
    float y = P.y - sin(P.x * 1.0471976) * 0.41 - 0.31;
    float m = mod(y, 1.17);
    float sd = m < 0.45 ? min(m, 0.45 - m) : -min(m - 0.45, 1.17 - m);
    float dark = smoothstep(-aa, aa, sd);
    vec2 st = floor(P / 0.055);
    float hs = psH(st), det = 1.0 - smoothstep(0.004, 0.025, aa);
    vec3 white = vec3(0.92, 0.9, 0.86) * (0.9 + 0.14 * hs), black = vec3(0.14, 0.14, 0.16) * (0.85 + 0.35 * hs);
    vec3 c = mix(white, black, dark);
    vec2 f = fract(P / 0.055);
    float jn = 1.0 - smoothstep(0.0, 0.14, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    c = mix(c, vec3(0.5, 0.48, 0.44), jn * 0.45 * det);
    c = mix(mix(vec3(0.92, 0.9, 0.86), vec3(0.14, 0.14, 0.16), dark), c, 0.35 + 0.65 * det);
    baseColor.rgb = c;
}
#elif PROCSURF == 2
{
    vec2 p = psUV * vec2(640.0, 480.0);
    #ifdef WEBGL2
    float aa = max(length(fwidth(p)) * 0.7, 0.4);
    #else
    float aa = 1.0;
    #endif
    float stripe = mod(floor(p.x / (640.0 / 12.0)), 2.0);
    vec3 g = stripe > 0.5 ? vec3(0.247, 0.604, 0.235) : vec3(0.29, 0.67, 0.27);
    g *= 0.94 + 0.08 * psH(floor(p * 0.5));
    float L = 0.0, w = 4.0;
    L = max(L, psLine(psBox(p, vec2(320.0, 240.0), vec2(294.0, 214.0)), w, aa));
    L = max(L, psLine(p.x - 320.0, w, aa) * step(26.0, p.y) * step(p.y, 454.0));
    L = max(L, psLine(length(p - vec2(320.0, 240.0)) - 54.0, w, aa));
    L = max(L, 1.0 - smoothstep(5.0 - aa, 5.0 + aa, length(p - vec2(320.0, 240.0))));
    for (int s = 0; s < 2; s++) {
        float x = s == 0 ? 26.0 : 614.0, d = s == 0 ? 1.0 : -1.0;
        L = max(L, psLine(psBox(p, vec2(x + d * 49.0, 240.0), vec2(49.0, 120.0)), w, aa));
        L = max(L, psLine(psBox(p, vec2(x + d * 17.0, 240.0), vec2(17.0, 56.0)), w, aa));
        vec2 ps = vec2(x + d * 70.0, 240.0);
        L = max(L, 1.0 - smoothstep(5.0 - aa, 5.0 + aa, length(p - ps)));
        float outside = step(98.0, (p.x - x) * d);
        L = max(L, psLine(length(p - ps) - 54.0, w, aa) * outside);
        L = max(L, (1.0 - smoothstep(-aa, aa, psBox(p, vec2(x - d * 5.0, 240.0), vec2(5.0, 24.0)))) * 0.95);
        L = max(L, psLine(length(p - vec2(x, 26.0)) - 12.0, w, aa) * step(0.0, (p.x - x) * d) * step(26.0, p.y));
        L = max(L, psLine(length(p - vec2(x, 454.0)) - 12.0, w, aa) * step(0.0, (p.x - x) * d) * step(p.y, 454.0));
    }
    baseColor.rgb = mix(g, vec3(0.95), L * 0.92);
}
#elif PROCSURF == 3
{
    vec2 P = psUV * 3.2;
    #ifdef WEBGL2
    float aa = max(length(fwidth(P)), 0.002);
    #else
    float aa = 0.01;
    #endif
    float row = floor(P.y / 0.2), x = P.x / 0.4 + 0.5 * mod(row, 2.0);
    vec2 id = vec2(floor(x), row), f = vec2(fract(x) * 0.4, fract(P.y / 0.2) * 0.2);
    float e = min(min(f.x, 0.4 - f.x), min(f.y, 0.2 - f.y)), h = psH(id);
    vec3 b = mix(vec3(0.64, 0.32, 0.23), vec3(0.73, 0.42, 0.28), h) * (0.88 + 0.22 * psN(P * 7.0));
    b *= 0.86 + 0.14 * smoothstep(0.0, 0.2, f.y);
    vec3 c = mix(vec3(0.42, 0.29, 0.22), b, smoothstep(0.006 - aa, 0.016 + aa, e));
    float pl = psN(P * 1.1 + 3.0) * 0.75 + psN(P * 4.3) * 0.25;
    float edge = smoothstep(0.56, 0.6, pl);
    vec3 plaster = vec3(0.79, 0.72, 0.6) * (0.85 + 0.2 * psN(P * 5.0));
    c = mix(c, plaster, edge);
    c *= 1.0 - 0.35 * (smoothstep(0.52, 0.56, pl) - edge * 0.9);
    c *= 0.9 + 0.1 * smoothstep(0.0, 1.2, P.y);
    baseColor.rgb = c;
}
#elif PROCSURF == 4
{
    vec2 P = psUV * 3.2;
    float w = sin(P.x * 6.2831853 / 0.076);
    vec3 c = vec3(0.6, 0.64, 0.66) * (0.86 + 0.14 * w) * (0.92 + 0.12 * psH(vec2(floor(P.x / 0.9), 1.0)));
    float seam = 1.0 - smoothstep(0.0, 0.03, min(fract(P.x / 0.9), 1.0 - fract(P.x / 0.9)) * 0.9);
    c *= 1.0 - 0.35 * seam;
    c = psRust(P, c, 0.85);
    c *= 0.88 + 0.12 * psN(P * 2.0);
    baseColor.rgb = c;
}
#elif PROCSURF == 5
{
    vec2 P = psUV * 3.2;
    float id = floor(P.x / 0.16), f = fract(P.x / 0.16);
    float h = psH(vec2(id, 3.0));
    vec3 paint = h < 0.4 ? vec3(0.35, 0.56, 0.62) : (h < 0.7 ? vec3(0.45, 0.6, 0.4) : vec3(0.72, 0.62, 0.42));
    vec3 wood = vec3(0.45, 0.33, 0.22) * (0.8 + 0.3 * psN(vec2(P.x * 30.0, P.y * 1.5)));
    float peel = smoothstep(0.45, 0.6, psN(vec2(P.x * 4.0, P.y * 2.5) + id * 3.1));
    vec3 c = mix(paint * (0.85 + 0.2 * psN(P * vec2(20.0, 2.0))), wood, peel);
    c *= 1.0 - 0.55 * (1.0 - smoothstep(0.0, 0.06, min(f, 1.0 - f)));
    c *= 0.92 + 0.12 * h;
    baseColor.rgb = c;
}
#elif PROCSURF == 6
{
    vec2 P = vPositionW.xz;
    float w = sin(P.x * 6.2831853 / 0.076);
    float sheet = floor(P.x / 2.0) + floor(P.y / 3.0) * 7.0;
    vec3 c = vec3(0.6, 0.64, 0.67) * (0.84 + 0.16 * w) * (0.86 + 0.18 * psH(vec2(sheet, 2.0)));
    c *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 0.04, min(fract(P.x / 2.0), 1.0 - fract(P.x / 2.0)) * 2.0));
    c = psRust(vec2(P.x, -P.y), c, 1.0);
    c *= 0.86 + 0.16 * psN(P * 1.7);
    baseColor.rgb = c;
}
#elif PROCSURF == 7
{
    vec2 u = psUV;
    vec3 g = mix(vec3(0.18, 0.3, 0.4), vec3(0.62, 0.76, 0.86), smoothstep(0.0, 1.0, u.y * 0.8 + u.x * 0.3));
    float ref = smoothstep(0.0, 0.06, 0.08 - abs(fract(u.x * 1.4 - u.y * 0.9) - 0.5));
    g = mix(g, vec3(0.9, 0.95, 1.0), ref * 0.35);
    float fr = min(min(u.x, 1.0 - u.x), min(u.y, 1.0 - u.y)), mid = abs(u.x - 0.5);
    float frame = 1.0 - smoothstep(0.05, 0.07, min(fr, mid));
    baseColor.rgb = mix(g, vec3(0.3, 0.22, 0.15), frame);
}
#elif PROCSURF == 8
{
    vec2 u = psUV;
    float id = floor(u.x * 5.0), f = fract(u.x * 5.0);
    vec3 c = vec3(0.42, 0.3, 0.2) * (0.82 + 0.3 * psN(vec2(u.x * 60.0, u.y * 4.0))) * (0.9 + 0.16 * psH(vec2(id, 5.0)));
    c *= 1.0 - 0.5 * (1.0 - smoothstep(0.0, 0.07, min(f, 1.0 - f)));
    float bar = max(1.0 - smoothstep(0.03, 0.05, abs(u.y - 0.25)), 1.0 - smoothstep(0.03, 0.05, abs(u.y - 0.78)));
    c = mix(c, vec3(0.34, 0.24, 0.16), bar);
    c = mix(c, vec3(0.62, 0.62, 0.6), 1.0 - smoothstep(0.02, 0.03, length((u - vec2(0.82, 0.5)) * vec2(1.0, 0.6))));
    baseColor.rgb = c;
}
#endif
`;
