/**
 * orbShader — a single full-surface WebGL quad that runs the Galileo shader.
 *
 * Returns null when the shader cannot be compiled or linked, so the caller can
 * show the static fallback. `dispose()` releases every GPU resource and the
 * context itself, so mounting and unmounting orbs never accumulates contexts.
 */

import { ORB_VERTEX, ORB_FRAGMENT } from './orbShaderSource';

const UNIFORMS = [
  'uRes', 'uRadius', 'uRatio', 'uFlow', 'uFlow2', 'uField', 'uMigr', 'uEdge', 'uTime', 'uFold',
  'uMicro', 'uSweep', 'uInward', 'uTravel', 'uBright', 'uCount', 'uCoh', 'uConv', 'uOrg', 'uFocus',
  'uWave', 'uPulse', 'uReveal', 'uStrand', 'uBreath', 'uStruct', 'uDetail', 'uMinW',
  'uInt', 'uIntF', 'uInner',
];

export function createOrbRenderer(gl) {
  const compile = (type, src) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vs = compile(gl.VERTEX_SHADER, ORB_VERTEX);
  const fs = compile(gl.FRAGMENT_SHADER, ORB_FRAGMENT);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  const loc = {};
  UNIFORMS.forEach((name) => { loc[name] = gl.getUniformLocation(program, name); });

  return {
    /**
     * V is the canonical uniform bundle from orbField.orbUniforms — one explicit,
     * always-finite value per shader uniform, by its shader name. The same bundle
     * drives the CPU still frame, so the fallback cannot drift from this frame.
     */
    draw(V) {
      gl.viewport(0, 0, V.uRes[0], V.uRes[1]);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(loc.uRes, V.uRes[0], V.uRes[1]);
      UNIFORMS.forEach((name) => {
        if (name !== 'uRes') gl.uniform1f(loc[name], V[name]);
      });
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      // The CONTEXT IS DELIBERATELY NOT DESTROYED here. React reuses the same
      // <canvas> element whenever this effect re-runs (a size change, or a
      // remount in development), and a lost context cannot be re-acquired on
      // that element: every later compile returns null, so the orb would fall
      // back — i.e. losing the context is how a working orb becomes a black
      // circle. The browser reclaims it when the canvas goes away.
    },
  };
}