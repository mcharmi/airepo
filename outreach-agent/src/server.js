import express from 'express';
import {addLead,createCampaign} from './instantly.js';

const app=express();
app.use(express.json({limit:'1mb'}));
const authorized=req=>process.env.OUTREACH_SHARED_SECRET&&req.get('authorization')==='Bearer '+process.env.OUTREACH_SHARED_SECRET;

app.get('/health',(_q,r)=>r.json({ok:true,service:'outreach-agent',version:'0.2.0'}));
app.post('/internal/leads',async(req,res)=>{if(!authorized(req))return res.status(401).json({error:'unauthorized'});try{res.status(201).json(await addLead(req.body))}catch(e){console.error('lead error',e.message);res.status(502).json({error:'instantly_error',message:e.message})}});
app.post('/internal/campaigns',async(req,res)=>{if(!authorized(req))return res.status(401).json({error:'unauthorized'});try{res.status(201).json(await createCampaign(req.body))}catch(e){console.error('campaign error',e.message);res.status(502).json({error:'instantly_error',message:e.message})}});

async function bootstrap(){
 if(process.env.INSTANTLY_BOOTSTRAP!=='1') return;
 try{
  console.log('Instantly bootstrap starting');
  const campaign=await createCampaign({
   name:'Mediaquadrat Reputation Management',
   campaign_schedule:{schedules:[{name:'Werktags',timing:{from:'09:00',to:'17:00'},days:{'0':false,'1':true,'2':true,'3':true,'4':true,'5':true,'6':false},timezone:'Etc/GMT-2'}]},
   sequences:[{steps:[
    {type:'email',delay:0,variants:[{subject:'Ihre Google-Bewertung',body:'{{personalization}}'}]},
    {type:'email',delay:3,variants:[{subject:'Re: Ihre Google-Bewertung',body:'Guten Tag,\n\nich wollte kurz nachfragen, ob Sie meine Nachricht zur angesprochenen Google-Bewertung gesehen haben. Kosten entstehen nur im Erfolgsfall.\n\nFreundliche Grüße\nChristopher Kühn\nMediaquadrat'}]},
    {type:'email',delay:4,variants:[{subject:'Re: Ihre Google-Bewertung',body:'Guten Tag,\n\nkurze letzte Rückfrage zur angesprochenen Google-Bewertung. Falls Sie eine Prüfung wünschen, nutzen Sie bitte den Link aus meiner ersten Nachricht.\n\nFreundliche Grüße\nChristopher Kühn\nMediaquadrat'}]}
   ]}],
   stop_on_reply:true,text_only:true,open_tracking:false,link_tracking:false,daily_limit:25,email_gap:10
  });
  console.log('INSTANTLY_BOOTSTRAP_CREATED campaign_id='+String(campaign.id||campaign.campaign_id||'unknown'));
 }catch(e){console.error('INSTANTLY_BOOTSTRAP_FAILED '+e.message)}
}
const port=Number(process.env.PORT||3000);
app.listen(port,'0.0.0.0',()=>{console.log('outreach-agent listening on '+port); bootstrap()});
