// AbortSignal.any is not present in every Android System WebView.
export function linkedSignal(...signals){
 const controller=new AbortController(),cleanups=[];
 for(const signal of signals.filter(Boolean)){
  if(signal.aborted){controller.abort();break;}
  const abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});cleanups.push(()=>signal.removeEventListener('abort',abort));
 }
 return {signal:controller.signal,dispose:()=>cleanups.forEach(fn=>fn())};
}
