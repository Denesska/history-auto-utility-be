// sharp 0.35 ships a dual ESM/CJS package with a conditional "exports" map, but
// this project's tsconfig uses the classic/Node10 module resolution strategy,
// which does not read "exports" and instead falls back to package.json's
// top-level "types" field — landing on sharp's ESM declarations
// (dist/index.d.mts, `export default sharp`) even though `require('sharp')`
// at runtime returns the CJS build (dist/index.cjs, `module.exports = Sharp`,
// a callable function with no `.default`).
//
// This redirects the type resolution to the CJS-shaped declaration file the
// package still ships at lib/index.d.ts (`export = sharp`), matching what
// `import sharp = require('sharp')` actually gets at runtime. Only affects
// types; nothing here is emitted.
declare module 'sharp' {
    import sharp = require('sharp/lib/index');
    export = sharp;
}
