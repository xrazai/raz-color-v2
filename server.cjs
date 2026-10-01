'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {createOpenRouter,ApiError}=require('./openrouter.cjs');
const assets=new Set(['index.html','upscale.html','upscale.css','upscale.js','styles.css','inspection.css','batch.css','color-engine.js','sample.js','viewer.js','batch-model.js','zip-store.js','studio.js']);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));}
async function readBody(req){
  const limit=56*1024*1024;
  if(Number(req.headers['content-length'])>limit)throw new ApiError(413,'A imagem para IA deve ter até 40 MB.');
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>limit)throw new ApiError(413,'A imagem para IA deve ter até 40 MB.');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ApiError(400,'Solicitação inválida.');}
}
function createServer(options={}){
  const router=createOpenRouter(options);
  return http.createServer(async(req,res)=>{
    try{
      const host=req.headers.host||'';
      if(![`127.0.0.1:${req.socket.localPort}`,`localhost:${req.socket.localPort}`].includes(host))throw new ApiError(403,'Host não permitido.');
      const url=new URL(req.url,`http://${host}`),pathname=decodeURIComponent(url.pathname);
      if(pathname.startsWith('/api/')){
        if(req.headers.origin&&req.headers.origin!==`http://${host}`)throw new ApiError(403,'Origem não permitida.');
        if(req.headers['sec-fetch-site']==='cross-site')throw new ApiError(403,'Origem não permitida.');
        if(pathname==='/api/ai/models'&&req.method==='GET'){json(res,200,await router.models());return;}
        if(pathname==='/api/ai/pricing'&&req.method==='GET'){json(res,200,await router.pricing(url.searchParams.get('model'),url.searchParams.get('resolution')));return;}
        if(pathname==='/api/ai/upscale'&&req.method==='POST'){
          if(req.headers.origin!==`http://${host}`||req.headers['x-raz-request']!=='image-upscale')throw new ApiError(403,'Abra o estúdio pelo servidor local para processar imagens.');
          if(!req.headers['content-type']?.startsWith('application/json'))throw new ApiError(415,'Use JSON para enviar a imagem.');
          const controller=new AbortController();
          res.on('close',()=>{if(!res.writableEnded)controller.abort();});
          const body=await readBody(req);
          json(res,200,await router.upscale(body,controller.signal));return;
        }
        json(res,404,{error:'Rota não encontrada.'});return;
      }
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
      const asset=pathname==='/'?'index.html':pathname.slice(1);
      if(!assets.has(asset)){res.writeHead(404).end('Not found');return;}
      fs.readFile(path.join(__dirname,asset),(error,body)=>{
        if(error){res.writeHead(404).end('Not found');return;}
        res.writeHead(200,{'Content-Type':mime[path.extname(asset)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        res.end(req.method==='HEAD'?undefined:body);
      });
    }catch(error){if(!res.destroyed&&!res.headersSent)json(res,error instanceof ApiError?error.status:500,{error:error instanceof ApiError?error.message:'Não foi possível concluir a solicitação.'});}
  });
}
if(require.main===module){
  const port=Number(process.env.PORT)||4173;
  createServer().listen(port,'127.0.0.1',()=>console.log(`Raz / cores: http://127.0.0.1:${port}`));
}
module.exports={createServer};
