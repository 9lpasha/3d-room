import * as THREE from "three";

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uTerminal;
  uniform float uPower;
  varying vec2 vUv;

  void main() {
    vec3 terminal = texture2D(uTerminal, vUv).rgb;
    vec3 off = vec3(0.015, 0.016, 0.018);
    vec3 color = mix(off, terminal, uPower);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createCrtMaterial(texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTerminal: { value: texture },
      uTime: { value: 0 },
      uPower: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    toneMapped: false,
  });
}
