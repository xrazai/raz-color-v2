'use strict';

const API='https://openrouter.ai/api/v1';
const MAX_IMAGE=40*1024*1024;
class ApiError extends Error {
  constructor(status,message){super(message);this.status=status;}
}
const resolutions=p=>['2K','4K'].filter(value=>p?.resolution?.values?.includes(value));
const acceptsReference=p=>p?.input_references?.max>=1&&p.input_references.min<=1;

function inputImage(value){
  if(typeof value!=='string')throw new ApiError(400,'Envie uma imagem PNG preparada pelo estúdio.');
  if(value.length>Math.ceil(MAX_IMAGE/3)*4+64)throw new ApiError(413,'A imagem para IA deve ter até 40 MB.');
  const match=/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match)throw new ApiError(400,'Envie uma imagem PNG preparada pelo estúdio.');
  const bytes=Buffer.from(match[1],'base64');
  if(bytes.length>MAX_IMAGE)throw new ApiError(413,'A imagem para IA deve ter até 40 MB.');
  if(bytes.length<33||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.toString('ascii',12,16)!=='IHDR')throw new ApiError(400,'A imagem PNG é inválida.');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  if(!width||!height||width*height>24000000||width>16384||height>16384)throw new ApiError(400,'A imagem excede 24 megapixels ou 16.384 px por lado.');
  return {width,height};
}

function outputImage(result){
  const value=result?.data?.[0]?.b64_json;
  if(typeof value!=='string'||value.length>140*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw new ApiError(502,'O modelo não retornou uma imagem válida.');
  const bytes=Buffer.from(value,'base64');
  const type=bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
  if(!type)throw new ApiError(502,'O modelo retornou um formato não compatível. Use um modelo de imagens PNG, JPG ou WebP.');
  return `data:${type};base64,${value}`;
}

function createOpenRouter({apiKey=process.env.OPENROUTER_API_KEY||'',fetchImpl=fetch}={}){
  apiKey=apiKey.trim();
  let cache=null,expires=0,pending=null,busy=false;
  async function request(route,{body,signal}={}){
    const timeout=AbortSignal.timeout(body?300000:20000);
    try{
      const response=await fetchImpl(API+route,{
        method:body?'POST':'GET',
        headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','X-Title':'Raz cores'},
        ...(body?{body:JSON.stringify(body)}:{}),signal:signal?AbortSignal.any([signal,timeout]):timeout,
      });
      if(!response.ok){
        const messages={401:'A chave do OpenRouter foi recusada. Confira OPENROUTER_API_KEY e reinicie o servidor.',402:'Créditos insuficientes no OpenRouter.',403:'A chave não tem permissão para esse modelo.',429:'O OpenRouter está limitando as solicitações. Aguarde antes de tentar novamente.',400:'O provedor recusou a imagem ou os parâmetros. Tente outro modelo ou uma imagem menor.'};
        await response.body?.cancel();
        throw new ApiError(messages[response.status]?response.status:502,messages[response.status]||'O OpenRouter não conseguiu concluir a solicitação. Tente novamente mais tarde.');
      }
      let size=0;const chunks=[];
      for await(const chunk of response.body){size+=chunk.length;if(size>150*1024*1024)throw new ApiError(502,'A resposta do modelo excedeu o limite de tamanho.');chunks.push(chunk);}
      const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(result.error)throw new ApiError(502,'O modelo não conseguiu processar a imagem. Tente outro modelo.');
      return result;
    }catch(error){
      if(error instanceof ApiError)throw error;
      if(timeout.aborted)throw new ApiError(504,'O OpenRouter demorou demais. A solicitação não será repetida automaticamente.');
      if(signal?.aborted)throw new ApiError(499,'Processamento interrompido.');
      throw new ApiError(502,'Não foi possível comunicar com o OpenRouter. Verifique a conexão e tente novamente.');
    }
  }
  async function models(){
    if(!apiKey)return {configured:false,models:[]};
    if(cache&&Date.now()<expires)return {configured:true,models:cache};
    if(!pending)pending=request('/images/models').then(data=>{
      if(!Array.isArray(data.data))throw new ApiError(502,'O catálogo do OpenRouter está indisponível.');
      cache=data.data.filter(m=>m.architecture?.input_modalities?.includes('image')&&m.architecture?.output_modalities?.includes('image')&&acceptsReference(m.supported_parameters)&&resolutions(m.supported_parameters).length)
        .map(m=>({id:m.id,name:m.name||m.id,resolutions:resolutions(m.supported_parameters)})).sort((a,b)=>a.name.localeCompare(b.name));
      expires=Date.now()+300000;return {configured:true,models:cache};
    }).finally(()=>{pending=null;});
    return pending;
  }
  async function upscale(data,signal){
    if(!apiKey)throw new ApiError(503,'Configure OPENROUTER_API_KEY e reinicie o servidor local.');
    if(busy)throw new ApiError(409,'Já existe uma imagem sendo processada. Aguarde a conclusão.');
    if(!data||!['2K','4K'].includes(data.resolution)||typeof data.model!=='string')throw new ApiError(400,'Escolha um modelo e a resolução 2K ou 4K.');
    const {width,height}=inputImage(data.image);
    busy=true;
    try{
      const catalog=await models();
      if(!catalog.models.some(m=>m.id===data.model&&m.resolutions.includes(data.resolution)))throw new ApiError(400,'Esse modelo não suporta imagem de referência e a resolução escolhida. Atualize a lista.');
      const details=await request(`/images/models/${data.model.split('/').map(encodeURIComponent).join('/')}/endpoints`,{signal});
      const endpoint=details.endpoints?.find(e=>acceptsReference(e.supported_parameters)&&resolutions(e.supported_parameters).includes(data.resolution));
      if(!endpoint)throw new ApiError(400,'Nenhum provedor deste modelo aceita imagem de referência nessa resolução. Escolha outro modelo.');
      const ratios=endpoint.supported_parameters.aspect_ratio?.values||[];
      const supportedRatios=ratios.filter(r=>/^\d+(\.\d+)?:\d+(\.\d+)?$/.test(r));
      const distance=r=>{const [w,h]=r.split(':').map(Number);return Math.abs(Math.log((w/h)/(width/height)));};
      const aspect=ratios.includes('auto')?'auto':supportedRatios.sort((a,b)=>distance(a)-distance(b))[0];
      const body={model:data.model,resolution:data.resolution,
        prompt:'Restore and upscale the supplied image. Preserve its composition, subject, textures, fine patterns, colors, lighting and proportions as faithfully as possible. Improve clarity conservatively. Do not redesign, stylize, recolor, add objects, text or new patterns. Return only the enhanced image.',
        input_references:[{type:'image_url',image_url:{url:data.image}}],
        ...(aspect?{aspect_ratio:aspect}:{}),
        ...(endpoint.provider_tag?{provider:{only:[endpoint.provider_tag],allow_fallbacks:false}}:{provider:{allow_fallbacks:false}}),
      };
      const result=await request('/images',{body,signal});
      return {image:outputImage(result),model:data.model,resolution:data.resolution,cost:typeof result.usage?.cost==='number'&&Number.isFinite(result.usage.cost)?result.usage.cost:null};
    }finally{busy=false;}
  }
  return {models,upscale};
}
module.exports={createOpenRouter,ApiError};
