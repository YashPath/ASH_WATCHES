'use client';
import { Component, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls, useGLTF, Bounds, Center } from '@react-three/drei';
import { ProceduralWatch, type WatchColors } from './ProceduralWatch';

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function GlbModel({ url }: { url: string }) {
  const gltf = useGLTF(url);
  return <Bounds fit clip observe margin={1.3}><Center><primitive object={gltf.scene.clone()} /></Center></Bounds>;
}

/** Studio lighting built from lightformers, so no HDR file is fetched from a third-party CDN (CSP-friendly, works offline). */
function Studio() {
  return (
    <Environment resolution={256}>
      <Lightformer form="rect" intensity={3} position={[0, 4, 3]} scale={[8, 3, 1]} />
      <Lightformer form="rect" intensity={1.6} position={[-5, 1, 2]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} color="#ffe9b8" />
      <Lightformer form="rect" intensity={1.2} position={[5, -1, 2]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} color="#cfe0ff" />
      <Lightformer form="circle" intensity={2} position={[0, 0, -5]} scale={4} />
    </Environment>
  );
}

type Props = WatchColors & { glbUrl?: string | null; autoRotate?: boolean; controls?: boolean; className?: string; tilt?: number; live?: boolean; explodable?: boolean };

export function WatchCanvas({ glbUrl, autoRotate = true, controls = true, className, tilt = 0, live = true, explodable = false, ...colors }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className={className} aria-hidden />;
  const procedural = <group rotation={[tilt, 0, 0]}><ProceduralWatch {...colors} live={live} explodable={explodable} /></group>;
  return (
    <div className={className}>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 7.2], fov: 32 }} gl={{ antialias: true, powerPreference: 'high-performance' }} aria-label="Interactive 3D watch" role="img">
        <Suspense fallback={null}>
          <Studio />
          <ambientLight intensity={0.25} />
          <spotLight position={[4, 6, 6]} angle={0.35} penumbra={0.8} intensity={60} />
          {glbUrl ? <Boundary fallback={procedural}><GlbModel url={glbUrl} /></Boundary> : procedural}
          <ContactShadows position={[0, -3.1, 0]} opacity={0.5} scale={14} blur={2.6} far={5} />
        </Suspense>
        {controls && <OrbitControls enablePan={false} enableZoom={explodable} minDistance={explodable ? 4.9 : 4.5} maxDistance={11} zoomSpeed={0.7} autoRotate={autoRotate} autoRotateSpeed={1.1} maxPolarAngle={Math.PI * 0.62} minPolarAngle={Math.PI * 0.3} />}
      </Canvas>
    </div>
  );
}
