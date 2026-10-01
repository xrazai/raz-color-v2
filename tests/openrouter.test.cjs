const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createServer}=require('../server.cjs');

const png=fs.readFileSync(require('node:path').join(__dirname,'fixtures/tecido-alpha.png'));
const image=`data:image/png;base64,${png.toString('base64')}`;
const capabilities={output_format:{type:'enum',values:['png','webp']},resolution:{type:'enum',values:['2K','4K']},input_references:{type:'range',min:0,max:1},aspect_ratio:{type:'enum',values:['auto','1:1']}};
const model={id:'test/fabric',name:'Fabric',architecture:{input_modalities:['text','image'],output_modalities:['image']},supported_parameters:capabilities};
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
async function start(t,options={}){
  const calls=[];
  const upstream=async(url,init)=>{
    calls.push({url,init});
    if(url.endsWith('/images/models'))return json({data:[model,{...model,id:'text/only',architecture:{input_modalities:['text'],output_modalities:['image']}},{...model,id:'small/only',supported_parameters:{...capabilities,resolution:{type:'enum',values:['1K']}}}]});
    if(url.endsWith('/endpoints'))return json({id:model.id,endpoints:options.endpoints||[{provider_tag:'test-provider',supported_parameters:capabilities}]});
    return options.generation?options.generation():json({data:[{b64_json:png.toString('base64'),media_type:'image/png'}],usage:{cost:0.04}});
  };
  const server=createServer({apiKey:'private-test-key',fetchImpl:upstream,...options});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=(body,headers={})=>fetch(`${base}/api/ai/upscale`,{method:'POST',headers:{'Content-Type':'application/json','Origin':base,'X-Raz-Request':'image-upscale',...headers},body:JSON.stringify(body)});
  return {base,post,calls};
}

test('catalog exposes only image-to-image models with 2K/4K and never exposes the key',async t=>{
  const {base,calls}=await start(t);
  const response=await fetch(`${base}/api/ai/models`);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.configured,true);
  assert.deepEqual(body.models.map(m=>m.id),['test/fabric']);
  assert.deepEqual(body.models[0].resolutions,['2K','4K']);
  assert.ok(!JSON.stringify(body).includes('private-test-key'));
  assert.equal(calls.filter(c=>c.init?.method==='POST').length,0);
});

test('generation forwards a reference, supported resolution and server-side credentials',async t=>{
  const {post,calls}=await start(t);
  const response=await post({model:'test/fabric',resolution:'4K',image});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.image,image);
  assert.equal(body.cost,0.04);
  const generation=calls.find(c=>c.init?.method==='POST');
  assert.equal(generation.init.headers.Authorization,'Bearer private-test-key');
  const request=JSON.parse(generation.init.body);
  assert.equal(request.resolution,'4K');
  assert.equal(request.output_format,'png');
  assert.deepEqual(request.input_references,[{type:'image_url',image_url:{url:image}}]);
  assert.deepEqual(request.provider,{only:['test-provider'],allow_fallbacks:false});
  assert.equal(request.aspect_ratio,'auto');
  assert.ok(!JSON.stringify(body).includes('private-test-key'));
});

test('invalid inputs cannot cause a paid generation',async t=>{
  const {post,calls}=await start(t);
  for(const body of [{model:'unknown/model',resolution:'2K',image},{model:'test/fabric',resolution:'8K',image},{model:'test/fabric',resolution:'2K',image:'https://private.example/image.png'},{model:'test/fabric',resolution:'2K',image:'data:image/png;base64,YmFk'}]){
    assert.equal((await post(body)).status,400);
  }
  assert.equal(calls.filter(c=>c.init?.method==='POST').length,0);
});

