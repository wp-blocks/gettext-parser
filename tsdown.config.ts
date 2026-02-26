import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: 'src/index.ts',
    outDir: 'lib',
    target: "node18",
    format: 'esm',
    clean: true,
    unbundle: true,
    dts: true,
    minify: true,
    shims: true,
  },
  {
    entry: 'src/index.ts',
    outDir: 'lib',
    target: "node18",
    format: 'cjs',
    clean: false, // Do not clean lib again
    unbundle: false, // Bundle CJS into a single file
    dts: true,
    minify: true,
    shims: true,
  }
])
