// @nestjs/* v12 ships ESM-only (uses `import.meta.url`); jest 29 runs CommonJS. This transformer compiles
// node_modules ESM to CJS with ts-jest and rewrites `import.meta.url` to a CJS equivalent. Remove once jest runs natively as ESM.
const tsJest = require('ts-jest');

const inner = (tsJest.default || tsJest).createTransformer({
  tsconfig: { allowJs: true, module: 'commonjs', esModuleInterop: true, target: 'ES2021' },
  diagnostics: false,
});

module.exports = {
  canInstrument: false,
  getCacheKey: (...a) => 'v1' + inner.getCacheKey(...a),
  process(src, filename, opts) {
    const code = src.replace(/import\.meta\.url/g, "require('url').pathToFileURL(__filename).href");
    return inner.process(code, filename, opts);
  },
};
