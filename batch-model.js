const BatchModel=(() => {
  let nextId=0;
  function parseList(text) {
    const tokens=String(text).trim().split(/[\s,;]+/).filter(Boolean),colors=[],invalid=[];
    for(const token of tokens){let value=token.replace(/^#/,'');if(/^[\da-f]{3}$/i.test(value))value=value.split('').map(c=>c+c).join('');if(/^[\da-f]{6}$/i.test(value))colors.push('#'+value.toUpperCase());else invalid.push(token);}
    return {colors:invalid.length?[]:colors,invalid};
  }
  function variant(hex){return {id:++nextId,hex,adjustments:{exposure:0,saturation:1,hue:0},thumb:null};}
  function settings(item,texture){return {...item.adjustments,texture};}
  function safeName(name){const clean=String(name).normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').replace(/^[.\s]+|[.\s]+$/g,'').slice(0,80).replace(/[.\s]+$/g,'')||'Tecido';return /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(clean)?'_'+clean:clean;}
  function filename(name,index){return `${safeName(name)}_${String(index+1).padStart(2,'0')}.png`;}
  return {parseList,variant,settings,safeName,filename};
})();
if(typeof module!=='undefined')module.exports=BatchModel;
