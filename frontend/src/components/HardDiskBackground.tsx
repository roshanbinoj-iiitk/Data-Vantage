import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  ContactShadows,
  RoundedBox,
} from "@react-three/drei";
import * as THREE from "three";

/* Reused HDD parts (kept intact to preserve look/behavior) */
function Platter() {
  const ref = useRef<THREE.Group>(null!);
  const grooveTexture = useMemo(() => {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const cx = size / 2;
    const cy = size / 2;
    ctx.fillStyle = "#c8941a";
    ctx.fillRect(0, 0, size, size);
    for (let r = 20; r < size / 2; r += 4) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle =
        r % 8 === 0 ? "rgba(180,130,30,0.35)" : "rgba(220,180,60,0.18)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }, []);

  return (
    <group ref={ref} position={[0, 0.1, 0]}>
      <mesh>
        <cylinderGeometry args={[2.8, 2.8, 0.05, 128]} />
        <meshPhysicalMaterial
          map={grooveTexture}
          color="#d4a830"
          metalness={0.95}
          roughness={0.08}
          clearcoat={1}
          clearcoatRoughness={0.05}
          reflectivity={1}
        />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <torusGeometry args={[0.55, 0.05, 16, 64]} />
        <meshStandardMaterial color="#aaa" metalness={0.9} roughness={0.2} />
      </mesh>
    </group>
  );
}

function SpindleHub() {
  return (
    <group position={[0, 0.1, 0]}>
      <mesh>
        <cylinderGeometry args={[0.5, 0.5, 0.18, 64]} />
        <meshStandardMaterial
          color="#b0b0b0"
          metalness={0.95}
          roughness={0.15}
        />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.06, 64]} />
        <meshStandardMaterial color="#999" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.04, 16]} />
        <meshStandardMaterial color="#666" metalness={0.8} roughness={0.3} />
      </mesh>
      {[0, 60, 120, 180, 240, 300].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const r = 0.38;
        return (
          <mesh key={i} position={[Math.cos(rad) * r, 0.14, Math.sin(rad) * r]}>
            <cylinderGeometry args={[0.035, 0.035, 0.06, 12]} />
            <meshStandardMaterial
              color="#555"
              metalness={0.7}
              roughness={0.4}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function RotatingAssembly() {
  const ref = useRef<THREE.Group>(null!);
  useFrame((_state, delta) => {
    ref.current.rotation.y -= delta * 6.0;
  });
  return (
    <group ref={ref} position={[0, 0, 0]}>
      <Platter />
      <SpindleHub />
    </group>
  );
}

function ActuatorArmShape() {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0.18);
    s.lineTo(-2.0, 0.06);
    s.lineTo(-2.4, 0.03);
    s.lineTo(-2.4, -0.03);
    s.lineTo(-2.0, -0.06);
    s.lineTo(0, -0.18);
    s.closePath();
    return s;
  }, []);

  const extrudeSettings = useMemo(
    () => ({
      depth: 0.08,
      bevelEnabled: true,
      bevelThickness: 0.01,
      bevelSize: 0.01,
      bevelSegments: 2,
    }),
    [],
  );

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
      <extrudeGeometry args={[shape, extrudeSettings]} />
      <meshStandardMaterial color="#b0b0b0" metalness={0.92} roughness={0.15} />
    </mesh>
  );
}

function VoiceCoilShape() {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0.22);
    s.lineTo(1.0, 0.35);
    s.lineTo(1.0, -0.35);
    s.lineTo(0, -0.22);
    s.closePath();
    return s;
  }, []);

  const extrudeSettings = useMemo(
    () => ({
      depth: 0.2,
      bevelEnabled: true,
      bevelThickness: 0.01,
      bevelSize: 0.01,
      bevelSegments: 2,
    }),
    [],
  );

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, -0.1]}>
      <extrudeGeometry args={[shape, extrudeSettings]} />
      <meshStandardMaterial color="#333" metalness={0.5} roughness={0.6} />
    </mesh>
  );
}

