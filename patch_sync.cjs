const fs = require('fs');
let code = fs.readFileSync('src/lib/sync.ts', 'utf8');

code = code.replace(/const hasChanges = !local \|\|[\s\S]*?;/g, (match) => {
  if (match.includes('JSON.stringify')) return match;
  
  let entity = 's';
  if (match.includes('g.id_siswa')) entity = 'g';
  else if (match.includes('a.id_siswa')) entity = 'a';
  else if (match.includes('r.hari')) entity = 'r';
  else if (match.includes('p.hari')) entity = 'p';
  else if (match.includes('u.username')) entity = 'u';

  return `const hasChanges = !local || JSON.stringify(local) !== JSON.stringify(${entity});`;
});

fs.writeFileSync('src/lib/sync.ts', code);
