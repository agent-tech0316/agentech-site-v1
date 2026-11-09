import {cpSync,existsSync,mkdirSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
const destination=resolve(process.argv[2]);
const staged=new Map();
function stage(name,from){
  const require=createRequire(join(from,'package.json'));
  // Type-only packages have no executable entry point. Locate their package
  // directory without asking Node to execute/resolve an unavailable main file.
  let root=(require.resolve.paths(name)??[]).map(base=>join(base,name)).find(base=>existsSync(join(base,'package.json')));
  if(!root)root=dirname(require.resolve(name));
  while(!existsSync(join(root,'package.json'))||JSON.parse(readFileSync(join(root,'package.json'))).name!==name){
    const parent=dirname(root);if(parent===root)throw Error('Cannot resolve package '+name);root=parent;
  }
  root=realpathSync(root);
  const pkg=JSON.parse(readFileSync(join(root,'package.json')));
  if(staged.has(name)){if(staged.get(name)!==pkg.version)throw Error('Conflicting bundled Node dependency '+name);return;}
  staged.set(name,pkg.version);
  const target=join(destination,'node_modules',name);mkdirSync(dirname(target),{recursive:true});
  cpSync(root,target,{recursive:true,filter:path=>!path.slice(root.length).split(/[\\/]/).includes('node_modules')});
  for(const dependency of Object.keys(pkg.dependencies??{}))stage(dependency,root);
}
stage('obs-websocket-js',process.cwd());
writeFileSync(join(destination,'node-dependencies.json'),JSON.stringify(Object.fromEntries(staged),null,2)+'\n');
console.log(JSON.stringify({nodePackages:staged.size}));
