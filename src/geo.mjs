// Pure geometry, kept free of the DOM so it can be unit-tested.
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Corners of a rectangle centred on (cx, cy), turned by `deg` degrees. */
export function rectQuad(cx, cy, hw, hh, deg) {
  const a = (deg * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [cx + x * co - y * si, cy + x * si + y * co]);
}
export function polyArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; s += p[i][0] * q[1] - q[0] * p[i][1]; }
  return Math.abs(s) / 2;
}
/** Shared area of two convex shapes (Sutherland–Hodgman clipping). */
export function overlap(qa, qb) {
  let out = qa;
  for (let i = 0; i < qb.length && out.length; i++) {
    const A = qb[i], B = qb[(i + 1) % qb.length], ex = B[0] - A[0], ey = B[1] - A[1], inp = out;
    const inside = (p) => ex * (p[1] - A[1]) - ey * (p[0] - A[0]) >= 0;
    out = [];
    for (let j = 0; j < inp.length; j++) {
      const P = inp[j], Q = inp[(j + 1) % inp.length], pi = inside(P);
      if (pi) out.push(P);
      if (pi !== inside(Q)) {
        const dx = Q[0] - P[0], dy = Q[1] - P[1], t = ((A[0] - P[0]) * ey - (A[1] - P[1]) * ex) / (dx * ey - dy * ex);
        out.push([P[0] + t * dx, P[1] + t * dy]);
      }
    }
  }
  return out.length > 2 ? polyArea(out) : 0;
}
/** How far a thread of a given span may sag, and the curve for a slack of 0 (taut) to 1. */
export const maxSag = (d) => clamp(d * 0.38, 24, 190);
export function yarnGeo(a, b, sl = 0.45) {
  const max = maxSag(Math.hypot(b[0] - a[0], b[1] - a[1])), sag = sl * max, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  return { d: `M${a[0]},${a[1]} Q${mx},${my + sag} ${b[0]},${b[1]}`, mid: [mx, my + sag / 2], sag, max };
}
