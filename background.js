const STORAGE_KEY='chatgptTextAutoStateV1';
const DEFAULTS={stableSec:5,nextDelaySec:1,responseTimeoutMin:30,saveEachResponse:true,cdpFallback:true,composerSelector:'',sendSelector:''};
let state={run:null,logs:[]};
let loaded=false;
const ready=(async()=>{const got=await chrome.storage.local.get(STORAGE_KEY);if(got[STORAGE_KEY])state=got[STORAGE_KEY];loaded=true;})();

chrome.runtime.onInstalled.addListener(()=>{try{chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});}catch(_){}});
chrome.runtime.onStartup.addListener(()=>{try{chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});}catch(_){}});

function nowIso(){return new Date().toISOString();}
function uid(p='id'){return `${p}_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;}
function safeName(s){return String(s||'PROJECT_001').trim().replace(/[\\/:*?"<>|]/g,'_').slice(0,120)||'PROJECT_001';}
function clone(v){return JSON.parse(JSON.stringify(v));}
function log(level,message,data=null){state.logs ||= [];state.logs.push({ts:nowIso(),level,message,data});if(state.logs.length>300)state.logs.splice(0,state.logs.length-300);save();}
let saveTimer=null;
function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>chrome.storage.local.set({[STORAGE_KEY]:state}),80);}
async function saveNow(){clearTimeout(saveTimer);await chrome.storage.local.set({[STORAGE_KEY]:state});}
function isChatUrl(u=''){return /^https:\/\/(chatgpt\.com|chat\.openai\.com)(?:\/|$)/i.test(String(u||''));}
function conversationId(u=''){try{const x=new URL(u);const m=x.pathname.match(/(?:^|\/)c\/([^/?#]+)/i);return m?m[1]:'';}catch(_){return '';}}

async function ensureContent(tabId){
  try{const p=await chrome.tabs.sendMessage(tabId,{type:'PING_TEXT_AUTO'});if(p?.ok)return {ok:true,method:'PING'};}catch(_){}
  try{await chrome.scripting.executeScript({target:{tabId},files:['content.js']});await new Promise(r=>setTimeout(r,350));const p=await chrome.tabs.sendMessage(tabId,{type:'PING_TEXT_AUTO'});if(p?.ok)return {ok:true,method:'INJECT'};}catch(e){return {ok:false,error:String(e?.message||e)};}
  return {ok:false,error:'CONTENT_SCRIPT_UNAVAILABLE'};
}
async function validateTarget(run,tabId){
  let tab;try{tab=await chrome.tabs.get(tabId);}catch(_){return {ok:false,error:'TARGET_TAB_NOT_FOUND'};}
  if(!isChatUrl(tab.url||''))return {ok:false,error:'TARGET_TAB_NOT_CHATGPT'};
  const id=conversationId(tab.url||'');
  if(run.conversationId && id && id!==run.conversationId)return {ok:false,error:'CONVERSATION_CHANGED'};
  if(run.conversationId && !id && /\/c\//.test(String(run.conversationUrl||'')))return {ok:false,error:'CONVERSATION_CHANGED'};
  if(!run.conversationId && id)run.conversationId=id;
  run.conversationUrl=tab.url||run.conversationUrl;
  return {ok:true,tab};
}
function totalTurns(cfg){return (cfg.sendInitial?1:0)+Number(cfg.repeatCount||0);}
function payloadFor(run,index){
  if(run.config.sendInitial && index===0)return {kind:'INITIAL',text:run.initialText};
  const ordinal=index-(run.config.sendInitial?1:0)+1;
  return {kind:`REPEAT_${ordinal}`,text:run.repeatText};
}

async function startRun(tabId,config){
  if(state.run?.status==='RUNNING')return {ok:false,error:'RUN_ALREADY_RUNNING'};
  tabId=Number(tabId);if(!tabId)return {ok:false,error:'NO_TAB'};
  let tab;try{tab=await chrome.tabs.get(tabId);}catch(_){return {ok:false,error:'TAB_NOT_FOUND'};}
  if(!isChatUrl(tab.url||''))return {ok:false,error:'TAB_NOT_CHATGPT'};
  const cfg={...DEFAULTS,...config};
  cfg.sendInitial=cfg.sendInitial!==false;
  cfg.initialText=String(config?.initialText??'');cfg.repeatText=String(config?.repeatText??'');
  cfg.repeatCount=Math.max(0,Math.min(9999,Math.floor(Number(cfg.repeatCount||0))));
  cfg.stableSec=Math.max(2,Math.min(60,Number(cfg.stableSec||5)));
  cfg.nextDelaySec=Math.max(0,Math.min(60,Number(cfg.nextDelaySec||1)));
  cfg.responseTimeoutMin=Math.max(1,Math.min(360,Number(cfg.responseTimeoutMin||30)));
  if(cfg.sendInitial && !cfg.initialText.trim())return {ok:false,error:'INITIAL_TEXT_EMPTY'};
  if(cfg.repeatCount>0 && !cfg.repeatText.trim())return {ok:false,error:'REPEAT_TEXT_EMPTY'};
  if(!cfg.sendInitial && cfg.repeatCount===0)return {ok:false,error:'NO_TURNS'};
  const cs=await ensureContent(tabId);if(!cs.ok)return cs;
  state.run={id:uid('run'),status:'RUNNING',phase:'READY',startedAt:nowIso(),finishedAt:null,targetTabId:tabId,conversationUrl:tab.url||'',conversationId:conversationId(tab.url||''),config:{sendInitial:cfg.sendInitial,repeatCount:cfg.repeatCount,stableSec:cfg.stableSec,nextDelaySec:cfg.nextDelaySec,responseTimeoutMin:cfg.responseTimeoutMin,saveEachResponse:cfg.saveEachResponse!==false,cdpFallback:cfg.cdpFallback!==false,composerSelector:String(cfg.composerSelector||''),sendSelector:String(cfg.sendSelector||'')},initialText:cfg.initialText,repeatText:cfg.repeatText,projectName:safeName(cfg.projectName),totalTurns:totalTurns(cfg),repeatSent:0,outputs:[],outputMeta:[],pendingTurn:null,error:'',completionReason:'',lastVerification:''};
  log('INFO','Started long-payload text run',{tabId,totalTurns:state.run.totalTurns,initialChars:cfg.initialText.length,repeatChars:cfg.repeatText.length,repeatCount:cfg.repeatCount});
  await saveNow();setTimeout(()=>pump().catch(e=>failRun(String(e?.message||e))),150);return {ok:true,runId:state.run.id};
}
async function pump(){
  const run=state.run;if(!run||run.status!=='RUNNING'||run.pendingTurn)return;
  const index=run.outputs.length;
  if(index>=run.totalTurns)return finishRun('ALL_TURNS_COMPLETED');
  const target=await validateTarget(run,run.targetTabId);if(!target.ok)return failRun(target.error);
  const cs=await ensureContent(run.targetTabId);if(!cs.ok)return failRun(cs.error);
  const p=payloadFor(run,index);
  const turn={id:uid('turn'),index,kind:p.kind,prompt:p.text,startedAt:nowIso(),sentConfirmed:false,stage:'PREPARE',conversationId:run.conversationId||conversationId(target.tab.url||''),baseline:null};
  run.pendingTurn=turn;run.phase='PREPARE_TURN';save();
  const r=await chrome.tabs.sendMessage(run.targetTabId,{type:'RUN_TEXT_TURN',turn,settings:{stableSec:run.config.stableSec,responseTimeoutMin:run.config.responseTimeoutMin,cdpFallback:run.config.cdpFallback,selectors:{composer:run.config.composerSelector,send:run.config.sendSelector}}}).catch(e=>({ok:false,error:String(e?.message||e)}));
  if(!r?.ok)return failRun(r?.error||'TURN_START_FAILED');
}
async function finishRun(reason){const run=state.run;if(!run)return;run.status='DONE';run.phase='DONE';run.finishedAt=nowIso();run.completionReason=reason;run.pendingTurn=null;await exportCombined(run);log('INFO','Run completed',{reason,turns:run.outputs.length});await saveNow();}
function failRun(err){const run=state.run;if(!run)return;run.status='STOPPED';run.phase='ERROR';run.error=String(err||'UNKNOWN_ERROR');run.finishedAt=nowIso();log('ERROR','Run stopped',{error:run.error,turn:run.pendingTurn?.index+1});save();}
async function stopRun(){await ready;if(!state.run)return {ok:false,error:'NO_RUN'};state.run.status='STOPPED';state.run.phase='STOPPED_BY_USER';state.run.finishedAt=nowIso();state.run.completionReason='USER_STOP';save();return {ok:true};}
async function resumeRun(tabId){
  await ready;const run=state.run;if(!run||run.status!=='STOPPED')return {ok:false,error:'RUN_NOT_STOPPED'};
  tabId=Number(tabId||run.targetTabId);let tab;try{tab=await chrome.tabs.get(tabId);}catch(_){return {ok:false,error:'TAB_NOT_FOUND'};}
  if(!isChatUrl(tab.url||''))return {ok:false,error:'TAB_NOT_CHATGPT'};
  const id=conversationId(tab.url||'');if(run.conversationId&&id&&id!==run.conversationId)return {ok:false,error:'CONVERSATION_CHANGED'};
  const cs=await ensureContent(tabId);if(!cs.ok)return cs;
  if(run.pendingTurn && !run.pendingTurn.sentConfirmed && /SEND_CONFIRM_UNCERTAIN/.test(String(run.error||''))) return {ok:false,error:'UNCERTAIN_SEND: hãy kiểm tra cuộc chat trước khi tạo run mới; tool không tự gửi lại để tránh trùng.'};
  run.targetTabId=tabId;run.conversationUrl=tab.url||run.conversationUrl;if(!run.conversationId&&id)run.conversationId=id;run.status='RUNNING';run.error='';run.finishedAt=null;
  if(run.pendingTurn?.sentConfirmed){run.phase='RECOVER_WAIT_RESPONSE';save();const rr=await chrome.tabs.sendMessage(tabId,{type:'RECOVER_TEXT_TURN',turn:run.pendingTurn,settings:{stableSec:run.config.stableSec,responseTimeoutMin:run.config.responseTimeoutMin,cdpFallback:run.config.cdpFallback,selectors:{composer:run.config.composerSelector,send:run.config.sendSelector}}}).catch(e=>({ok:false,error:String(e?.message||e)}));if(!rr?.ok)return failRun(rr?.error||'RECOVERY_START_FAILED'),{ok:false,error:rr?.error};}
  else {run.pendingTurn=null;run.phase='READY';save();setTimeout(()=>pump().catch(e=>failRun(String(e?.message||e))),150);}
  return {ok:true};
}

let autoRecoverBusy=false;
async function nudgePendingResponse(tabId,reason='NUDGE'){
  await ready;const run=state.run,turn=run?.pendingTurn;
  if(autoRecoverBusy||!run||run.status!=='RUNNING'||!turn?.sentConfirmed||Number(tabId)!==Number(run.targetTabId))return;
  autoRecoverBusy=true;
  try{
    const target=await validateTarget(run,run.targetTabId);if(!target.ok)return;
    const cs=await ensureContent(run.targetTabId);if(!cs.ok)return;
    const ping=await chrome.tabs.sendMessage(run.targetTabId,{type:'PING_TEXT_AUTO'}).catch(()=>null);
    if(ping?.activeTurnId===turn.id||ping?.activeTurnId)return;
    const rr=await chrome.tabs.sendMessage(run.targetTabId,{type:'RECOVER_TEXT_TURN',turn,settings:{stableSec:run.config.stableSec,responseTimeoutMin:run.config.responseTimeoutMin,cdpFallback:run.config.cdpFallback,selectors:{composer:run.config.composerSelector,send:run.config.sendSelector}}}).catch(e=>({ok:false,error:String(e?.message||e)}));
    if(rr?.ok){run.phase='RECOVER_WAIT_RESPONSE';log('INFO','Auto recovery attached',{reason,turn:turn.index+1,tabId:run.targetTabId});save();}
  }finally{autoRecoverBusy=false;}
}
chrome.tabs.onActivated.addListener(info=>{nudgePendingResponse(info.tabId,'TAB_ACTIVATED').catch(()=>{});});
chrome.tabs.onUpdated.addListener((tabId,changeInfo)=>{if(changeInfo.status==='complete')nudgePendingResponse(tabId,'TAB_RELOADED_OR_RESTORED').catch(()=>{});});
ready.then(()=>setTimeout(()=>{const id=state.run?.targetTabId;if(id)nudgePendingResponse(id,'SERVICE_WORKER_RESTART').catch(()=>{});},800));

async function onTextEvent(tabId,event){
  const run=state.run,turn=run?.pendingTurn;if(!run||run.status!=='RUNNING'||tabId!==run.targetTabId)return {ok:false,error:'RUN_NOT_ACTIVE'};
  if(turn&&event.turnId&&turn.id!==event.turnId)return {ok:false,error:'STALE_TURN_EVENT'};
  if(event.kind==='PROGRESS'){run.phase=event.phase||run.phase;if(event.verification)run.lastVerification=event.verification;save();return {ok:true};}
  if(event.kind==='SENT'){
    if(!turn)return {ok:false,error:'NO_PENDING_TURN'};
    turn.sentConfirmed=true;turn.stage='WAIT_RESPONSE';turn.sentAt=nowIso();turn.baseline=event.baseline||turn.baseline;
    if(turn.kind.startsWith('REPEAT_'))run.repeatSent++;
    run.phase='WAIT_RESPONSE';run.lastVerification=event.verification||'SEND_CONFIRMED';save();log('INFO','Send confirmed',{turn:turn.index+1,kind:turn.kind,method:event.method||'',chars:turn.prompt.length});return {ok:true};
  }
  if(event.kind==='FAILED'){return failRun(event.error||event.detail||'TURN_FAILED'),{ok:true};}
  if(event.kind==='DONE'){
    if(!turn)return {ok:false,error:'NO_PENDING_TURN'};
    const out=String(event.text||'');run.outputs[turn.index]=out;run.outputMeta[turn.index]={finishedAt:nowIso(),method:event.method||'',chars:out.length,kind:turn.kind};run.pendingTurn=null;run.phase='TURN_DONE';
    if(run.config.saveEachResponse!==false)await downloadText(run,`PART_${String(turn.index+1).padStart(3,'0')}.txt`,out);
    log('INFO','Response complete',{turn:turn.index+1,chars:out.length,method:event.method||''});save();
    if(run.outputs.length>=run.totalTurns)return finishRun('ALL_TURNS_COMPLETED'),{ok:true};
    setTimeout(()=>pump().catch(e=>failRun(String(e?.message||e))),Math.max(0,Number(run.config.nextDelaySec||0))*1000);return {ok:true};
  }
  return {ok:true};
}
async function downloadText(run,name,text){
  try{const root='ChatGPT_Text_Auto';const data='data:text/plain;charset=utf-8,'+encodeURIComponent(text||'');await chrome.downloads.download({url:data,filename:`${root}/${safeName(run.projectName)}/${name}`,saveAs:false,conflictAction:'overwrite'});}catch(e){log('WARN','Download failed',{name,error:String(e?.message||e)});}
}
async function exportCombined(run){const joined=(run.outputs||[]).map((x,i)=>`===== PART ${String(i+1).padStart(3,'0')} =====\n${x||''}`).join('\n\n');await downloadText(run,'FINAL_COMBINED.txt',joined);}

async function withDebugger(tabId,fn){
  const target={tabId};let attached=false;
  try{await chrome.debugger.attach(target,'1.3');attached=true;return await fn(target);}finally{if(attached)try{await chrome.debugger.detach(target);}catch(_){}}
}
async function cdpInsert(tabId,text){return withDebugger(tabId,t=>chrome.debugger.sendCommand(t,'Input.insertText',{text:String(text??'')}));}
async function cdpEnter(tabId){return withDebugger(tabId,async t=>{await chrome.debugger.sendCommand(t,'Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});await chrome.debugger.sendCommand(t,'Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});});}

chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  (async()=>{await ready;switch(msg?.type){
    case 'GET_STATE':return {ok:true,state:clone(state)};
    case 'START_RUN':return startRun(msg.tabId,msg.config||{});
    case 'STOP_RUN':return stopRun();
    case 'RESUME_RUN':return resumeRun(msg.tabId);
    case 'TEXT_EVENT':return onTextEvent(sender.tab?.id,msg.event||{});
    case 'PROBE_UI':{const tabId=Number(msg.tabId);const cs=await ensureContent(tabId);if(!cs.ok)return cs;return chrome.tabs.sendMessage(tabId,{type:'PROBE_TEXT_UI',selectors:msg.selectors||{}});}
    case 'CDP_INSERT_TEXT':if(!sender.tab?.id)return {ok:false,error:'NO_SENDER_TAB'};try{await cdpInsert(sender.tab.id,msg.text||'');return {ok:true};}catch(e){return {ok:false,error:String(e?.message||e)};}
    case 'CDP_PRESS_ENTER':if(!sender.tab?.id)return {ok:false,error:'NO_SENDER_TAB'};try{await cdpEnter(sender.tab.id);return {ok:true};}catch(e){return {ok:false,error:String(e?.message||e)};}
    default:return {ok:false,error:'UNKNOWN_MESSAGE'};
  }})().then(sendResponse).catch(e=>sendResponse({ok:false,error:String(e?.message||e)}));return true;
});
