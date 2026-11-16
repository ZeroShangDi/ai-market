import {Bezier} from 'bezier-js';
const fail=()=>Object.assign(new Error('INVALID_GESTURE'),{code:'INVALID_GESTURE'});
/** Bounded, repeatable eased touch path; not an anti-detection guarantee. */
export function swipePath({from,to,width,height,durationMs=600,bendPx=12,samples=24}){
 if(![width,height,durationMs,bendPx,samples].every(Number.isFinite)||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||!Number.isInteger(durationMs)||durationMs<100||durationMs>5000||!Number.isInteger(samples)||samples<4||samples>120||samples>durationMs||Math.abs(bendPx)>100)throw fail();
 for(const p of [from,to])if(!p||![p.x,p.y].every(Number.isInteger)||p.x<0||p.y<0||p.x>=width||p.y>=height)throw fail();
 const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);if(length<1)throw fail();
 const clamp=(n,max)=>Math.max(0,Math.min(max-1,n));
 const control=f=>({x:clamp(from.x+dx*f-dy/length*bendPx,width),y:clamp(from.y+dy*f+dx/length*bendPx,height)});
 const c1=control(1/3),c2=control(2/3),curve=new Bezier(from,c1,c2,to);
 return Array.from({length:samples+1},(_,i)=>{const t=i/samples,p=curve.get(t*t*(3-2*t));return {x:Math.round(p.x),y:Math.round(p.y),timeMs:Math.round(durationMs*t)};});
}
export function w3cTouchActions(points){
 if(!Array.isArray(points)||points.length<2||points.length>121)throw fail();
 let previous=-1;for(const p of points){if(![p.x,p.y,p.timeMs].every(Number.isInteger)||p.x<0||p.y<0||p.timeMs<0||p.timeMs<=previous)throw fail();previous=p.timeMs;}
 const first=points[0];if(first.timeMs!==0)throw fail();
 return {actions:[{type:'pointer',id:'finger',parameters:{pointerType:'touch'},actions:[{type:'pointerMove',duration:0,origin:'viewport',x:first.x,y:first.y},{type:'pointerDown',button:0},...points.slice(1).map((p,i)=>({type:'pointerMove',duration:p.timeMs-points[i].timeMs,origin:'viewport',x:p.x,y:p.y})),{type:'pointerUp',button:0}]}]};
}
