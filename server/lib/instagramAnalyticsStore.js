const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=()=>process.env.INSTAGRAM_ANALYTICS_DIR || path.join(__dirname,'../../data/instagram-analytics');
function file(name){if(!/^[a-z0-9-]+$/.test(name))throw Error('Invalid analytics file');return path.join(root(),name+'.json');}
function read(name,fallback){try{return JSON.parse(fs.readFileSync(file(name),'utf8'));}catch(e){if(e.code==='ENOENT')return structuredClone(fallback);throw new Error('분석 저장 파일을 읽지 못했습니다. 기존 자료를 초기화하지 않았습니다.');}}
function write(name,data){fs.mkdirSync(root(),{recursive:true});const p=file(name),tmp=p+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2),{mode:0o600});fs.renameSync(tmp,p);return data;}
function transaction(name,mutate,fallback={}){fs.mkdirSync(root(),{recursive:true});const lock=file(name)+'.lock';let fd;try{fd=fs.openSync(lock,'wx');}catch(e){if(e.code==='EEXIST')throw Object.assign(new Error('다른 분석 변경을 저장 중입니다. 잠시 후 다시 시도해주세요.'),{status:409});throw e;}try{const data=read(name,fallback),result=mutate(data);write(name,data);return result;}finally{fs.closeSync(fd);fs.unlinkSync(lock);}}
module.exports={read,write,transaction};