test('only providers with explicit PNG control are listed and used',async t=>{
  for(const formats of [undefined,['webp'],['webp','png']]){
    await t.test(JSON.stringify(formats)||'no format control',async t=>{
      const supported_parameters={...capabilities,output_format:formats?{type:'enum',values:formats}:undefined};
      const {base,post,calls}=await start(t,{endpoints:[{provider_tag:'format-provider',supported_parameters}]});
      const supported=Boolean(formats?.includes('png'));
      assert.equal((await (await fetch(base+'/api/ai/models')).json()).models.length,supported?1:0);
      assert.equal((await post({model:'test/fabric',resolution:'2K',image})).status,supported?200:400);
      const generations=calls.filter(c=>c.init?.method==='POST');
      assert.equal(generations.length,supported?1:0);
      if(supported)assert.equal(JSON.parse(generations[0].init.body).output_format,'png');
    });
  }
});

test('catalog resolutions and generation use the same PNG-capable endpoint',async t=>{
  const {base,post,calls}=await start(t,{endpoints:[
    {provider_tag:'webp-only',supported_parameters:{...capabilities,output_format:{type:'enum',values:['webp']}}},
    {provider_tag:'png-2k',supported_parameters:{...capabilities,resolution:{type:'enum',values:['2K']}}},
  ]});
  const catalog=await (await fetch(base+'/api/ai/models')).json();
  assert.deepEqual(catalog.models[0].resolutions,['2K']);
  assert.equal((await post({model:'test/fabric',resolution:'4K',image})).status,400);
  assert.equal((await post({model:'test/fabric',resolution:'2K',image})).status,200);
  const generations=calls.filter(c=>c.init?.method==='POST');
  assert.equal(generations.length,1);
  assert.deepEqual(JSON.parse(generations[0].init.body).provider.only,['png-2k']);
});

test('non-PNG output is rejected without conversion or paid retry',async t=>{
  const {post,calls}=await start(t,{generation:()=>json({data:[{b64_json:Buffer.from('RIFF0000WEBP','ascii').toString('base64'),media_type:'image/png'}]})});
  const response=await post({model:'test/fabric',resolution:'2K',image});
  assert.equal(response.status,502);
  assert.match((await response.json()).error,/PNG/);
  assert.equal(calls.filter(c=>c.init?.method==='POST').length,1);
});

test('cross-origin calls and server source downloads are blocked',async t=>{
  const {base,post,calls}=await start(t);
  assert.equal((await post({model:'test/fabric',resolution:'2K',image},{Origin:'https://other.example'})).status,403);
  assert.equal((await post({model:'test/fabric',resolution:'2K',image},{'X-Raz-Request':''})).status,403);
  for(const path of ['/server.cjs','/.env','/.git/config','/tests/openrouter.test.cjs'])assert.equal((await fetch(base+path)).status,404);
  assert.equal(calls.length,0);
});

test('missing key reports setup state without contacting the provider',async t=>{
  const {base,post,calls}=await start(t,{apiKey:''});
  assert.deepEqual(await (await fetch(`${base}/api/ai/models`)).json(),{configured:false,models:[]});
  assert.equal((await post({model:'test/fabric',resolution:'2K',image})).status,503);
  assert.equal(calls.length,0);
});

test('provider errors are sanitized and never retried as another paid generation',async t=>{
  const {post,calls}=await start(t,{generation:()=>new Response('private-test-key leaked upstream',{status:402})});
  const response=await post({model:'test/fabric',resolution:'2K',image});
  assert.equal(response.status,402);
  const body=await response.text();
  assert.match(body,/créditos/i);
  assert.ok(!body.includes('private-test-key'));
  assert.equal(calls.filter(c=>c.init?.method==='POST').length,1);
});

test('a resolution and reference supported by different endpoints cannot trigger generation',async t=>{
  const {post,calls}=await start(t,{endpoints:[
    {provider_tag:'small',supported_parameters:{...capabilities,resolution:{type:'enum',values:['2K']}}},
    {provider_tag:'text',supported_parameters:{...capabilities,input_references:{type:'range',min:0,max:0}}},
  ]});
  assert.equal((await post({model:'test/fabric',resolution:'4K',image})).status,400);
  assert.equal(calls.filter(c=>c.init?.method==='POST').length,0);
});

