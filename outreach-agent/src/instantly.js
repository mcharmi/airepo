const base='https://api.instantly.ai/api/v2';
function apiKey(){if(!process.env.INSTANTLY_API_KEY) throw new Error('INSTANTLY_API_KEY missing'); return process.env.INSTANTLY_API_KEY}
async function call(path,options={}){const r=await fetch(base+path,{...options,headers:{Authorization:'Bearer '+apiKey(),'Content-Type':'application/json',...(options.headers||{})}});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.message||b.error||('Instantly HTTP '+r.status));return b}
export async function addLead(lead){if(!process.env.INSTANTLY_CAMPAIGN_ID)throw new Error('INSTANTLY_CAMPAIGN_ID missing');return call('/leads',{method:'POST',body:JSON.stringify({campaign:process.env.INSTANTLY_CAMPAIGN_ID,...lead})})}
export async function createCampaign(data){return call('/campaigns',{method:'POST',body:JSON.stringify(data)})}
