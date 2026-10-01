const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../color-engine.js');
const pixels = (colors) => new Uint8ClampedArray(colors.flatMap(c => [...c.slice(0,3), c[3] ?? 255]));
test('HEX accepts shorthand and rejects malformed values', () => {
  assert.equal(C.parseHex(' abc ').hex, '#AABBCC');
  for(const v of ['', '#12345', '#1234567', 'red', '#GG0000']) assert.equal(C.parseHex(v), null);
});
test('sRGB/Oklab conversion roundtrips reference colors', () => {
  for (const rgb of [[0,0,0],[255,255,255],[255,0,0],[0,255,0],[0,0,255],[104,123,98]]) {
    const back=C.toRgb(...C.toLab(...rgb));
    back.forEach((v,i)=>assert.ok(Math.abs(v-rgb[i])<0.001));
  }
});
test('uniform fabric matches requested HEX within one quantization step', () => {
  const source=pixels([[140,90,40],[140,90,40],[140,90,40]]);
  const model=C.analyze(source);
  for(const hex of ['#687B62','#FFFFFF','#000000','#FF0000','#0000FF']) {
    const target=C.parseHex(hex), out=C.recolor(source,model,hex);
    target.rgb.forEach((v,i)=>assert.ok(Math.abs(out[i]-v)<=1,hex));
  }
});
test('neutral removes source chroma and keeps tonal order', () => {
  const src=pixels([[60,30,10],[150,95,65],[225,185,130]]), m=C.analyze(src);
  const out=C.recolor(src,m,'#888888');
  for(let i=0;i<out.length;i+=4) assert.ok(Math.max(...out.slice(i,i+3))-Math.min(...out.slice(i,i+3))<=1);
  assert.ok(out[0]<out[4] && out[4]<out[8]);
});
test('alpha preserved and hidden pixels excluded from statistics', () => {
  const src=pixels([[255,255,255,0],[100,70,40,255],[100,70,40,128]]), m=C.analyze(src);
  const out=C.recolor(src,m,'#687B62');
  assert.deepEqual([out[3],out[7],out[11]],[0,255,128]);
  assert.ok(Math.abs(out[4]-104)<=1);
  assert.throws(()=>C.analyze(pixels([[0,0,0,0]])),/visíveis/);
});
test('saturated and extreme targets retain visible texture without invalid channels', () => {
  const src=pixels([[70,50,30],[150,125,90],[220,200,165]]), m=C.analyze(src);
  for(const hex of ['#FF0000','#00FF00','#0000FF','#000000','#FFFFFF']) {
    const out=C.recolor(src,m,hex);
    const ls=[0,4,8].map(i=>C.toLab(...out.slice(i,i+3))[0]);
    assert.ok(ls[0]<ls[1] && ls[1]<ls[2],hex);
  }
});
