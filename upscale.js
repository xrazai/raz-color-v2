(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const cameras=Object.fromEntries(['original','result'].map(id=>{
    const viewer=new FabricViewer($(id+'-frame'),{fit:$(id+'-fit'),actual:$(id+'-actual'),minus:$(id+'-minus'),plus:$(id+'-plus'),percent:$(id+'-percent')});
    viewer.setEnabled(false);return [id,viewer];
  }));
  let models=[],configured=false,catalogLoading=false,uploading=false,busy=false,source=null,outputUrl=null,outputName='',controller=null,loadVersion=0;
  let priceVersion=0,priceController=null;
  const dimensions=(w,h)=>`${w.toLocaleString('pt-BR')} × ${h.toLocaleString('pt-BR')} px`;
  const selectedModel=()=>models.find(model=>model.id===$('ai-model').value);
  function error(message){$('process-error').textContent=message||'';$('process-error').hidden=!message;}
  function controls(){
    $('download-result').disabled=busy||uploading||!outputUrl;
    $('choose-image').disabled=busy||uploading;
    $('image-file').disabled=busy||uploading;
    $('ai-model').disabled=busy||catalogLoading||!models.length;
    $('ai-resolution').disabled=busy||!selectedModel();
    $('reload-models').disabled=busy||catalogLoading;
    $('process-image').disabled=busy||uploading||catalogLoading||!configured||!source||!selectedModel();
    $('process-image').textContent=busy?'Processamento em andamento…':'Processar com IA ↗';
    $('cancel-process').hidden=!busy;
    document.querySelector('.upscale-preview').setAttribute('aria-busy',String(busy));
  }
  function updateResolutions(){
    const current=$('ai-resolution').value;
    for(const option of $('ai-resolution').options)option.disabled=!selectedModel()?.resolutions.includes(option.value);
    if(!selectedModel()?.resolutions.includes(current))$('ai-resolution').value=selectedModel()?.resolutions[0]||'2K';
    controls();loadPrice();
  }
  const usd=value=>'US$ '+value.toLocaleString('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:6});
  async function loadPrice(){
    const version=++priceVersion;priceController?.abort();
    const model=selectedModel(),resolution=$('ai-resolution').value;
    $('price-source').hidden=true;
    if(!model||!configured){$('price-label').textContent='Custo por processamento';$('price-value').textContent='Preço indisponível';$('price-detail').textContent='Conecte o catálogo para consultar as tarifas.';return;}
    priceController=new AbortController();
    $('price-label').textContent=`Estimativa · ${resolution}`;$('price-value').textContent='Consultando preço…';$('price-detail').textContent='Uma imagem enviada e uma imagem gerada.';
    try{
      const query=new URLSearchParams({model:model.id,resolution});
      const data=await readResponse(await fetch('/api/ai/pricing?'+query,{signal:AbortSignal.any([priceController.signal,AbortSignal.timeout(30000)])}));
      if(version!==priceVersion)return;
      const estimate=data.estimate;
      if(estimate.kind==='fixed'){
        $('price-value').textContent=usd(estimate.min);
        $('price-detail').textContent='Por processamento, incluindo a imagem de entrada quando cobrada. Tarifas podem mudar.';
      }else if(estimate.kind==='range'){
        $('price-value').textContent=`${usd(estimate.min)} – ${usd(estimate.max)}`;
        $('price-detail').textContent='Faixa das tarifas publicadas. O valor depende da qualidade ou modalidade aplicada pelo provedor.';
      }else if(estimate.kind==='variable'){
        $('price-value').textContent='Preço variável';
        const labels={input_image:'imagem de entrada',input_reference:'referência',output_image:'imagem de saída'};
        const rates=data.pricing.filter(p=>labels[p.billable]).map(p=>`${labels[p.billable]}: ${usd(p.cost_usd*(p.unit==='token'?1000:1))} / ${p.unit==='token'?'mil tokens':p.unit==='megapixel'?'megapixel':'imagem'}`);
        $('price-detail').textContent=rates.join(' · ')+'. O custo total depende do uso; será exibido após a geração quando informado.';
      }else{
        $('price-value').textContent='Sem estimativa para '+resolution;
        $('price-detail').textContent='O catálogo não detalha o preço dessa resolução. Consulte as tarifas antes de processar.';
      }
      $('price-source').href='https://openrouter.ai/api/v1/images/models/'+model.id+'/endpoints';$('price-source').hidden=false;
    }catch(e){if(version!==priceVersion)return;$('price-value').textContent='Preço indisponível';$('price-detail').textContent='Não foi possível consultar a tarifa agora. Atualize os modelos para tentar novamente.';}
  }
  async function readResponse(response){
    let data;
    try{data=await response.json();}catch{throw Error('O servidor não respondeu corretamente. Reinicie com node server.cjs e atualize esta página.');}
    if(!response.ok)throw Error(data.error||'Não foi possível concluir a solicitação.');
    return data;
  }
  async function loadModels(){
    if(busy||catalogLoading)return;
    if(!['http:','https:'].includes(location.protocol)){
      $('connection-status').textContent='A IA precisa do servidor local.';$('setup-help').hidden=false;$('ai-model').replaceChildren(new Option('Abra pelo servidor local',''));controls();return;
    }
    catalogLoading=true;$('connection-status').textContent='Consultando OpenRouter…';controls();
    const previous=$('ai-model').value;
    try{
      const data=await readResponse(await fetch('/api/ai/models',{signal:AbortSignal.timeout(30000)}));
      configured=Boolean(data.configured);models=data.models||[];
      $('ai-model').replaceChildren(...models.map(model=>new Option(model.name,model.id)));
      if(!models.length)$('ai-model').append(new Option('Nenhum modelo disponível',''));
      $('ai-model').value=models.some(m=>m.id===previous)?previous:models.find(m=>m.id==='bytedance-seed/seedream-4.5')?.id||models[0]?.id||'';
      $('connection-status').textContent=!configured?'Chave não encontrada no servidor.':models.length?`Chave configurada · ${models.length} modelos disponíveis`:'Nenhum modelo compatível com 2K/4K disponível.';
      $('setup-help').hidden=configured;
    }catch(e){configured=false;models=[];$('ai-model').replaceChildren(new Option('Catálogo indisponível',''));$('connection-status').textContent=e.name==='TimeoutError'?'A consulta demorou demais. Tente atualizar os modelos.':e.message;}
    finally{catalogLoading=false;updateResolutions();}
  }
  function clearOutput(){
    cameras.result.setEnabled(false);cameras.result.reset(1,1);
    $('result-image').hidden=true;$('result-image').removeAttribute('src');$('result-empty').hidden=false;
    $('result-size').textContent='—';$('result-details').hidden=true;$('download-result').disabled=true;outputName='';
    if(outputUrl){URL.revokeObjectURL(outputUrl);outputUrl=null;}
  }
  async function upload(file){
    if(!file||busy)return;
    error('');
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){error('Escolha uma imagem PNG, JPG ou WebP.');return;}
    if(file.size>40*1024*1024){error('Escolha uma imagem de até 40 MB.');return;}
    const version=++loadVersion,url=URL.createObjectURL(file);let accepted=false;
    uploading=true;controls();
    try{
      const image=new Image();image.src=url;await image.decode();
      if(version!==loadVersion)return;
      const width=image.naturalWidth,height=image.naturalHeight;
      if(!width||!height||width*height>24000000||width>16384||height>16384)throw Error('Use até 24 megapixels e 16.384 px por lado. A imagem não será reduzida automaticamente.');
      if(source)URL.revokeObjectURL(source.url);
      source={url,image,width,height,name:file.name};accepted=true;clearOutput();
      $('original-image').src=url;$('original-image').hidden=false;$('original-empty').hidden=true;
      cameras.original.setEnabled(true);cameras.original.reset(width,height);
      $('source-info').hidden=false;$('source-name').textContent=file.name;
      $('source-dimensions').textContent=dimensions(width,height);$('original-size').textContent=dimensions(width,height);
      const pixels=width*height;
      const pixelLabel=pixels<10000?`${pixels.toLocaleString('pt-BR')} pixels`:`${(pixels/1000000).toLocaleString('pt-BR',{maximumFractionDigits:2})} MP`;
      const sizeLabel=file.size<1048576?`${(file.size/1024).toLocaleString('pt-BR',{maximumFractionDigits:1})} KB`:`${(file.size/1048576).toLocaleString('pt-BR',{maximumFractionDigits:2})} MB`;
      $('source-details').textContent=`${pixelLabel} · ${sizeLabel}`;
      $('upload-label').textContent='Trocar imagem';$('preview-state').textContent='Imagem pronta para processar';
      $('process-status').textContent='Escolha o modelo e a resolução de saída. Sua imagem ainda não foi enviada.';
    }catch(e){if(version===loadVersion)error(e.name==='EncodingError'?'Não foi possível abrir esse arquivo de imagem.':e.message);}
    finally{if(!accepted)URL.revokeObjectURL(url);if(version===loadVersion){uploading=false;controls();}}
  }
  const dataURL=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Não foi possível preparar a imagem.'));reader.readAsDataURL(blob);});
  async function prepareImage(image){
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    canvas.getContext('2d').drawImage(image.image,0,0);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=canvas.height=1;
    if(!blob)throw Error('Não foi possível preparar a imagem.');
    if(blob.size>40*1024*1024)throw Error('O PNG preparado excede 40 MB. Escolha uma imagem menor.');
    return dataURL(blob);
  }
  function imageBlob(url){
    const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(url||'');
    if(!match)throw Error('O servidor retornou um formato de imagem inválido.');
    const binary=atob(match[2]),bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return new Blob([bytes],{type:match[1]});
  }
  async function processImage(){
    if($('process-image').disabled)return;
    const snapshot={source,model:selectedModel(),resolution:$('ai-resolution').value};
    busy=true;controller=new AbortController();error('');controls();
    $('processing-overlay').hidden=false;$('processing-label').textContent='Preparando sua imagem…';$('preview-state').textContent='Processando com IA';
    $('process-status').textContent='Preparando o envio ao OpenRouter…';
    let candidateUrl=null;
    try{
      const image=await prepareImage(snapshot.source);
      controller.signal.throwIfAborted();
      $('processing-label').textContent=`Gerando em ${snapshot.resolution}…`;$('process-status').textContent=`${snapshot.model.name} está processando sua imagem. Aguarde.`;
      const data=await readResponse(await fetch('/api/ai/upscale',{method:'POST',headers:{'Content-Type':'application/json','X-Raz-Request':'image-upscale'},body:JSON.stringify({model:snapshot.model.id,resolution:snapshot.resolution,image}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(330000)])}));
      controller.signal.throwIfAborted();
      const blob=imageBlob(data.image);
      if(blob.type!=='image/png')throw Error('O provedor não retornou PNG. Nenhuma conversão foi realizada.');
      candidateUrl=URL.createObjectURL(blob);const output=new Image();output.src=candidateUrl;await output.decode();
      controller.signal.throwIfAborted();
      clearOutput();outputUrl=candidateUrl;candidateUrl=null;
      $('result-image').src=outputUrl;$('result-image').hidden=false;$('result-empty').hidden=true;
      cameras.result.setEnabled(true);cameras.result.reset(output.naturalWidth,output.naturalHeight);
      $('result-size').textContent=dimensions(output.naturalWidth,output.naturalHeight);
      outputName=`${snapshot.source.name.replace(/\.[^.]+$/,'')}-IA-${snapshot.resolution}.png`;
      $('result-details').textContent=`${snapshot.model.name} · solicitado: ${snapshot.resolution} · recebido: ${dimensions(output.naturalWidth,output.naturalHeight)}${data.cost!==null&&Number.isFinite(data.cost)?` · custo informado: US$ ${data.cost.toFixed(4)}`:''}`;$('result-details').hidden=false;
      const larger=output.naturalWidth>snapshot.source.width||output.naturalHeight>snapshot.source.height;
      $('process-status').textContent=larger?'Resultado pronto. Compare os detalhes e baixe sua imagem.':'Resultado pronto. A resolução recebida não é maior que a original; confira as dimensões antes de baixar.';
      $('preview-state').textContent='Resultado pronto para baixar';
    }catch(e){
      const cancelled=controller.signal.aborted;
      error(cancelled?'':e.name==='TimeoutError'?'O processamento demorou demais. Nenhuma nova tentativa foi iniciada.':e.message==='Failed to fetch'?'A conexão com o servidor foi interrompida. Confira se ele está em execução.':e.message);
      $('process-status').textContent=cancelled?'Processamento cancelado. Consulte o OpenRouter se o provedor já tiver concluído a geração.':'O processamento não foi concluído. Sua imagem original foi preservada.';
      $('preview-state').textContent=cancelled?'Processamento cancelado':'Não foi possível concluir';
    }finally{if(candidateUrl)URL.revokeObjectURL(candidateUrl);busy=false;controller=null;$('processing-overlay').hidden=true;controls();}
  }
  $('choose-image').onclick=()=>$('image-file').click();
  $('download-result').onclick=()=>{if(!outputUrl||busy||uploading)return;const link=document.createElement('a');link.href=outputUrl;link.download=outputName;document.body.append(link);link.click();link.remove();};
  $('image-file').onchange=()=>{upload($('image-file').files[0]);$('image-file').value='';};
  $('ai-model').onchange=updateResolutions;$('ai-resolution').onchange=loadPrice;$('reload-models').onclick=loadModels;$('process-image').onclick=processImage;
  $('cancel-process').onclick=()=>{controller?.abort();$('cancel-process').disabled=true;};
  // Reset the cancel button when a new generation is started.
  $('process-image').addEventListener('click',()=>{$('cancel-process').disabled=false;});
  let dragDepth=0;
  window.addEventListener('dragenter',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();if(!busy){dragDepth++;$('drop-overlay').hidden=false;}}});
  window.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
  window.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('drop-overlay').hidden=true;}});
  window.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop-overlay').hidden=true;upload(e.dataTransfer.files[0]);});
  window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
  loadModels();
})();
