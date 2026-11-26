require('esbuild').buildSync({
  entryPoints:['rich-entry.js'], bundle:true, outfile:'rich.bundle.js', format:'iife',
  platform:'browser', target:'chrome144', minify:true, legalComments:'external'
});

require('esbuild').buildSync({entryPoints:['composer-entry.js'],bundle:true,outfile:'composer.bundle.js',format:'iife',platform:'browser',target:'chrome144',minify:true,legalComments:'external'});
