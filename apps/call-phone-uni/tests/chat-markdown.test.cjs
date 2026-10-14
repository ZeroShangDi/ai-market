const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(globals={}) {
 const exports={},calls=[];
 const source=fs.readFileSync(path.join(__dirname,'../src/ui/chat-markdown.ts'),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
  {exports,require:()=>({toast:message=>calls.push(['toast',message])}),uni:{previewImage:value=>calls.push(['preview',value]),setClipboardData:value=>calls.push(['copy',value])},...globals});
 return {...exports,calls};
}
test('Markdown link taps open actual web pages in App and H5; images invoke preview',()=>{
 const app=load({plus:{runtime:{openURL:url=>app.calls.push(['open',url])}}});
 app.handleMarkdownClick({node:{type:'link',href:'https://example.org/source'}});
 app.handleMarkdownClick({node:{type:'image',href:'https://example.org/image.png'}});
 assert.equal(app.calls[0][0],'open');assert.equal(app.calls[1][0],'preview');
 const web=load({window:{open:(...args)=>web.calls.push(args)}});
 web.handleMarkdownClick({node:{type:'link',href:'https://example.org/'}});
 assert.deepEqual(web.calls[0],['https://example.org/','_blank','noopener,noreferrer']);
});
test('Markdown taps cannot execute script URLs or double-open links from ancestor tokens',()=>{
 const h=load();
 for(const href of ['javascript:alert(1)','file:///private','https://name:secret@example.org','https://example.org/\nfoo']) assert.equal(h.markdownHttpUrl(href),undefined);
 h.handleMarkdownClick({node:{type:'paragraph',href:'https://example.org/'}}); assert.equal(h.calls.length,0);
 h.handleMarkdownClick({node:{type:'link',href:'javascript:alert(1)'}});assert.equal(h.calls[0][0],'toast');
});
