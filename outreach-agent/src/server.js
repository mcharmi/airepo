import express from 'express';
import {addLead,createCampaign} from './instantly.js';
const app=express(); app.use(express.json({limit:'1mb'}));
const authorized=req=>process.env.OUTREACH_SHARED_SECRET&&req.get('authorization')==='Bearer '+process.env.OUTREACH_SHARED_SECRET;
app.get('/health',(_q,r)=>r.json({ok:true,service:'outreach-agent',version:'0.1.0'}));
app.post('/internal/leads',async(req,res)=>{if(!authorized(req))return res.status(401).json({error:'unauthorized'});try{res.status(201).json(await addLead(req.body))}catch(e){res.status(502).json({error:'instantly_error',message:e.message})}});
app.post('/internal/campaigns',async(req,res)=>{if(!authorized(req))return res.status(401).json({error:'unauthorized'});try{res.status(201).json(await createCampaign(req.body))}catch(e){res.status(502).json({error:'instantly_error',message:e.message})}});
const port=Number(process.env.PORT||3000); app.listen(port,'0.0.0.0',()=>console.log('outreach-agent listening on '+port));
