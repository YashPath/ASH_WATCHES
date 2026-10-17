'use client';
import { useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

export type WatchStyle = 'dress' | 'diver' | 'chrono' | 'skeleton' | 'field';
export type WatchColors = { dial: string; caseColor: string; strap: string; metal?: number; watchStyle?: WatchStyle };


const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

/** Canvas texture helpers keep the model asset-free (no downloads, CSP-friendly). */
function dialTexture(base: string, style: WatchStyle): THREE.CanvasTexture {
  const size = 1024, c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!;
  const cream = 'rgba(239,230,200,0.9)', creamSoft = 'rgba(239,230,200,0.6)';
  if (style === 'skeleton') {
    // open-worked dial: only a printed ring is opaque, the centre stays transparent so the movement shows through
    g.clearRect(0, 0, size, size);
    g.fillStyle = base; g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); g.arc(size / 2, size / 2, size * 0.40, 0, Math.PI * 2, true); g.fill('evenodd');
  } else {
    g.fillStyle = base; g.fillRect(0, 0, size, size);
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * Math.PI * 2, shade = (i % 2 ? 255 : 0);
      g.strokeStyle = `rgba(${shade},${shade},${shade},${style === 'field' ? 0.0 : 0.045})`; g.lineWidth = 3;
      g.beginPath(); g.moveTo(size / 2, size / 2); g.lineTo(size / 2 + Math.cos(a) * size, size / 2 + Math.sin(a) * size); g.stroke();
    }
    const grad = g.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.55);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)'); grad.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = grad; g.fillRect(0, 0, size, size);
  }
  g.save(); g.translate(size / 2, size / 2);
  for (let i = 0; i < 60; i++) { g.rotate(Math.PI / 30); g.fillStyle = 'rgba(239,230,200,0.75)'; g.fillRect(-1.5, -size * 0.465, 3, i % 5 === 0 ? 0 : 20); }
  g.restore();
  g.textAlign = 'center';
  if (style === 'chrono') {
    // three sub-dials: running seconds (left), 30-minute counter (right), 12-hour counter (bottom)
    for (const [cx, cy] of [[0.30, 0.52], [0.70, 0.52], [0.50, 0.72]] as const) {
      g.strokeStyle = 'rgba(239,230,200,0.55)'; g.lineWidth = 4; g.beginPath(); g.arc(size * cx, size * cy, size * 0.095, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fill();
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.beginPath(); g.moveTo(size * cx + Math.cos(a) * size * 0.075, size * cy + Math.sin(a) * size * 0.075); g.lineTo(size * cx + Math.cos(a) * size * 0.09, size * cy + Math.sin(a) * size * 0.09); g.stroke(); }
      g.strokeStyle = '#c3402f'; g.lineWidth = 5; g.beginPath(); g.moveTo(size * cx, size * cy); g.lineTo(size * cx + size * 0.05, size * cy - size * 0.05); g.stroke();
    }
    g.fillStyle = cream; g.font = '600 48px Georgia, serif'; g.fillText('ASH_', size / 2, size * 0.30);
    g.font = '500 22px system-ui, sans-serif'; g.fillStyle = creamSoft; g.fillText('CHRONOGRAPH', size / 2, size * 0.36);
  } else if (style === 'field') {
    g.fillStyle = cream; g.font = '700 120px Georgia, serif';
    g.fillText('12', size / 2, size * 0.30); g.fillText('6', size / 2, size * 0.78); g.fillText('3', size * 0.78, size * 0.545); g.fillText('9', size * 0.22, size * 0.545);
    g.font = '600 38px Georgia, serif'; g.fillText('ASH_', size / 2, size * 0.42);
    g.font = '500 24px system-ui, sans-serif'; g.fillStyle = creamSoft; g.fillText('FIELD · 200M', size / 2, size * 0.66);
  } else if (style === 'diver') {
    g.fillStyle = cream; g.font = '600 54px Georgia, serif'; g.fillText('ASH_', size / 2, size * 0.34);
    g.font = '600 28px system-ui, sans-serif'; g.fillStyle = creamSoft; g.fillText('AUTOMATIC', size / 2, size * 0.66);
    g.fillStyle = '#e8d49a'; g.fillText('DIVER 300M / 1000FT', size / 2, size * 0.71);
  } else if (style === 'skeleton') {
    g.fillStyle = cream; g.font = '600 40px Georgia, serif'; g.fillText('ASH_', size / 2, size * 0.17);
    g.font = '500 20px system-ui, sans-serif'; g.fillStyle = creamSoft; g.fillText('SKELETON · HAND-WOUND', size / 2, size * 0.86);
  } else {
    g.fillStyle = cream; g.font = '600 54px Georgia, serif'; g.fillText('ASH_', size / 2, size * 0.34);
    g.font = '500 24px system-ui, sans-serif'; g.fillStyle = creamSoft;
    g.fillText('AUTOMATIC', size / 2, size * 0.69); g.fillText('WATER RESISTANT', size / 2, size * 0.73);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; return t;
}

