/** Browser-independent encoding for the existing Android SAF reader's bounded documents. */
function utf8(text: string) {
  const bytes: number[]=[];
  for(const char of text){const point=char.codePointAt(0)!;if(point<128)bytes.push(point);else if(point<2048)bytes.push(192|(point>>6),128|(point&63));else if(point<65536)bytes.push(224|(point>>12),128|((point>>6)&63),128|(point&63));else bytes.push(240|(point>>18),128|((point>>12)&63),128|((point>>6)&63),128|(point&63));}
  return new Uint8Array(bytes);
}
export function multipartDocument(name:string, content:Uint8Array, boundary='container-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)) {
  if(!name || name.length>120 || /[\r\n"\\/\x00]/.test(name) || content.length>8*1024*1024)throw new Error('文档名称或大小无效');
  if(!/^[A-Za-z0-9-]{1,80}$/.test(boundary))throw new Error('Multipart boundary 无效');
  const head=utf8(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`),tail=utf8(`\r\n--${boundary}--\r\n`);
  const body=new Uint8Array(head.length+content.length+tail.length);body.set(head);body.set(content,head.length);body.set(tail,head.length+content.length);
  return {contentType:'multipart/form-data; boundary='+boundary,body};
}
