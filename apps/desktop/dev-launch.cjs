const {spawn} = require('node:child_process');
const {build} = require('./dev-build.cjs');
async function launch() {
  const args=process.argv.slice(2);
  if(args.some(arg=>!/^--dev-profile=[A-Za-z0-9_-]{1,40}$/.test(arg)&&!['--demo','--live'].includes(arg)))throw Error('Use --demo, --live, or --dev-profile=name.');
  await build(__dirname);
  const env={...process.env};delete env.CAPY_API_KEY;delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(require('electron'),[__dirname,'--dev-launch',...args],{stdio:'inherit',env});
  child.on('error',()=>{console.error('Could not start Jetstream Dev. Run npm ci and retry.');process.exitCode=1;});
  child.on('exit',code=>{process.exitCode=code??1;});
}
launch().catch(()=>{console.error('Dev build failed. Fix the source or run npm ci, then retry. No app was launched.');process.exitCode=1;});
