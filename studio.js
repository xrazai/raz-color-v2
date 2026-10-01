(() => {
  'use strict';
  const $=id=>document.getElementById(id),B=BatchModel;
  const original=$('original'),result=$('result'),context=result.getContext('2d');
  const viewer=new FabricViewer($('stage'),{fit:$('fit'),actual:$('actual'),minus:$('zoom-out'),plus:$('zoom-in'),percent:$('zoom-percent')});
  let variants=[B.variant('#687B62')],selectedId=variants[0].id,texture=1,view='color';
  let engine=null,ready=false,loading=false,exporting=false,loadVersion=0,revision=0,running=false,renderTimer,toastTimer,exportUrl;
  let sourceVersion=0,thumbWidth=160,thumbHeight=160,cancelExport=false;
  const active=()=>variants.find(v=>v.id===selectedId)||variants[0];
  const selectedIndex=()=>variants.findIndex(v=>v.id===selectedId);
  const currentName=()=>$('fabric-name').value;
  const key=v=>JSON.stringify([sourceVersion,v.hex,texture,v.adjustments]);
  const workerCode=`const C=(${ColorEngineFactory.toString()})();let source,model,thumb,thumbModel;
    self.onmessage=({data:d})=>{try{
      if(d.type==='init'){source=new Uint8ClampedArray(d.source);thumb=new Uint8ClampedArray(d.thumb);model=C.analyze(source);thumbModel=C.analyze(thumb);self.postMessage({id:d.id});return;}
      const out=C.recolor(d.small?thumb:source,d.small?thumbModel:model,d.hex,d.options);
      self.postMessage({id:d.id,pixels:out.buffer},[out.buffer]);
    }catch(error){self.postMessage({id:d.id,error:error.message});}};`;
  const workerUrl=URL.createObjectURL(new Blob([workerCode],{type:'text/javascript'}));
  class Processor {
    constructor(){this.worker=new Worker(workerUrl);this.pending=new Map();this.id=0;this.worker.onmessage=({data})=>{const task=this.pending.get(data.id);if(!task)return;clearTimeout(task.timer);this.pending.delete(data.id);data.error?task.reject(Error(data.error)):task.resolve(data);};this.worker.onerror=()=>this.close();}
    request(data,transfer=[]){return new Promise((resolve,reject)=>{const id=++this.id,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('O processamento demorou demais. Tente uma imagem menor.'));},120000);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({...data,id},transfer);});}
    close(){this.worker.terminate();for(const task of this.pending.values()){clearTimeout(task.timer);task.reject(Error('Processamento interrompido.'));}this.pending.clear();}
  }
  function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
  function lockControls(){
    const locked=loading||exporting||!ready;
    document.querySelectorAll('.settings input,.settings textarea,.settings button,.individual input,.individual button,#variant-list button,[data-view]').forEach(el=>el.disabled=locked);
    $('upload').disabled=exporting;
    $('export-all').disabled=locked;$('remove-variant').disabled=locked||variants.length===1;
  }
  function paint(pixels){context.putImageData(new ImageData(new Uint8ClampedArray(pixels),result.width,result.height),0,0);}
  function displayView(){
    $('original-figure').hidden=!(view==='original'||view==='compare');$('result-figure').hidden=view==='original';
    $('canvas-holder').classList.toggle('compare',view==='compare');
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
    const caption=view==='neutral'?'Base neutra':`${String(selectedIndex()+1).padStart(2,'0')} · ${active().hex}`;
    $('result-caption').textContent=caption;result.setAttribute('aria-label',`Tecido · ${caption}`);viewer.layout();
  }
  function updateNames(){
    $('export-filename').textContent=B.filename(currentName(),selectedIndex());
    $('export-all').textContent=`Exportar todas (${variants.length})`;
    $('variant-count').textContent=`${variants.length} ${variants.length===1?'versão':'versões'}`;
  }
  function updateInspector(){
    const item=active();$('hex').value=item.hex;$('color-preview').style.background=item.hex;
    $('individual-title').textContent=`Versão ${String(selectedIndex()+1).padStart(2,'0')}`;
    $('exposure').value=item.adjustments.exposure;$('saturation').value=Math.round(item.adjustments.saturation*100);$('hue').value=item.adjustments.hue;
    updateOutputs();updateNames();$('hex-error').textContent='';$('hex').removeAttribute('aria-invalid');
    const L=ColorEngine.toLab(...ColorEngine.parseHex(item.hex).rgb)[0];$('extreme-note').hidden=L>=.08&&L<=.97;
  }
  function updateOutputs(){
    const a=active().adjustments;
    $('exposure-value').value=`${a.exposure>0?'+':''}${a.exposure.toFixed(2)} EV`;
    $('saturation-value').value=`${Math.round(a.saturation*100)}%`;$('hue-value').value=`${a.hue>0?'+':''}${a.hue}°`;
    $('texture-value').value=`${Math.round(texture*100)}%`;
  }
  function drawCards(){
    const list=$('variant-list'),scrollLeft=list.scrollLeft,focusedId=list.contains(document.activeElement)?document.activeElement.dataset.id:null;
    $('variant-list').replaceChildren();
    variants.forEach((item,index)=>{
      const button=document.createElement('button');button.type='button';button.className='variant-card';button.dataset.id=item.id;
      button.setAttribute('aria-label',`Selecionar versão ${String(index+1).padStart(2,'0')}, ${item.hex}`);button.setAttribute('aria-pressed',String(item.id===selectedId));
      const image=document.createElement('img');image.alt='';if(item.thumb)image.src=item.thumb;image.style.background=item.hex;
      const label=document.createElement('span');label.textContent=`${String(index+1).padStart(2,'0')} · ${item.hex}`;button.append(image,label);
      button.onclick=()=>{if(loading||exporting)return;selectedId=item.id;view='color';updateInspector();drawCards();schedule();};$('variant-list').append(button);
    });updateNames();lockControls();list.scrollLeft=scrollLeft;
    if(focusedId)list.querySelector(`[data-id="${focusedId}"]`)?.focus({preventScroll:true});
  }
  function schedule(delay=0){revision++;clearTimeout(renderTimer);renderTimer=setTimeout(pump,delay);}
  async function pump(){
    if(running||!ready||loading||exporting)return;
    running=true;let completedRevision=-1;
    try {
      do {
        const rev=revision,processor=engine,item=active(),renderView=view;completedRevision=rev;
        $('loading').hidden=renderView==='original';$('loading-text').textContent='Atualizando a versão…';document.querySelector('.preview').setAttribute('aria-busy','true');displayView();
        if(renderView!=='original'){
          const data=await processor.request({type:'render',hex:renderView==='neutral'?'#A0A0A0':item.hex,options:renderView==='neutral'?{texture}:B.settings(item,texture)});
          if(rev!==revision||loading||exporting)continue;paint(data.pixels);
        }
        $('loading').hidden=true;$('status').textContent=renderView==='original'?'Imagem original':renderView==='neutral'?'Base neutra':`Versão ${selectedIndex()+1} · ${item.hex}`;
        for(const candidate of variants){
          if(rev!==revision||loading||exporting)break;
          const signature=key(candidate);if(candidate.thumbKey===signature)continue;
          const data=await processor.request({type:'render',small:true,hex:candidate.hex,options:B.settings(candidate,texture)});
          if(rev!==revision||loading||exporting)break;
          const canvas=document.createElement('canvas');canvas.width=thumbWidth;canvas.height=thumbHeight;
          canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.pixels),thumbWidth,thumbHeight),0,0);
          candidate.thumb=canvas.toDataURL('image/png');candidate.thumbKey=signature;
          const image=$('variant-list').querySelector(`[data-id="${candidate.id}"] img`);if(image)image.src=candidate.thumb;
        }
      } while(completedRevision!==revision&&!loading&&!exporting);
    }catch(error){if(!loading&&!exporting)notify(error.message);}
    finally{running=false;if(!loading){$('loading').hidden=true;document.querySelector('.preview').setAttribute('aria-busy','false');}if(completedRevision!==revision&&!loading&&!exporting)schedule();}
  }
  async function loadImage(url,name,revoke=false){
    if(exporting){if(revoke)URL.revokeObjectURL(url);return;}
    const version=++loadVersion;revision++;loading=true;lockControls();$('loading').hidden=false;$('loading-text').textContent='Preparando a imagem…';
    let candidate;
    try{
      const img=new Image();img.src=url;try{await img.decode();}catch{throw Error('Escolha um PNG, JPG ou WebP válido.');}
      if(version!==loadVersion)return;
      const w=img.naturalWidth,h=img.naturalHeight;if(!w||!h||w*h>24000000||w>16384||h>16384)throw Error('Use até 24 megapixels e 16.384 px por lado.');
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
      const source=ctx.getImageData(0,0,w,h).data;
      const mini=document.createElement('canvas'),ratio=Math.min(180/w,180/h,1);mini.width=Math.max(1,Math.round(w*ratio));mini.height=Math.max(1,Math.round(h*ratio));
      const mc=mini.getContext('2d',{willReadFrequently:true});mc.drawImage(img,0,0,mini.width,mini.height);const thumb=mc.getImageData(0,0,mini.width,mini.height).data;
      candidate=new Processor();await candidate.request({type:'init',source:source.buffer,thumb:thumb.buffer},[source.buffer,thumb.buffer]);
      if(version!==loadVersion){candidate.close();return;}
      engine?.close();engine=candidate;sourceVersion++;thumbWidth=mini.width;thumbHeight=mini.height;
      original.width=result.width=w;original.height=result.height=h;original.getContext('2d').drawImage(canvas,0,0);canvas.width=canvas.height=1;
      $('thumbnail').src=mini.toDataURL();$('filename').textContent=name;$('filename').title=name;
      if(!$('fabric-name').value.trim())$('fabric-name').value=name;
      $('dimensions').textContent=`${w} × ${h} px`;ready=true;view='color';variants.forEach(v=>{v.thumbKey=null;});
      viewer.reset(w,h);drawCards();updateInspector();
    }catch(error){candidate?.close();if(version===loadVersion)notify(error.message);}
    finally{if(revoke)URL.revokeObjectURL(url);if(version===loadVersion){loading=false;lockControls();$('loading').hidden=true;schedule();}}
  }
  function upload(file){if(!file||exporting)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){notify('Escolha PNG, JPG ou WebP.');return;}if(file.size>40*1024*1024){notify('Escolha uma imagem de até 40 MB.');return;}loadImage(URL.createObjectURL(file),file.name.replace(/\.[^.]+$/,''),true);}
  $('upload').onclick=()=>$('file').click();$('file').onchange=()=>{upload($('file').files[0]);$('file').value='';};
  $('fabric-name').oninput=updateNames;
  $('batch-form').onsubmit=e=>{
    e.preventDefault();if(loading||exporting||!ready)return;
    const parsed=B.parseList($('hex-list').value);
    const error=parsed.invalid.length?`HEX inválido: ${parsed.invalid.slice(0,5).join(', ')}.`:!parsed.colors.length?'Insira pelo menos uma cor HEX.':variants.length+parsed.colors.length>100?'O lote pode ter até 100 versões.':'';
    $('list-error').textContent=error;$('hex-list').setAttribute('aria-invalid',String(Boolean(error)));if(error)return;
    const added=parsed.colors.map(B.variant);variants.push(...added);selectedId=added[0].id;$('hex-list').value='';view='color';updateInspector();drawCards();schedule();
  };
  $('hex-list').oninput=()=>{$('list-error').textContent='';$('hex-list').removeAttribute('aria-invalid');};
  $('texture').oninput=()=>{texture=Number($('texture').value)/100;updateOutputs();schedule(70);};
  $('texture-reset').onclick=()=>{texture=1;$('texture').value=100;updateOutputs();schedule();};
  $('color-form').onsubmit=e=>{e.preventDefault();const parsed=ColorEngine.parseHex($('hex').value);$('hex-error').textContent=parsed?'':'Use um HEX válido, como #687B62.';$('hex').setAttribute('aria-invalid',String(!parsed));if(!parsed||loading||exporting)return;active().hex=parsed.hex;view='color';updateInspector();drawCards();schedule();};
  for(const field of ['exposure','saturation','hue'])$(field).oninput=()=>{active().adjustments[field]=Number($(field).value)/(field==='saturation'?100:1);view='color';updateOutputs();schedule(70);};
  $('reset-adjustments').onclick=()=>{active().adjustments={exposure:0,saturation:1,hue:0};updateInspector();schedule();};
  $('remove-variant').onclick=()=>{if(variants.length===1)return;const index=selectedIndex();variants.splice(index,1);selectedId=variants[Math.min(index,variants.length-1)].id;updateInspector();drawCards();schedule();};
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;schedule();});
  const preview=document.querySelector('.preview'),outside=[document.querySelector('.header'),document.querySelector('.intro'),document.querySelector('.settings'),document.querySelector('.individual'),document.querySelector('.footer')];
  function expand(value){preview.classList.toggle('expanded',value);document.body.classList.toggle('inspecting',value);$('expand').setAttribute('aria-pressed',String(value));$('expand').setAttribute('aria-label',value?'Sair da inspeção expandida':'Expandir área de inspeção');$('expand').querySelector('span').textContent=value?'Voltar · Esc':'Expandir';outside.forEach(el=>el.inert=value);viewer.layout();$('expand').focus({preventScroll:true});}
  $('expand').onclick=()=>expand(!preview.classList.contains('expanded'));
  document.addEventListener('keydown',e=>{if(!preview.classList.contains('expanded'))return;if(e.key==='Escape'){e.preventDefault();expand(false);}if(e.key==='Tab'){const list=[...preview.querySelectorAll('button:not(:disabled),input,[tabindex="0"]')],first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  async function pngFor(item,settings,processor,w,h){
    const data=await processor.request({type:'render',hex:item.hex,options:settings}),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.pixels),w,h),0,0);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=canvas.height=1;if(!blob)throw Error('Não foi possível gerar o PNG.');return blob;
  }
  function dataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Falha ao preparar o download.'));reader.readAsDataURL(blob);});}
  async function exportImages(all){
    if(!ready||loading||exporting)return;
    exporting=true;cancelExport=false;revision++;clearTimeout(renderTimer);lockControls();
    const snapshot=(all?variants:[active()]).map(item=>({hex:item.hex,settings:B.settings(item,texture),filename:B.filename(currentName(),variants.indexOf(item))}));
    const fabric=B.safeName(currentName()),w=result.width,h=result.height,processor=engine;
    if(exportUrl){URL.revokeObjectURL(exportUrl);exportUrl=null;}
    $('export-image').hidden=true;$('export-image').removeAttribute('src');$('download-png').hidden=true;$('export-files').replaceChildren();$('export-progress').hidden=false;$('export-progress').max=snapshot.length;$('export-progress').value=0;
    $('export-title').textContent=all?'Preparando seu lote…':'Preparando sua imagem…';$('export-detail').textContent=`${w} × ${h} px · resolução original`;$('close-export').textContent='Cancelar';$('export-dialog').showModal();
    try{
      const files=[];let total=0,singleBlob;
      for(let i=0;i<snapshot.length;i++){
        if(cancelExport)break;const item=snapshot[i];$('export-detail').textContent=`Gerando ${i+1} de ${snapshot.length} · ${item.filename}`;
        const blob=await pngFor(item,item.settings,processor,w,h);if(cancelExport)break;
        total+=blob.size;if(total>256*1024*1024)throw Error('O lote excedeu 256 MB. Use menos cores por lote ou uma imagem menor.');
        if(all)files.push({name:item.filename,data:new Uint8Array(await blob.arrayBuffer())});else singleBlob=blob;
        const li=document.createElement('li');li.textContent=item.filename;$('export-files').append(li);$('export-progress').value=i+1;
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      if(cancelExport)return;
      const blob=all?ZipStore.create(files):singleBlob,link=$('download-png');
      if(all){exportUrl=URL.createObjectURL(blob);link.href=exportUrl;link.download=`${fabric}.zip`;link.textContent=`Baixar ZIP · ${snapshot.length} imagens`;}
      else{const url=await dataUrl(blob);link.href=url;link.download=snapshot[0].filename;link.textContent='Baixar PNG';$('export-image').src=url;$('export-image').hidden=false;}
      if(cancelExport)return;
      link.hidden=false;$('export-title').textContent=all?'Seu lote está pronto.':'Seu tecido está pronto.';$('export-detail').textContent=`${snapshot.length} ${snapshot.length===1?'imagem':'imagens'} · ${w} × ${h} px · ${(blob.size/1048576).toFixed(1)} MB`;
    }catch(error){if(!cancelExport){$('export-title').textContent='Não foi possível exportar.';$('export-detail').textContent=error.message;}}
    finally{exporting=false;$('export-progress').hidden=true;$('close-export').textContent='Fechar';lockControls();schedule();}
  }
  $('export').onclick=()=>exportImages(false);$('export-all').onclick=()=>exportImages(true);
  $('close-export').onclick=()=>{cancelExport=true;$('export-dialog').close();};$('export-dialog').addEventListener('cancel',()=>{cancelExport=true;});
  let dragDepth=0;window.addEventListener('dragenter',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dragDepth++;$('drop-overlay').hidden=false;}});window.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});window.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('drop-overlay').hidden=true;}});window.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop-overlay').hidden=true;upload(e.dataTransfer.files[0]);});
  drawCards();updateInspector();loadImage(window.SAMPLE_IMAGE,'Viscolinho');
})();
