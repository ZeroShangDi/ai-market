/** Only a browser's exact same-origin form may lose Origin at the trusted proxy. */
export function sameOriginHost(origin:unknown,host:unknown):boolean {
 if(typeof origin!=='string'||typeof host!=='string')return false;
 try{const value=new URL(origin);return ['http:','https:'].includes(value.protocol)&&value.origin===origin&&value.host===host;}catch{return false;}
}
