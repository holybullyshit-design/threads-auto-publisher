const express=require('express'),router=express.Router();
const insights=require('./instagramInsights'),growth=require('./instagramGrowth');
const asyncRoute=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(e=>res.status(e.status||500).json({error:e.message||'분석 요청 실패'}));
function response(snapshot,key,days){return {snapshot,diagnosis:insights.diagnose(snapshot),experiments:growth.summary(key),history:insights.history(key).filter(s=>s.period.days===days).slice(-60).reverse().map(s=>({fetchedAt:s.fetchedAt,period:s.period,metrics:s.metrics}))};}
router.get('/',asyncRoute(async(req,res)=>{const key=String(req.query.accountKey||'palja'),days=Number(req.query.days||7);const snapshot=await insights.refresh(key,days);res.json(response(snapshot,key,days));}));
router.post('/refresh',asyncRoute(async(req,res)=>{const key=String(req.body?.accountKey||'palja'),days=Number(req.body?.days||7);const snapshot=await insights.refresh(key,days,{force:true});res.json(response(snapshot,key,days));}));
router.post('/proposals',asyncRoute(async(req,res)=>{const key=String(req.body?.accountKey||''),days=Number(req.body?.days||7);const snapshot=await insights.refresh(key,days);res.json({experiments:growth.propose(snapshot)});}));
router.post('/experiments/:id/decision',asyncRoute(async(req,res)=>res.json({experiment:growth.decide(req.params.id,req.body?.decision,req.body?.confirm)})));
router.get('/pilot/palja',asyncRoute(async(req,res)=>res.json({package:growth.paljaPilot(String(req.query.date||''))})));
module.exports=router;
