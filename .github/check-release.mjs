// Read-only release guard. Published package versions are immutable.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('A release candidate needs a stable numeric version.');
const tag=`refs/tags/v${version}`;
const git=args=>spawnSync('git',args,{encoding:'utf8',windowsHide:true});
const found=git(['show-ref','--verify','--quiet',tag]);
if(found.error)throw found.error;
if(found.status===1)console.log(`v${version} is not tagged yet; publish only after release validation.`);
else {
  if(found.status!==0)throw new Error('Cannot check release tag identity.');
  const diff=git(['diff','--exit-code',tag,'--','SKILL.md','package.json','LICENSE','agents','references','scripts']);
  if(diff.error||diff.status!==0)throw new Error(`Packaged content differs from published v${version}; increment the version instead of replacing that release.`);
  console.log(`Packaged content matches immutable v${version}.`);
}
