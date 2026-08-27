const fs = require('fs');
let code = fs.readFileSync('src/pages/Panduan.tsx', 'utf8');

code = code.replace(/s\.semester \|\| ''\n          \];/g, `s.semester || ''\n          ];\n          customCols.forEach(col => {\n            const normCol = col.toLowerCase().replace(/\\s+/g, '_');\n            row.push(s[normCol] || s[col] || '');\n          });`);

fs.writeFileSync('src/pages/Panduan.tsx', code);
