// Shared image-space camera: changing views never edits the underlying pixels.
class FabricViewer {
  constructor(stage, controls) {
    this.stage=stage; this.controls=controls; this.figures=[...stage.querySelectorAll('figure')];
    this.width=1; this.height=1; this.scale=1; this.x=0; this.y=0; this.fitting=true; this.pointers=new Map();
    controls.fit.onclick=()=>this.fit(); controls.actual.onclick=()=>this.zoom(1);
    controls.minus.onclick=()=>this.zoom(this.scale/1.25); controls.plus.onclick=()=>this.zoom(this.scale*1.25);
    const commitPercent=()=>{const value=Number(controls.percent.value.replace('%','').replace(',','.').trim());if(Number.isFinite(value)&&value>0)this.zoom(value/100);else this.draw();};
    controls.percent.onchange=commitPercent;
    controls.percent.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commitPercent();stage.focus();} if(e.key==='Escape'){this.draw();stage.focus();}};
    stage.addEventListener('wheel',e=>{if(this.width===1)return;e.preventDefault();const p=this.point(e);this.zoom(this.scale*Math.exp(-e.deltaY*(e.deltaMode===1?.04:.002)),p);},{passive:false});
    stage.addEventListener('dblclick',e=>{if(this.scale>=1&&!this.fitting)this.fit();else this.zoom(1,this.point(e));});
    stage.addEventListener('pointerdown',e=>this.down(e));
    stage.addEventListener('pointermove',e=>this.move(e));
    for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,e=>{this.pointers.delete(e.pointerId);this.stage.classList.toggle('panning',this.pointers.size>0);});
    stage.addEventListener('keydown',e=>{
      if(['+','=','-','0','1','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))e.preventDefault();
      if(e.key==='+'||e.key==='=')this.zoom(this.scale*1.25);
      if(e.key==='-')this.zoom(this.scale/1.25);
      if(e.key==='0')this.fit();if(e.key==='1')this.zoom(1);
      if(e.key.startsWith('Arrow')){const d=e.shiftKey?120:40;this.x+=e.key==='ArrowLeft'?d:e.key==='ArrowRight'?-d:0;this.y+=e.key==='ArrowUp'?d:e.key==='ArrowDown'?-d:0;this.draw();}
    });
    this.observer=new ResizeObserver(()=>this.layout());this.observer.observe(stage);
  }
  pane() {return this.figures.find(f=>!f.hidden).getBoundingClientRect();}
  fitScale() {const p=this.pane();return Math.min((p.width-24)/this.width,(p.height-24)/this.height,1);}
  point(e) {const pane=this.figures.find(f=>!f.hidden&&f.contains(e.target))||this.figures.find(f=>!f.hidden);const r=pane.getBoundingClientRect();return {x:e.clientX-r.left-r.width/2,y:e.clientY-r.top-r.height/2};}
  reset(width,height) {this.width=width;this.height=height;this.pointers.clear();this.fit();}
  fit() {this.fitting=true;this.x=this.y=0;this.layout();}
  layout() {if(this.fitting)this.scale=Math.max(.001,this.fitScale());this.draw();}
  zoom(value,p={x:0,y:0}) {
    const next=Math.max(Math.min(.05,Math.max(.001,this.fitScale())),Math.min(8,value));
    this.x=p.x-(p.x-this.x)*next/this.scale;this.y=p.y-(p.y-this.y)*next/this.scale;
    this.scale=next;this.fitting=false;this.draw();
  }
  draw() {
    const p=this.pane(),limitX=Math.max(0,(this.width*this.scale-p.width)/2+12),limitY=Math.max(0,(this.height*this.scale-p.height)/2+12);
    this.x=Math.max(-limitX,Math.min(limitX,this.x));this.y=Math.max(-limitY,Math.min(limitY,this.y));
    for(const figure of this.figures){const c=figure.querySelector('canvas');c.style.width=this.width+'px';c.style.height=this.height+'px';c.style.transform=`translate(-50%, -50%) translate(${this.x}px, ${this.y}px) scale(${this.scale})`;}
    this.controls.percent.value=`${Math.round(this.scale*1000)/10}%`;
    this.controls.fit.setAttribute('aria-pressed',String(this.fitting));this.controls.actual.setAttribute('aria-pressed',String(Math.abs(this.scale-1)<.00001));
    this.controls.minus.disabled=this.scale<=Math.min(.05,this.fitScale())+.00001;this.controls.plus.disabled=this.scale>=8;
    this.stage.dataset.zoom=String(this.scale);this.stage.dataset.pan=`${this.x},${this.y}`;
    this.stage.classList.toggle('pixel-detail',this.scale>=2);
  }
  down(e) {
    if(e.button!==0||this.width===1)return;
    e.preventDefault();this.stage.focus({preventScroll:true});this.stage.setPointerCapture(e.pointerId);
    if(!this.pointers.size)this.gesturePane=e.target.closest('figure')||this.figures.find(f=>!f.hidden);
    this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});this.stage.classList.add('panning');
  }
  move(e) {
    if(!this.pointers.has(e.pointerId))return;
    const before=[...this.pointers.values()],old=this.pointers.get(e.pointerId),dx=e.clientX-old.x,dy=e.clientY-old.y;
    this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(this.pointers.size===2){
      const after=[...this.pointers.values()],dist=a=>Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
      const r=this.gesturePane.getBoundingClientRect(),center={x:(before[0].x+before[1].x)/2-r.left-r.width/2,y:(before[0].y+before[1].y)/2-r.top-r.height/2};
      if(dist(before)>0)this.zoom(this.scale*dist(after)/dist(before),center);
      this.x+=dx/2;this.y+=dy/2;
    }else if(this.pointers.size===1){this.x+=dx;this.y+=dy;}
    this.draw();
  }
}
