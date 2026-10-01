(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const original=$('original'), result=$('result'), context=result.getContext('2d');
  const viewer=new FabricViewer($('stage'),{fit:$('fit'),actual:$('actual'),minus:$('zoom-out'),plus:$('zoom-in'),percent:$('zoom-percent')});
  let worker=null, job=0, loadVersion=0, view='color', appliedHex='#687B62', ready=false, busy=false, exporting=false;
  let sourceName='Viscolinho', colorPixels=null, neutralPixels=null, toastTimer;
  const workerCode=`const C=(${ColorEngineFactory.toString()})(); let source,model;
    self.onmessage=({data:d})=>{try{if(d.type==='init'){source=new Uint8ClampedArray(d.pixels);model=C.analyze(source);}
    const out=C.recolor(source,model,d.hex);self.postMessage({id:d.id,pixels:out.buffer},[out.buffer]);
    }catch(e){self.postMessage({id:d.id,error:e.message});}};`;
  const workerUrl=URL.createObjectURL(new Blob([workerCode],{type:'text/javascript'}));
  function notify(message) { $('toast').textContent=message; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,6500); }
  function setBusy(value,text='Aplicando a nova cor…') {
    busy=value; $('loading').hidden=!value; $('loading-text').textContent=text;
    document.querySelector('.preview').setAttribute('aria-busy',String(value));
    $('apply').disabled=value||!ready; $('export').disabled=value||!ready||exporting;
    document.querySelectorAll('[data-view]').forEach(b=>b.disabled=value||!ready);
    document.querySelectorAll('[data-hex]').forEach(b=>b.disabled=value||!ready);
    if(value) $('status').textContent=text;
  }
  function status() { $('status').textContent=ready ? (view==='neutral'?'Base neutra · cor original removida':view==='original'?'Imagem original preservada':`Cor aplicada · ${appliedHex}`) : 'Envie uma imagem para começar'; }
  function updateSwatch() {
    const parsed=ColorEngine.parseHex($('hex').value);
    if(parsed) $('color-preview').style.background=parsed.hex;
    document.querySelectorAll('[data-hex]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.hex===parsed?.hex)));
  }
  function validate() {
    const parsed=ColorEngine.parseHex($('hex').value);
    $('hex-error').textContent=parsed ? '' : 'Use um HEX válido, como #687B62 ou #ABC.';
    $('hex').setAttribute('aria-invalid',String(!parsed));
    if(!parsed) $('hex').focus();
    return parsed;
  }
  function paint(pixels) { context.putImageData(new ImageData(pixels,result.width,result.height),0,0); }
  function displayView() {
    $('original-figure').hidden=!(view==='original'||view==='compare');
    $('result-figure').hidden=view==='original';
    $('canvas-holder').classList.toggle('compare',view==='compare');
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
    $('result-caption').textContent=view==='neutral'?'Base neutra':`Cor aplicada · ${appliedHex}`;
    result.setAttribute('aria-label',view==='neutral'?'Tecido com a cor original neutralizada':`Tecido recolorido em ${appliedHex}`);
    if(view==='neutral'&&neutralPixels) paint(neutralPixels);
    else if(colorPixels) paint(colorPixels);
    status();
    viewer.layout();
  }
  function render(hex,mode='color') {
    if(!worker||busy) return;
    const id=++job;
    setBusy(true,mode==='neutral'?'Neutralizando a cor original…':'Aplicando a nova cor…');
    worker.onmessage=({data})=>{
      if(data.id!==job) return;
      setBusy(false);
      if(data.error) {notify(data.error);status();return;}
      if(mode==='neutral') neutralPixels=new Uint8ClampedArray(data.pixels);
      else {colorPixels=new Uint8ClampedArray(data.pixels);appliedHex=hex;updateExtremeNote();}
      view=mode;displayView();
    };
    worker.postMessage({type:'render',id,hex});
  }
  function updateExtremeNote() {
    const L=ColorEngine.toLab(...ColorEngine.parseHex(appliedHex).rgb)[0];
    $('extreme-note').hidden=L>=.08&&L<=.97;
  }
  async function loadImage(url,name,revoke=false) {
    const version=++loadVersion; ++job;
    setBusy(true,'Lendo a imagem e preservando a trama…');
    let candidate;
    try {
      const img=new Image(); img.src=url; try {await img.decode();} catch {throw Error('Não foi possível ler a imagem. Escolha um PNG, JPG ou WebP válido.');}
      if(version!==loadVersion) return;
      const w=img.naturalWidth,h=img.naturalHeight;
      if(!w||!h||w*h>24000000||w>16384||h>16384) throw Error('Use uma imagem de até 24 megapixels, com no máximo 16.384 px por lado.');
      const scratch=document.createElement('canvas'); scratch.width=w;scratch.height=h;
      const ctx=scratch.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
      const pixels=ctx.getImageData(0,0,w,h).data;
      const thumb=document.createElement('canvas');thumb.width=180;thumb.height=180;
      const tc=thumb.getContext('2d'); const side=Math.min(w,h);tc.drawImage(img,(w-side)/2,(h-side)/2,side,side,0,0,180,180);
      const thumbUrl=thumb.toDataURL();
      const hex=ColorEngine.parseHex($('hex').value)?.hex||appliedHex;
      candidate=new Worker(workerUrl);
      const id=++job;
      const data=await new Promise((resolve,reject)=>{
        candidate.onmessage=({data})=>data.error?reject(Error(data.error)):resolve(data);
        candidate.onerror=()=>reject(Error('Não foi possível processar esta imagem. Tente um arquivo menor.'));
        candidate.postMessage({type:'init',id,hex,pixels:pixels.buffer},[pixels.buffer]);
      });
      if(version!==loadVersion) {candidate.terminate();return;}
      worker?.terminate();worker=candidate;
      worker.onerror=()=>{setBusy(false);status();notify('O processamento foi interrompido. Reenvie a imagem para continuar.');};
      original.width=result.width=w;original.height=result.height=h;
      original.getContext('2d').drawImage(scratch,0,0);scratch.width=scratch.height=1;
      colorPixels=new Uint8ClampedArray(data.pixels);neutralPixels=null;
      sourceName=name;appliedHex=hex;ready=true;view='color';
      $('thumbnail').src=thumbUrl;$('filename').textContent=name;$('filename').title=name;
      $('dimensions').textContent=`${w} × ${h} px`;
      $('hex').value=hex;$('hex-error').textContent='';$('hex').setAttribute('aria-invalid','false');
      updateSwatch();updateExtremeNote();setBusy(false);displayView();viewer.reset(w,h);
    } catch(error) {
      candidate?.terminate();
      if(version===loadVersion) {setBusy(false);status();notify(error.message||'Não foi possível abrir a imagem. Use PNG, JPG ou WebP.');}
    } finally {if(revoke) URL.revokeObjectURL(url);}
  }
  function upload(file) {
    if(!file) return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)) {notify('Formato não suportado. Escolha uma imagem PNG, JPG ou WebP.');return;}
    if(file.size>40*1024*1024) {notify('A imagem excede 40 MB. Escolha um arquivo menor.');return;}
    loadImage(URL.createObjectURL(file),file.name.replace(/\.[^.]+$/,''),true);
  }
  const preview=document.querySelector('.preview');
  const outsidePreview=[document.querySelector('.header'),document.querySelector('.intro'),document.querySelector('.settings'),document.querySelector('.footer')];
  function expand(value) {
    preview.classList.toggle('expanded',value);document.body.classList.toggle('inspecting',value);
    $('expand').setAttribute('aria-pressed',String(value));$('expand').setAttribute('aria-label',value?'Sair da inspeção expandida':'Expandir área de inspeção');
    $('expand').querySelector('span').textContent=value?'Voltar · Esc':'Expandir';
    outsidePreview.forEach(el=>el.inert=value);viewer.layout();$('expand').focus({preventScroll:true});
  }
  $('expand').onclick=()=>expand(!preview.classList.contains('expanded'));
  document.addEventListener('keydown',e=>{
    if(!preview.classList.contains('expanded'))return;
    if(e.key==='Escape'){e.preventDefault();expand(false);}
    if(e.key==='Tab'){
      const focusable=[...preview.querySelectorAll('button:not(:disabled),input,[tabindex="0"]')],first=focusable[0],last=focusable.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  $('upload').onclick=()=>$('file').click();
  $('file').onchange=()=>{upload($('file').files[0]);$('file').value='';};
  $('hex').oninput=()=>{updateSwatch();$('hex-error').textContent='';$('hex').removeAttribute('aria-invalid');};
  $('color-form').onsubmit=e=>{e.preventDefault();const parsed=validate();if(parsed&&!busy){$('hex').value=parsed.hex;updateSwatch();render(parsed.hex);}};
  document.querySelectorAll('[data-hex]').forEach(b=>b.onclick=()=>{if(busy)return;$('hex').value=b.dataset.hex;validate();updateSwatch();render(b.dataset.hex);});
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if(busy||!ready)return;if(b.dataset.view==='neutral'&&!neutralPixels){render('#A0A0A0','neutral');return;}view=b.dataset.view;displayView();});
  $('export').onclick=async()=>{
    if(!ready||busy||exporting) return;
    exporting=true;$('export').disabled=true;
    const exportHex=appliedHex,exportName=sourceName,exportWidth=result.width,exportHeight=result.height;
    try {
      const canvas=document.createElement('canvas');canvas.width=exportWidth;canvas.height=exportHeight;
      canvas.getContext('2d').putImageData(new ImageData(colorPixels,exportWidth,exportHeight),0,0);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=canvas.height=1;
      if(!blob)throw Error('Não foi possível gerar o PNG. Tente novamente.');
      const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Não foi possível preparar o download.'));reader.readAsDataURL(blob);});
      const link=$('download-png');link.href=dataUrl;
      link.download=`${exportName.replace(/[^\p{L}\p{N}_-]+/gu,'-')}-${exportHex.slice(1)}.png`;
      $('export-image').src=dataUrl;
      $('export-detail').textContent=`${exportName} · ${exportHex} · ${exportWidth} × ${exportHeight} px`;
      $('export-dialog').showModal();
    }catch(error){notify(error.message);}finally{exporting=false;$('export').disabled=busy||!ready;}
  };
  $('close-export').onclick=()=>$('export-dialog').close();
  let dragDepth=0;
  window.addEventListener('dragenter',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dragDepth++;$('drop-overlay').hidden=false;}});
  window.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
  window.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('drop-overlay').hidden=true;}});
  window.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop-overlay').hidden=true;upload(e.dataTransfer.files[0]);});
  window.addEventListener('pagehide',()=>{worker?.terminate();URL.revokeObjectURL(workerUrl);});
  updateSwatch();loadImage(window.SAMPLE_IMAGE,'Viscolinho');
})();
