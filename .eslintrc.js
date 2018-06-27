module.exports = {
  // Felix styles
  // https://github.com/felixge/node-style-guide
  "extends": "node-style-guide",

  "parserOptions": {
    "ecmaVersion": 8,
    "sourceType": "module"
  },

  "rules": {
    "max-len": ["warn", 180],
    //"no-unused-vars": "off",

    // changed to warning from felix
    "max-depth": ["warn", 3],

    // already handled in the unpublished git updates of node-style-guide
    // but only 1.0.0 is published to npm
    "space-after-keywords": "off",
    "keyword-spacing": [2, { "before": true, "after": true }],

    // relax this rule about statements in a function
    "max-statements": "off",

    // specify allowed ignored args that begin with underscore
    "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],

    // common express.Router usage
    "new-cap": ["warn", { "capIsNewExceptions": [ "Router" ] }]
  }

};
