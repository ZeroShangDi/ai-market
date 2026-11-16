export function downloadNativeFile({native,url,token,body,title,onOpenError}){
 const name=String(title||'工作文件').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/^\.+/,'_').slice(0,120)||'工作文件';
 return new Promise((resolve,reject)=>{
  const task=native.downloader.createDownload(url,{method:'POST',data:JSON.stringify(body),filename:'_doc/work-results/'+Date.now()+'-'+name,timeout:60,retry:0},(download,status)=>{
   if(status!==200||!download.filename){reject(Error('FILE_UNAVAILABLE'));return;}
   native.io.resolveLocalFileSystemURL(download.filename,entry=>{
    if(!entry.isFile){reject(Error('FILE_UNAVAILABLE'));return;}
    native.runtime.openFile(download.filename,{},()=>onOpenError?.());
    resolve();
   },()=>reject(Error('FILE_UNAVAILABLE')));
  });
  task.setRequestHeader('Authorization','Bearer '+token);
  task.setRequestHeader('Content-Type','application/json');task.start();
 });
}
