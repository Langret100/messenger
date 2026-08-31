const fs=require('fs'),path=require('path');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const root=process.cwd();
const tests=fs.readdirSync(path.join(root,'tests'));
ok(!tests.some(n=>/^moa-.*-v\d+\.test\.js$/i.test(n)),'versioned MOA test filename remains');
ok(!fs.readdirSync(root).some(n=>/^MOA_AI_V\d+_CHANGES\.txt$/i.test(n)),'versioned MOA change filename remains');
const dir=path.join(root,'docs/apps-script'),decl=new Map();
for(const file of fs.readdirSync(dir).filter(n=>n.endsWith('.gs'))){
  const src=fs.readFileSync(path.join(dir,file),'utf8');
  for(const m of src.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)){
    const name=m[1],old=decl.get(name);ok(!old,`duplicate Apps Script function ${name}: ${old} / ${file}`);decl.set(name,file);
  }
}
console.log('MOA_PACKAGE_CONSISTENCY_OK');
