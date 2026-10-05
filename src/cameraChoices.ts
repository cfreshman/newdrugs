export interface CameraChoice {id:string;label:string;facing:'user'|'environment'|null}
const front=/\b(front|facetime|user)\b/i,back=/\b(back|rear|environment)\b/i,secondary=/\b(ultra\s?wide|telephoto|macro|depth)\b/i;
function facing(device:MediaDeviceInfo):CameraChoice['facing']{
 const capabilities=(device as InputDeviceInfo).getCapabilities?.().facingMode;
 const modes:string[]=Array.isArray(capabilities)?capabilities:typeof capabilities==='string'?[capabilities]:[];
 if(modes.includes('environment')||back.test(device.label))return 'environment';
 if(modes.includes('user')||front.test(device.label))return 'user';
 return null;
}
export function majorCameras(devices:MediaDeviceInfo[],currentId:string,currentFacing:string|undefined,touch:boolean):CameraChoice[]{
 const found=[...new Map(devices.filter(device=>device.kind==='videoinput'&&device.deviceId).map(device=>[device.deviceId,{id:device.deviceId,label:device.label||'Camera',facing:facing(device)}])).values()];
 if(!touch)return found;
 const preferred=(kind:'user'|'environment')=>found.filter(device=>device.facing===kind).sort((a,b)=>Number(secondary.test(a.label))-Number(secondary.test(b.label)))[0];
 const current=found.find(device=>device.id===currentId);
 if(current&&!current.facing&&['user','environment'].includes(currentFacing||''))current.facing=currentFacing as CameraChoice['facing'];
 const chosen=[preferred('user'),preferred('environment')].filter((device):device is CameraChoice=>Boolean(device));
 if(current&&!chosen.some(device=>device.id===current.id))chosen.unshift(current);
 if(chosen.length<2){const other=found.find(device=>!chosen.some(item=>item.id===device.id));if(other)chosen.push(other);}
 return chosen.slice(0,2);
}