function ActuatorArm() {
  const armRef = useRef<THREE.Group>(null!);
  const pivotPos: [number, number, number] = [2.2, 0.35, 1.8];
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    armRef.current.rotation.y = Math.sin(t * 0.5) * 0.08 - 0.3;
  });
  return (
    <group position={pivotPos} ref={armRef}>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.28, 0.28, 0.35, 32]} />
        <meshStandardMaterial color="#888" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.2, 0.25, 0.06, 32]} />
        <meshStandardMaterial color="#999" metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.04, 12]} />
        <meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} />
      </mesh>

      <group position={[0, 0.18, 0]} rotation={[0, 0.35, 0]}>
        <ActuatorArmShape />
      </group>
      <group position={[0, 0.18, 0]} rotation={[0, 0.35, 0]}>
        <mesh position={[-2.5, 0, 0]} rotation={[0, 0, -0.04]}>
          <boxGeometry args={[0.6, 0.015, 0.06]} />
          <meshStandardMaterial
            color="#c8c8c8"
            metalness={0.95}
            roughness={0.1}
          />
        </mesh>
      </group>
      <group position={[0, 0.18, 0]} rotation={[0, 0.35, 0]}>
        <mesh position={[-2.82, -0.01, 0]}>
          <boxGeometry args={[0.12, 0.02, 0.08]} />
          <meshPhysicalMaterial
            color="#e8e8e8"
            metalness={0.95}
            roughness={0.05}
            clearcoat={1}
          />
        </mesh>
      </group>
      <group position={[0, 0.18, 0]} rotation={[0, 0.35, 0]}>
        <VoiceCoilShape />
      </group>
      <mesh position={[0.3, 0.12, 0.6]} rotation={[0.15, 0.35, 0]}>
        <boxGeometry args={[0.6, 0.01, 0.18]} />
        <meshStandardMaterial
          color="#e07020"
          metalness={0.3}
          roughness={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function Chassis() {
  return (
    <group>
      <RoundedBox
        args={[7.5, 0.35, 5.5]}
        radius={0.15}
        smoothness={4}
        position={[0, 0, 0]}
      >
        <meshPhysicalMaterial
          color="#8a8a8a"
          metalness={0.05}
          roughness={0.05}
          clearcoat={1}
          clearcoatRoughness={0.05}
          transmission={0.92}
          ior={1.45}
          transparent
          opacity={0.18}
        />
      </RoundedBox>
      <RoundedBox
        args={[7.6, 0.15, 5.6]}
        radius={0.12}
        smoothness={4}
        position={[0, 0.22, 0]}
      >
        <meshPhysicalMaterial
          color="#777"
          metalness={0.05}
          roughness={0.08}
          transmission={0.85}
          ior={1.45}
          transparent
          opacity={0.15}
        />
      </RoundedBox>
      <RoundedBox
        args={[7.5, 0.12, 5.5]}
        radius={0.12}
        smoothness={4}
        position={[0, -0.22, 0]}
      >
        <meshStandardMaterial color="#555" metalness={0.7} roughness={0.5} />
      </RoundedBox>
      {[
        [-3.2, 0.32, -2.3],
        [3.2, 0.32, -2.3],
        [-3.2, 0.32, 2.3],
        [3.2, 0.32, 2.3],
        [0, 0.32, -2.3],
        [0, 0.32, 2.3],
      ].map((pos, i) => (
        <group key={i} position={pos as [number, number, number]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 0.08, 16]} />
            <meshStandardMaterial
              color="#666"
              metalness={0.9}
              roughness={0.2}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.02, 6]} />
            <meshStandardMaterial
              color="#444"
              metalness={0.8}
              roughness={0.4}
            />
          </mesh>
        </group>
      ))}
      <mesh position={[-2.5, -0.1, -2.7]}>
        <boxGeometry args={[2.5, 0.15, 0.4]} />
        <meshStandardMaterial color="#2a6e2a" metalness={0.3} roughness={0.7} />
      </mesh>
      <mesh position={[-1.5, -0.1, -2.85]}>
        <boxGeometry args={[1.0, 0.12, 0.15]} />
        <meshStandardMaterial color="#222" metalness={0.5} roughness={0.6} />
      </mesh>
      <mesh position={[-3.0, -0.1, -2.85]}>
        <boxGeometry args={[0.8, 0.12, 0.15]} />
        <meshStandardMaterial color="#333" metalness={0.5} roughness={0.6} />
      </mesh>
    </group>
  );
}

function AirFilter() {
  return (
    <group position={[-2.8, 0.32, 1.5]}>
      <RoundedBox args={[1.2, 0.12, 0.8]} radius={0.04} smoothness={2}>
        <meshStandardMaterial color="#606060" metalness={0.6} roughness={0.5} />
      </RoundedBox>
      <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.8, 0.4]} />
        <meshStandardMaterial color="#505050" metalness={0.4} roughness={0.6} />
      </mesh>
    </group>
  );
}

function VoiceCoilMagnets() {
  return (
    <group position={[2.6, 0.25, 2.1]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <boxGeometry args={[1.6, 1.2, 0.08]} />
        <meshStandardMaterial color="#555" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.35]}>
        <boxGeometry args={[1.4, 1.0, 0.06]} />
        <meshStandardMaterial color="#666" metalness={0.85} roughness={0.3} />
      </mesh>
    </group>
  );
}

function ParkingRamp() {
  return (
    <mesh position={[-3.2, 0.3, 0]} rotation={[0, 0, 0.1]}>
      <boxGeometry args={[0.3, 0.15, 0.6]} />
      <meshStandardMaterial
        color="#d4d4d4"
        metalness={0.3}
        roughness={0.6}
        transparent
        opacity={0.8}
      />
    </mesh>
  );
}

function HardDiskModel() {
  return (
    <group rotation={[0.15, 0, 0]} position={[0, -0.5, 0]}>
      <Chassis />
      <RotatingAssembly />
      <ActuatorArm />
      <AirFilter />
      <VoiceCoilMagnets />
      <ParkingRamp />
    </group>
  );
}

export function HardDiskBackground() {
  return (
    <div style={{ width: "100%", height: "100%", background: "#1a1a2e" }}>
      <Canvas
        camera={{ position: [6, 7, 6], fov: 40 }}
        shadows
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
      >
        <ambientLight intensity={0.3} />
        <directionalLight
          position={[5, 10, 5]}
          intensity={1.5}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <directionalLight
          position={[-5, 5, -3]}
          intensity={0.5}
          color="#b0c4ff"
        />
        <pointLight position={[0, 6, 0]} intensity={0.8} color="#fff5e0" />
        <spotLight
          position={[-3, 8, 2]}
          angle={0.4}
          penumbra={0.5}
          intensity={1}
          color="#ffe0b0"
          castShadow
        />

        <HardDiskModel />

        <ContactShadows
          position={[0, -1.2, 0]}
          opacity={0.6}
          scale={15}
          blur={2.5}
          far={5}
        />
        <Environment preset="studio" />

        <OrbitControls
          enablePan={true}
          enableZoom={true}
          minDistance={5}
          maxDistance={20}
          autoRotate
          autoRotateSpeed={1.5}
          target={[0, 0, 0]}
        />
      </Canvas>
    </div>
  );
}
