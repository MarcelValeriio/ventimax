const fs = require('fs');
const path = require('path');

let foundErrors = 0;

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    let p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts') || p.endsWith('.js')) {
      const content = fs.readFileSync(p, 'utf8');
      
      // Look for require('.../something.js')
      const requireRegex = /require\(['"](.*\.js)['"]\)/g;
      let match;
      while ((match = requireRegex.exec(content)) !== null) {
        console.log(`[HARDCODED JS REQUIRE] ${p}: require('${match[1]}')`);
        foundErrors++;
      }
    }
  });
}

['controllers', 'models', 'routes', 'services', 'middlewares', 'utils', 'src'].forEach(walk);

// Test index.ts
if (fs.existsSync('index.ts')) {
    const content = fs.readFileSync('index.ts', 'utf8');
    const requireRegex = /require\(['"](.*\.js)['"]\)/g;
    let match;
    while ((match = requireRegex.exec(content)) !== null) {
        console.log(`[HARDCODED JS REQUIRE] index.ts: require('${match[1]}')`);
        foundErrors++;
    }
}

if (foundErrors === 0) {
    console.log("No hardcoded .js requires found.");
}
