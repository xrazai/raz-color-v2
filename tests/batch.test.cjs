const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../color-engine.js');const B=require('../batch-model.js');const Z=require('../zip-store.js');
const src=new Uint8ClampedArray([75,55,35,255,135,105,75,128,205,180,135,255]);
test('list validation is atomic and preserves order and duplicates',()=>{
  assert.deepEqual(B.parseList('#abc, 687b62;\n#ABC').colors,['#AABBCC','#687B62','#AABBCC']);
  assert.deepEqual(B.parseList('#abc,wrong,#fff').colors,[]);
  assert.deepEqual(B.parseList('#abc,wrong,#fff').invalid,['wrong']);
  assert.equal(B.parseList('').colors.length,0);
});
test('individual adjustments are not shared and texture changes do not overwrite them',()=>{
  const a=B.variant('#687B62'),b=B.variant('#BA7C63');a.adjustments.exposure=1;
  assert.equal(b.adjustments.exposure,0);assert.equal(B.settings(a,1.8).texture,1.8);assert.equal(a.adjustments.exposure,1);
});
test('export naming is sequential, unicode safe and cannot escape directories',()=>{
  assert.equal(B.filename('Anarruga',0),'Anarruga_01.png');assert.equal(B.filename('Anarruga',10),'Anarruga_11.png');
  assert.equal(B.filename('Linho São José',1),'Linho São José_02.png');
  assert.equal(B.filename(' ../bad/name:*? ',0).includes('/'),false);
  assert.equal(B.filename('',0),'Tecido_01.png');assert.equal(B.filename('CON',0),'_CON_01.png');
  assert.equal(B.filename('CON.fabric',0),'_CON.fabric_01.png');assert.equal(B.safeName('LPT1'),'_LPT1');
});
test('texture zero is flat and higher texture increases tonal separation',()=>{
 const m=C.analyze(src),flat=C.recolor(src,m,'#687B62',{texture:0});
 assert.deepEqual([...flat.slice(0,3)],[...flat.slice(8,11)]);
 const lo=C.recolor(src,m,'#687B62',{texture:.4}),hi=C.recolor(src,m,'#687B62',{texture:1.8});
 assert.ok(hi[8]-hi[0]>lo[8]-lo[0]);assert.equal(hi[7],128);
});
test('exposure, saturation and hue work independently without mutating source',()=>{
 const m=C.analyze(src),snapshot=src.slice(),base=C.recolor(src,m,'#BA7C63');
 const bright=C.recolor(src,m,'#BA7C63',{exposure:1}),gray=C.recolor(src,m,'#BA7C63',{saturation:0}),turned=C.recolor(src,m,'#BA7C63',{hue:90});
 assert.ok(bright[4]>base[4]);assert.ok(Math.max(...gray.slice(4,7))-Math.min(...gray.slice(4,7))<=1);
 assert.notDeepEqual(turned,base);assert.deepEqual(src,snapshot);
 assert.deepEqual(C.recolor(src,m,'#BA7C63',{texture:1,exposure:0,saturation:1,hue:0}),base);
});
test('ZIP stores exact bytes, UTF-8 filenames, CRC and correct directory offsets',async()=>{
 const files=[{name:'Anarruga_01.png',data:new Uint8Array([1,2,3,4])},{name:'São_02.png',data:new Uint8Array([9,8,7])}];
 const blob=Z.create(files),bytes=new Uint8Array(await blob.arrayBuffer()),v=new DataView(bytes.buffer);
 assert.equal(v.getUint32(0,true),0x04034b50);assert.equal(v.getUint16(6,true),0x800);assert.equal(v.getUint32(14,true),Z.crc32(files[0].data));
 const start=30+v.getUint16(26,true);assert.deepEqual(bytes.slice(start,start+4),files[0].data);
 const end=bytes.length-22;assert.equal(v.getUint32(end,true),0x06054b50);assert.equal(v.getUint16(end+10,true),2);
 assert.equal(v.getUint32(v.getUint32(end+16,true),true),0x02014b50);
 assert.equal(Z.crc32(new TextEncoder().encode('123456789')),0xcbf43926);
});
