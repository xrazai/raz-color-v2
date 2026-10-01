/* Oklab matrices by Björn Ottosson (public domain): bottosson.github.io/posts/oklab/ */
function ColorEngineFactory() {
  const clamp = (x, a=0, b=1) => Math.max(a, Math.min(b, x));
  const linear = x => (x/=255) <= .04045 ? x/12.92 : ((x+.055)/1.055)**2.4;
  const encode = x => 255*(x <= .0031308 ? 12.92*x : 1.055*Math.pow(x,1/2.4)-.055);
  const linearTable = Array.from({length:256}, (_,i)=>linear(i));
  function parseHex(value) {
    let hex=String(value).trim().replace(/^#/, '');
    if (/^[\da-f]{3}$/i.test(hex)) hex=hex.split('').map(c=>c+c).join('');
    if (!/^[\da-f]{6}$/i.test(hex)) return null;
    return {hex:'#'+hex.toUpperCase(), rgb:[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16))};
  }
  function toLab(r,g,b) {
    r=linearTable[r] ?? linear(r); g=linearTable[g] ?? linear(g); b=linearTable[b] ?? linear(b);
    const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b);
    const m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b);
    const s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
    return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
  }
  function toLinear(L,a,b) {
    const l=(L+.3963377774*a+.2158037573*b)**3;
    const m=(L-.1055613458*a-.0638541728*b)**3;
    const s=(L-.0894841775*a-1.291485548*b)**3;
    return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s];
  }
  function toRgb(L,a,b) { return toLinear(L,a,b).map(x=>encode(clamp(x))); }
  function inGamut(rgb) { return rgb.every(v=>v>=-1e-7 && v<=1.0000001); }
  function mappedRgb(L,a,b) {
    let rgb=toLinear(L,a,b);
    if(!inGamut(rgb)) {
      let low=0, high=1;
      for(let i=0;i<14;i++) { const mid=(low+high)/2; if(inGamut(toLinear(L,a*mid,b*mid))) low=mid; else high=mid; }
      rgb=toLinear(L,a*low,b*low);
    }
    return rgb.map(x=>Math.round(encode(clamp(x))));
  }
  function analyze(source) {
    const n=source.length/4, lightness=new Float32Array(n), histogram=new Float64Array(8192);
    let weight=0, min=1, max=0;
    for(let p=0,i=0;p<n;p++,i+=4) {
      if(!source[i+3]) continue;
      const L=toLab(source[i],source[i+1],source[i+2])[0];
      lightness[p]=L; const alpha=source[i+3]/255;
      histogram[Math.round(clamp(L)*8191)]+=alpha; weight+=alpha;
      min=Math.min(min,L); max=Math.max(max,L);
    }
    if(!weight) throw Error('A imagem não possui pixels visíveis.');
    let sum=0, median=0;
    for(let i=0;i<histogram.length;i++) { sum+=histogram[i]; if(sum>=weight/2){median=i/8191;break;} }
    return {lightness,median,uniform:max-min<.00001};
  }
  function makeLut(model,hex,options={}) {
    const parsed=parseHex(hex); if(!parsed) throw Error('HEX inválido.');
    const [L,sourceA,sourceB]=toLab(...parsed.rgb), lut=new Uint8ClampedArray(8192*3);
    const texture=clamp(options.texture??1,0,2),saturation=clamp(options.saturation??1,0,2);
    const angle=clamp(options.hue??0,-180,180)*Math.PI/180,exposure=2**(clamp(options.exposure??0,-2,2)/3);
    const a=(sourceA*Math.cos(angle)-sourceB*Math.sin(angle))*saturation;
    const b=(sourceA*Math.sin(angle)+sourceB*Math.cos(angle))*saturation;
    const anchor=model.uniform||texture===0 ? L : clamp(L,.08,.97);
    const contrast=clamp(anchor/Math.max(model.median,.01),.45,1.25);
    for(let i=0;i<8192;i++) {
      if(model.uniform) { lut.set(mappedRgb(clamp(L*exposure),a*exposure,b*exposure),i*3); continue; }
      const delta=(i/8191-model.median)*contrast*texture;
      const room=delta<0 ? anchor : 1-anchor;
      const next=anchor+Math.sign(delta)*room*(-Math.expm1(-Math.abs(delta)/Math.max(room,.00001)));
      lut.set(mappedRgb(clamp(next*exposure),a*exposure,b*exposure),i*3);
    }
    return lut;
  }
  function recolor(source,model,hex,options={}) {
    const lut=makeLut(model,hex,options), out=new Uint8ClampedArray(source.length);
    for(let p=0,i=0;i<source.length;p++,i+=4) {
      const j=Math.round(clamp(model.lightness[p])*8191)*3;
      out[i]=lut[j]; out[i+1]=lut[j+1]; out[i+2]=lut[j+2]; out[i+3]=source[i+3];
    }
    return out;
  }
  return {parseHex,toLab,toRgb,analyze,recolor};
}
const ColorEngine=ColorEngineFactory();
if(typeof module!=='undefined') module.exports=ColorEngine;
