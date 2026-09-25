const base = 'https://api.instantly.ai/api/v2';
function key(){if(!process.env.INSTANTLY_API_KEY) throw new Error('INSTANTLY_API_KEY missing'); return process.env.INSTANTLY_API_KEY}
export function instantlyConfigured(){return Boolean(process.env.INSTANTLY_API_KEY && process.env.INSTANTLY_CAMPAIGN_ID)}
async function call(path,options={}){const r=await fetch(base+path,{...options,headers:{Authorization:'Bearer '+key(),'Content-Type':'application/json',...(options.headers||{})}});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.message||body.error||('Instantly HTTP '+r.status));return body}
export async function addLead({email,companyName,website,phone,personalization,payload={}}){
 if(!process.env.INSTANTLY_CAMPAIGN_ID) throw new Error('INSTANTLY_CAMPAIGN_ID missing');
 return call('/leads',{method:'POST',body:JSON.stringify({
  campaign:process.env.INSTANTLY_CAMPAIGN_ID,
  email,
  company_name:companyName||undefined,
  website:website||undefined,
  phone:phone||undefined,
  personalization:personalization||undefined,
  custom_variables:payload
 })});
}