test('simultaneous submissions cannot trigger duplicate paid generations',async t=>{
  let release,notifyStarted;
  const started=new Promise(resolve=>{notifyStarted=resolve;});
  const {post,calls}=await start(t,{generation:()=>{notifyStarted();return new Promise(resolve=>{release=()=>resolve(json({data:[{b64_json:png.toString('base64')}]}));});}});
  const first=post({model:'test/fabric',resolution:'2K',image});
  await started;
  try{assert.equal((await post({model:'test/fabric',resolution:'2K',image})).status,409);}
  finally{release();}
  const response=await first;
  assert.equal(response.status,200);
  assert.equal((await response.json()).image,image);
  assert.equal(calls.filter(c=>c.init?.method==='POST').length,1);
});

test('an oversized decoded image is rejected before it reaches the provider',async t=>{
  const {post,calls}=await start(t);
  const oversized=Buffer.from(png);oversized.writeUInt32BE(10000,16);oversized.writeUInt32BE(10000,20);
  assert.equal((await post({model:'test/fabric',resolution:'2K',image:`data:image/png;base64,${oversized.toString('base64')}`})).status,400);
  assert.equal(calls.length,0);
});

test('non-raster provider output is rejected instead of being embedded in the UI',async t=>{
  const {post}=await start(t,{generation:()=>json({data:[{b64_json:Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64'),media_type:'image/svg+xml'}]})});
  const response=await post({model:'test/fabric',resolution:'2K',image});
  assert.equal(response.status,502);
  const body=await response.json();
  assert.equal(body.image,undefined);
});

test('price preview includes the uploaded reference and chosen output tier without generating',async t=>{
  const {base,calls}=await start(t,{endpoints:[{provider_tag:'priced',supported_parameters:capabilities,pricing:[
    {billable:'input_reference',unit:'image',cost_usd:0.2},
    {billable:'output_image',unit:'image',cost_usd:0.15,variant:'2k'},
    {billable:'output_image',unit:'image',cost_usd:0.33,variant:'4k'},
    {billable:'input_font',unit:'image',cost_usd:0.03},
  ]}]});
  const response=await fetch(base+'/api/ai/pricing?model=test/fabric&resolution=4K');
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.estimate.kind,'fixed');
  assert.equal(body.estimate.min,0.53);
  assert.equal(body.provider,'priced');
  assert.equal(calls.filter(c=>c.init?.method==='POST').length,0);
});

test('token pricing is marked variable rather than quoted as per-image cost',async t=>{
  const {base}=await start(t,{endpoints:[{provider_tag:'tokens',supported_parameters:capabilities,pricing:[{billable:'output_image',unit:'token',cost_usd:0.00006}]}]});
  const body=await (await fetch(base+'/api/ai/pricing?model=test/fabric&resolution=2K')).json();
  assert.equal(body.estimate.kind,'variable');
  assert.equal(body.pricing[0].unit,'token');
  assert.equal(body.estimate.min,undefined);
});

test('unknown 4K pricing is not silently replaced by the base or 2K tariff',async t=>{
  const {base}=await start(t,{endpoints:[{provider_tag:'partial',supported_parameters:capabilities,pricing:[{billable:'output_image',unit:'image',cost_usd:0.02},{billable:'output_image',unit:'image',cost_usd:0.04,variant:'2k'}]}]});
  const body=await (await fetch(base+'/api/ai/pricing?model=test/fabric&resolution=4K')).json();
  assert.equal(body.estimate.kind,'unknown');
});

test('quality-dependent prices produce a range including input cost',async t=>{
  const {base}=await start(t,{endpoints:[{provider_tag:'quality',supported_parameters:capabilities,pricing:[{billable:'input_image',unit:'image',cost_usd:0.01},{billable:'output_image',unit:'image',cost_usd:0.06,variant:'low_2k'},{billable:'output_image',unit:'image',cost_usd:0.08,variant:'medium_2k'}]}]});
  const body=await (await fetch(base+'/api/ai/pricing?model=test/fabric&resolution=2K')).json();
  assert.equal(body.estimate.kind,'range');
  assert.equal(body.estimate.min,0.07);
  assert.equal(body.estimate.max,0.09);
});
