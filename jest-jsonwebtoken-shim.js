// @nestjs/jwt v12 (ESM) does `import jsonwebtoken from 'jsonwebtoken'`; under jest's CJS transform the default export must exist.
const jwt = require("./node_modules/jsonwebtoken/index.js");
module.exports = Object.assign(Object.create(jwt), jwt, { default: jwt });
