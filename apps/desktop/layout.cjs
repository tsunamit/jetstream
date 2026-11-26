const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const Layout=require('./layout-state.js');
class LayoutSettings {
  constructor(directory){this.file=path.join(directory,'layout.json');this.write=Promise.resolve();}
  async load(){
    try {
      if((await fs.stat(this.file)).size>1024)throw Error('Layout configuration is too large.');
      return {config:Layout.config(JSON.parse(await fs.readFile(this.file,'utf8')))};
    }catch(error){return {config:Layout.defaults(),error:error.code==='ENOENT'?'':'Saved layout is invalid; defaults are active. Your file was not changed.'};}
  }
  async save(value){
    const config=Layout.config(value);
    this.write=this.write.catch(()=>{}).then(async()=>{
      const temporary=this.file+'.'+randomUUID()+'.tmp';
      try {
        await fs.mkdir(path.dirname(this.file),{recursive:true});
        await fs.writeFile(temporary,JSON.stringify(config)+'\n',{mode:0o600,flag:'wx'});
        await fs.rename(temporary,this.file);
      }finally{await fs.unlink(temporary).catch(()=>{});}
    });
    await this.write;return config;
  }
}
module.exports={LayoutSettings};
