const fs = require('node:fs/promises');
const path = require('node:path');
const esbuild = require('esbuild');

async function build(directory) {
  const entries = ['rich-entry.js', 'composer-entry.js'];
  const outputs = await Promise.all(entries.map(entry => esbuild.build({
    absWorkingDir:directory, entryPoints:[entry], bundle:true,
    outfile:path.join(directory,entry.replace('-entry.js','.bundle.js')),
    format:'iife', platform:'browser', target:'chrome144', minify:true,
    legalComments:'external', write:false, logLevel:'silent'
  })));
  const names = await fs.readdir(directory);
  await Promise.all(names.filter(name => /\.(js|cjs)$/.test(name) && !name.endsWith('.bundle.js')).map(async name => {
    const source = await fs.readFile(path.join(directory,name),'utf8');
    await esbuild.transform(source,{loader:'js',logLevel:'silent'});
  }));
  for (const output of outputs.flatMap(result => result.outputFiles)) {
    await fs.writeFile(output.path + '.dev-tmp', output.contents, {mode:0o600});
  }
  for (const output of outputs.flatMap(result => result.outputFiles)) await fs.rename(output.path + '.dev-tmp',output.path);
}
module.exports = {build};