function leatherTexture(base: string): THREE.CanvasTexture {
  const w = 256, h = 512, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.setLineDash([10, 8]); g.strokeStyle = 'rgba(235,220,190,0.75)'; g.lineWidth = 3;
  for (const x of [26, w - 26]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

function gearShape(teeth: number, outer: number, inner: number, hole: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2, step = (Math.PI * 2) / teeth;
    const pts: Array<[number, number]> = [[a0, inner], [a0 + step * 0.2, outer], [a0 + step * 0.5, outer], [a0 + step * 0.7, inner]];
    pts.forEach(([a, r], k) => { const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i === 0 && k === 0) s.moveTo(x, y); else s.lineTo(x, y); });
  }
  s.closePath();
  const h = new THREE.Path(); h.absarc(0, 0, hole, 0, Math.PI * 2, true); s.holes.push(h);
  // spokes (cut-outs) make the wheel look like a real skeletonised gear
  for (let i = 0; i < 4; i++) { const p = new THREE.Path(); const a = (i / 4) * Math.PI * 2 + Math.PI / 4, r = (inner + hole) / 2; p.absarc(Math.cos(a) * r, Math.sin(a) * r, (inner - hole) * 0.28, 0, Math.PI * 2, true); s.holes.push(p); }
  return s;
}

function Gear({ x, y, teeth, outer, speed, color }: { x: number; y: number; teeth: number; outer: number; speed: number; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new THREE.ExtrudeGeometry(gearShape(teeth, outer, outer * 0.82, outer * 0.14), { depth: 0.05, bevelEnabled: false }), [teeth, outer]);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.z += dt * speed; });
  return <mesh ref={ref} geometry={geo} position={[x, y, 0]}><meshStandardMaterial color={color} metalness={1} roughness={0.28} /></mesh>;
}

type PartRef = { ref: React.RefObject<THREE.Group | null>; z: number; y?: number; base?: number };

