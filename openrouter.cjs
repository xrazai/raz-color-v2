'use strict';

const API='https://openrouter.ai/api/v1';
const MAX_IMAGE=40*1024*1024;
class ApiError extends Error {
  constructor(status,message){super(message);this.status=status;}
}
const resolutions=p=>['2K','4K'].filter(value=>p?.resolution?.values?.includes(value));
const acceptsReference=p=>p?.input_references?.max>=1&&p.input_references.min<=1;
const acceptsPng=p=>p?.output_format?.values?.includes('png');
const compatibleEndpoint=e=>Boolean(e.provider_tag)&&acceptsReference(e.supported_parameters)&&acceptsPng(e.supported_parameters);
const endpointPath=model=>`/images/models/${model.split('/').map(encodeURIComponent).join('/')}/endpoints`;

function estimatePrice(pricing,resolution){
  const relevant=pricing.filter(p=>['input_image','input_reference','output_image'].includes(p.billable));
  if(!relevant.some(p=>p.billable==='output_image'))return {kind:'unknown'};
  if(relevant.some(p=>p.unit!=='image'))return {kind:'variable'};
  const inputs=relevant.filter(p=>p.billable!=='output_image');
  if(inputs.some(p=>p.variant))return {kind:'unknown'};
  const output=relevant.filter(p=>p.billable==='output_image');
  const tier=resolution.toLowerCase();
  let candidates=output.filter(p=>p.variant?.toLowerCase()===tier||p.variant?.toLowerCase().endsWith('_'+tier));
  if(!candidates.length){
    // A base tariff is not evidence of a missing 4K tariff in a tiered price list.
    if(output.some(p=>/(?:^|_)\d+k$/i.test(p.variant||'')))return {kind:'unknown'};
    candidates=output;
  }
  const inputCost=inputs.reduce((sum,p)=>sum+p.cost_usd,0);
  const totals=candidates.map(p=>Number((p.cost_usd+inputCost).toFixed(10)));
  const min=Math.min(...totals),max=Math.max(...totals);
  return {kind:min===max?'fixed':'range',min,max};
}

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
  if(type!=='image/png')throw new ApiError(502,'O provedor não retornou PNG, apesar do formato solicitado. Nenhuma conversão ou nova geração foi realizada.');
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
    if(!pending)pending=request('/images/models').then(async data=>{
      if(!Array.isArray(data.data))throw new ApiError(502,'O catálogo do OpenRouter está indisponível.');
      const candidates=data.data.filter(m=>m.architecture?.input_modalities?.includes('image')&&m.architecture?.output_modalities?.includes('image')&&acceptsReference(m.supported_parameters)&&acceptsPng(m.supported_parameters)&&resolutions(m.supported_parameters).length);
      const verified=await Promise.all(candidates.map(async m=>{
        const details=await request(endpointPath(m.id));
        const endpoints=(details.endpoints||[]).filter(compatibleEndpoint);
        return {id:m.id,name:m.name||m.id,resolutions:['2K','4K'].filter(r=>endpoints.some(e=>resolutions(e.supported_parameters).includes(r)))};
      }));
      cache=verified.filter(m=>m.resolutions.length).sort((a,b)=>a.name.localeCompare(b.name));
      expires=Date.now()+300000;return {configured:true,models:cache};
    }).finally(()=>{pending=null;});
    return pending;
  }
  async function endpointFor(model,resolution,signal){
    if(!apiKey)throw new ApiError(503,'Configure OPENROUTER_API_KEY e reinicie o servidor local.');
    const catalog=await models();
    if(!catalog.models.some(m=>m.id===model&&m.resolutions.includes(resolution)))throw new ApiError(400,'Esse modelo não suporta saída PNG com imagem de referência na resolução escolhida. Atualize a lista.');
    const details=await request(endpointPath(model),{signal});
    const endpoint=details.endpoints?.find(e=>compatibleEndpoint(e)&&resolutions(e.supported_parameters).includes(resolution));
    if(!endpoint)throw new ApiError(400,'Nenhum provedor deste modelo aceita saída PNG com imagem de referência nessa resolução. Escolha outro modelo.');
    return endpoint;
  }
  async function pricing(model,resolution){
    const endpoint=await endpointFor(model,resolution);
    const lines=(endpoint.pricing||[]).filter(p=>typeof p.cost_usd==='number'&&Number.isFinite(p.cost_usd)&&p.cost_usd>=0)
      .map(({billable,unit,cost_usd,variant})=>({billable,unit,cost_usd,...(variant?{variant}:{})}));
    return {model,resolution,provider:endpoint.provider_tag||endpoint.provider_name||'',pricing:lines,estimate:estimatePrice(lines,resolution)};
  }
  async function upscale(data,signal){
    if(!apiKey)throw new ApiError(503,'Configure OPENROUTER_API_KEY e reinicie o servidor local.');
    if(busy)throw new ApiError(409,'Já existe uma imagem sendo processada. Aguarde a conclusão.');
    if(!data||!['2K','4K'].includes(data.resolution)||typeof data.model!=='string')throw new ApiError(400,'Escolha um modelo e a resolução 2K ou 4K.');
    const {width,height}=inputImage(data.image);
    busy=true;
    try{
      const endpoint=await endpointFor(data.model,data.resolution,signal);
      const ratios=endpoint.supported_parameters.aspect_ratio?.values||[];
      const supportedRatios=ratios.filter(r=>/^\d+(\.\d+)?:\d+(\.\d+)?$/.test(r));
      const distance=r=>{const [w,h]=r.split(':').map(Number);return Math.abs(Math.log((w/h)/(width/height)));};
      const aspect=ratios.includes('auto')?'auto':supportedRatios.sort((a,b)=>distance(a)-distance(b))[0];
      const body={model:data.model,resolution:data.resolution,
        prompt:`Preserve all aspects of the original image. Your goal is simply to upscale the image to ${data.resolution} resolution. Do not alter the colors, lighting, or texture.`,
        input_references:[{type:'image_url',image_url:{url:data.image}}],
        output_format:'png',
        ...(aspect?{aspect_ratio:aspect}:{}),
        ...(endpoint.provider_tag?{provider:{only:[endpoint.provider_tag],allow_fallbacks:false}}:{provider:{allow_fallbacks:false}}),
      };
      const result=await request('/images',{body,signal});
      return {image:outputImage(result),model:data.model,resolution:data.resolution,cost:typeof result.usage?.cost==='number'&&Number.isFinite(result.usage.cost)?result.usage.cost:null};
    }finally{busy=false;}
  }
  return {models,pricing,upscale};
}
module.exports={createOpenRouter,ApiError};