export function ProceduralWatch({ dial, caseColor, strap, metal = 0.95, watchStyle = 'dress', live = true, explodable = false, showLabels = true }: WatchColors & { live?: boolean; explodable?: boolean; showLabels?: boolean }) {
  const camera = useThree(s => s.camera);
  const hour = useRef<THREE.Group>(null), minute = useRef<THREE.Group>(null), second = useRef<THREE.Group>(null);
  const crystal = useRef<THREE.Group>(null), bezel = useRef<THREE.Group>(null), hands = useRef<THREE.Group>(null), dialG = useRef<THREE.Group>(null);
  const movement = useRef<THREE.Group>(null), caseG = useRef<THREE.Group>(null), back = useRef<THREE.Group>(null), strapTop = useRef<THREE.Group>(null), strapBottom = useRef<THREE.Group>(null);
  const [labelsOn, setLabelsOn] = useState(false);
  const factor = useRef(0);
  const root = useRef<THREE.Group>(null);

  const parts: PartRef[] = [
    { ref: crystal, z: 2.1, base: 0.26 }, { ref: bezel, z: 1.55, base: 0.2 }, { ref: hands, z: 1.0, base: 0.22 }, { ref: dialG, z: 0.45 },
    { ref: movement, z: -0.3 }, { ref: caseG, z: -0.95 }, { ref: back, z: -1.7 },
    { ref: strapTop, z: -0.5, y: 0.45 }, { ref: strapBottom, z: -0.5, y: -0.45 }
  ];

  useFrame((_, dt) => {
    const now = new Date();
    if (live) {
      const s = now.getSeconds() + now.getMilliseconds() / 1000, m = now.getMinutes() + s / 60, h = (now.getHours() % 12) + m / 60;
      if (second.current) second.current.rotation.z = -(s / 60) * Math.PI * 2;
      if (minute.current) minute.current.rotation.z = -(m / 60) * Math.PI * 2;
      if (hour.current) hour.current.rotation.z = -(h / 12) * Math.PI * 2;
    }
    // Explosion is driven by how close the camera is: zoom in => layers separate, zoom out => they reassemble.
    const dist = camera.position.length();
    const target = explodable ? smooth((6.9 - dist) / 2.0) : 0;
    factor.current += (target - factor.current) * Math.min(1, dt * 5);
    const f = factor.current;
    for (const p of parts) if (p.ref.current) { p.ref.current.position.z = (p.base ?? 0) + p.z * f; p.ref.current.position.y = (p.y ?? 0) * f; }
    if (root.current) { root.current.rotation.y = f * 0.7; root.current.rotation.x = -f * 0.22; root.current.scale.setScalar(1 - f * 0.12); }
    const on = f > 0.6;
    if (on !== labelsOn) setLabelsOn(on);
  });

  const dialTex = useMemo(() => dialTexture(dial, watchStyle), [dial, watchStyle]);
  const isDiver = watchStyle === 'diver', isChrono = watchStyle === 'chrono', isSkeleton = watchStyle === 'skeleton', isField = watchStyle === 'field';
  const hw = isDiver ? 1.5 : isField ? 1.25 : 1; // hand width multiplier
  const strapTex = useMemo(() => leatherTexture(strap), [strap]);
  const caseMat = { color: caseColor, metalness: metal, roughness: 0.2 } as const;
  const bezelMat = isDiver || isChrono ? { color: isDiver ? '#12161b' : '#1b1f25', metalness: 0.35, roughness: 0.28 } : { ...caseMat, roughness: 0.14 };

  const caseProfile = useMemo(() => new THREE.LatheGeometry((isDiver
    ? [[0.0, -0.26], [1.34, -0.26], [1.42, -0.18], [1.44, 0.0], [1.42, 0.14], [1.3, 0.18], [1.2, 0.18], [1.2, -0.1], [0, -0.1]]
    : [[0.0, -0.2], [1.28, -0.2], [1.34, -0.14], [1.36, 0.0], [1.34, 0.12], [1.24, 0.16], [1.2, 0.16], [1.2, -0.1], [0, -0.1]]).map(([x, y]) => new THREE.Vector2(x, y)), 128), [isDiver]);
  const bezelGeo = useMemo(() => new THREE.LatheGeometry([[1.17, 0.0], [1.22, 0.02], [1.3, 0.04], [1.34, 0.0], [1.32, -0.06], [1.17, -0.06]].map(([x, y]) => new THREE.Vector2(x, y)), 128), []);
  const strapGeo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1.3, 0), new THREE.Vector3(0, 1.95, -0.1), new THREE.Vector3(0, 2.7, -0.5), new THREE.Vector3(0, 3.2, -1.25)]);
    const g = new THREE.TubeGeometry(curve, 40, 0.46, 8, false); g.scale(1, 1, 0.18); return g;
  }, []);

  const Label = ({ children, y = 0, x = 1.9 }: { children: string; y?: number; x?: number }) => showLabels && labelsOn ? (
    <Html position={[x, y, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <span style={{ whiteSpace: 'nowrap', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#ecd9a3', background: 'rgba(5,17,12,0.75)', border: '1px solid rgba(217,189,114,0.4)', padding: '3px 10px', borderRadius: 999 }}>{children}</span>
    </Html>
  ) : null;

  return (
    <group ref={root}>
      {/* strap halves (leather with stitching) */}
      {[{ r: strapTop, flip: 0 }, { r: strapBottom, flip: Math.PI }].map((s, i) => (
        <group key={i} ref={s.r}>
          <mesh geometry={strapGeo} rotation={[0, 0, s.flip]}><meshStandardMaterial map={strapTex} roughness={0.78} metalness={0.02} /></mesh>
        </group>
      ))}
      {/* case back with exhibition ring */}
      <group ref={back}>
        <mesh position={[0, 0, -0.17]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[1.18, 1.18, 0.05, 96]} /><meshStandardMaterial {...caseMat} roughness={0.35} /></mesh>
        <mesh position={[0, 0, -0.2]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.85, 0.85, 0.02, 64]} /><meshPhysicalMaterial color="#3a4a52" metalness={0.2} roughness={0.05} transmission={0.4} /></mesh>
        <Label y={-0.1} x={-1.9}>Case back</Label>
      </group>
      {/* case body, lugs, crown */}
      <group ref={caseG}>
        <mesh geometry={caseProfile} rotation={[Math.PI / 2, 0, 0]}><meshStandardMaterial {...caseMat} side={THREE.DoubleSide} /></mesh>
        {[-0.66, 0.66].flatMap(x => [-1, 1].map(y => <mesh key={`${x}${y}`} position={[x * 0.82, y * 1.3, -0.02]} rotation={[y * 0.18, 0, 0]}><boxGeometry args={[0.13, 0.5, 0.26]} /><meshStandardMaterial {...caseMat} /></mesh>))}
        <mesh position={[1.44, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.13, 0.13, 0.22, 36]} /><meshStandardMaterial {...caseMat} /></mesh>
        <mesh position={[1.38, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.15, 0.15, 0.05, 36]} /><meshStandardMaterial color="#d9bd72" metalness={1} roughness={0.2} /></mesh>
        {isDiver && <mesh position={[1.4, 0, 0.0]}><boxGeometry args={[0.28, 0.5, 0.2]} /><meshStandardMaterial {...caseMat} /></mesh>}
        {isChrono && [-0.5, 0.5].map(y => <mesh key={y} position={[1.38, y, 0]} rotation={[0, 0, Math.PI / 2 + y * 0.35]}><cylinderGeometry args={[0.07, 0.07, 0.26, 20]} /><meshStandardMaterial {...caseMat} /></mesh>)}
        <Label y={-0.9} x={2.1}>Case &amp; crown</Label>
      </group>
      {/* movement: skeletonised gear train + balance + rotor */}
      <group ref={movement}>
        <mesh position={[0, 0, -0.04]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[1.0, 1.0, 0.04, 64]} /><meshStandardMaterial color="#3a3f45" metalness={0.8} roughness={0.4} /></mesh>
        <group position={[0, 0, 0.0]}>
          <Gear x={-0.35} y={0.25} teeth={26} outer={0.42} speed={0.5} color="#d9bd72" />
          <Gear x={0.3} y={0.4} teeth={18} outer={0.3} speed={-0.72} color="#c9ccd1" />
          <Gear x={0.38} y={-0.28} teeth={30} outer={0.46} speed={0.43} color="#d9bd72" />
          <Gear x={-0.4} y={-0.5} teeth={14} outer={0.24} speed={-0.9} color="#c3402f" />
          <mesh position={[0.0, -0.05, 0.1]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.2, 0.025, 12, 48]} /><meshStandardMaterial color="#d9bd72" metalness={1} roughness={0.25} /></mesh>
        </group>
        <Label y={0.3} x={-2.0}>Movement</Label>
      </group>
      {/* dial with textured sunburst, indices */}
      <group ref={dialG}>
        <mesh position={[0, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[1.18, 1.18, 0.03, 96]} /><meshStandardMaterial map={dialTex} roughness={isField ? 0.8 : 0.42} metalness={isField ? 0.05 : 0.4} transparent={isSkeleton} alphaTest={isSkeleton ? 0.5 : 0} side={isSkeleton ? THREE.DoubleSide : THREE.FrontSide} /></mesh>
        {!isField && Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2, long = i % 3 === 0; const r = isSkeleton ? 1.08 : 0.9;
          if (isDiver) return i === 0
            ? <mesh key={i} position={[0, r, 0.17]}><coneGeometry args={[0.13, 0.22, 3]} /><meshStandardMaterial color="#efe6c8" emissive="#cfe9c0" emissiveIntensity={0.45} /></mesh>
            : <mesh key={i} position={[Math.sin(a) * r, Math.cos(a) * r, 0.17]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[long ? 0.095 : 0.07, long ? 0.095 : 0.07, 0.025, 24]} /><meshStandardMaterial color="#efe6c8" emissive="#cfe9c0" emissiveIntensity={0.45} /></mesh>;
          if (isChrono && i % 3 !== 0) return <mesh key={i} position={[Math.sin(a) * r, Math.cos(a) * r, 0.17]} rotation={[0, 0, -a]}><boxGeometry args={[0.035, 0.12, 0.02]} /><meshStandardMaterial color="#efe6c8" metalness={0.7} roughness={0.3} /></mesh>;
          if (isChrono) return null;
          return <mesh key={i} position={[Math.sin(a) * r, Math.cos(a) * r, 0.17]} rotation={[0, 0, -a]}><boxGeometry args={[long ? 0.085 : 0.05, long ? 0.22 : 0.13, 0.025]} /><meshStandardMaterial color="#efe6c8" emissive="#efe6c8" emissiveIntensity={0.15} metalness={0.7} roughness={0.3} /></mesh>; })}
        <Label y={0.7} x={2.0}>Dial</Label>
      </group>
      {/* hands */}
      <group ref={hands} position={[0, 0, 0.22]}>
        <group ref={hour}><mesh position={[0, 0.3, 0]}><boxGeometry args={[0.1 * hw, 0.62, 0.025]} /><meshStandardMaterial color="#f1eadb" metalness={0.85} roughness={0.22} /></mesh></group>
        <group ref={minute} position={[0, 0, 0.03]}><mesh position={[0, 0.46, 0]}><boxGeometry args={[0.07 * hw, 0.94, 0.02]} /><meshStandardMaterial color="#f1eadb" metalness={0.85} roughness={0.22} /></mesh></group>
        <group ref={second} position={[0, 0, 0.06]}>
          <mesh position={[0, 0.4, 0]}><boxGeometry args={[0.018, 1.0, 0.012]} /><meshStandardMaterial color="#c3402f" metalness={0.5} roughness={0.35} /></mesh>
          <mesh position={[0, -0.18, 0]}><boxGeometry args={[0.032, 0.3, 0.012]} /><meshStandardMaterial color="#c3402f" /></mesh>
        </group>
        <mesh position={[0, 0, 0.08]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.075, 0.075, 0.05, 24]} /><meshStandardMaterial color="#d9bd72" metalness={1} roughness={0.2} /></mesh>
        <Label y={-0.5} x={2.0}>Hands</Label>
      </group>
      {/* bezel */}
      <group ref={bezel} position={[0, 0, 0.2]}>
        <mesh geometry={bezelGeo} rotation={[Math.PI / 2, 0, 0]}><meshStandardMaterial {...bezelMat} side={THREE.DoubleSide} /></mesh>
        {isDiver && Array.from({ length: 60 }, (_, i) => { const a = (i / 60) * Math.PI * 2, major = i % 5 === 0; return <mesh key={i} position={[Math.sin(a) * 1.265, Math.cos(a) * 1.265, 0.05]} rotation={[0, 0, -a]}><boxGeometry args={[major ? 0.05 : 0.025, major ? 0.1 : 0.06, 0.03]} /><meshStandardMaterial color={major ? '#efe6c8' : '#9aa0a6'} metalness={0.6} roughness={0.35} /></mesh>; })}
        {isDiver && <mesh position={[0, 1.265, 0.06]}><cylinderGeometry args={[0.045, 0.045, 0.03, 16]} /><meshStandardMaterial color="#efe6c8" emissive="#cfe9c0" emissiveIntensity={0.6} /></mesh>}
        <Label y={1.1} x={-1.6}>Bezel</Label>
      </group>
      {/* sapphire crystal */}
      <group ref={crystal} position={[0, 0, 0.26]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[1.18, 1.18, 0.02, 96]} /><meshPhysicalMaterial color="#ffffff" transparent opacity={0.1} roughness={0} metalness={0} clearcoat={1} ior={1.76} /></mesh>
        <Label y={1.25} x={1.6}>Sapphire crystal</Label>
      </group>
    </group>
  );
}
