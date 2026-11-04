const $=s=>document.querySelector(s);
const UI_KEY='textAutoUiV1';
let poll=null;

function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function msg(m){return chrome.runtime.sendMessage(m);}
function setStatus(t,err=false){const e=$('#statusLine');e.textContent=t;e.style.color=err?'#ff9aa2':'#aeb8c5';}
function chars(){ $('#initialChars').textContent=`${$('#initialText').value.length.toLocaleString()} ký tự`; $('#repeatChars').textContent=`${$('#repeatText').value.length.toLocaleString()} ký tự`; }
function fileText(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result||''));r.onerror=()=>rej(r.error);r.readAsText(file,'utf-8');});}
async function activeChatTab(){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab)return null;return /^https:\/\/(chatgpt\.com|chat\.openai\.com)(?:\/|$)/i.test(String(tab.url||''))?tab:null;}

function readUi(){return {
  sendInitial:$('#sendInitial').checked,
  initialText:$('#initialText').value,
  repeatText:$('#repeatText').value,
  repeatCount:Math.max(0,Math.min(9999,Math.floor(Number($('#repeatCount').value||0)))),
  stableSec:Math.max(2,Math.min(60,Number($('#stableSec').value||5))),
  nextDelaySec:Math.max(0,Math.min(60,Number($('#nextDelaySec').value||1))),
  responseTimeoutMin:Math.max(1,Math.min(360,Number($('#responseTimeoutMin').value||30))),
  projectName:String($('#projectName').value||'PROJECT_001'),
  saveEachResponse:$('#saveEachResponse').checked,
  cdpFallback:$('#cdpFallback').checked,
  composerSelector:String($('#composerSelector').value||''),
  sendSelector:String($('#sendSelector').value||'')
};}
function applyUi(v={}){
  if('sendInitial'in v)$('#sendInitial').checked=!!v.sendInitial;
  if('initialText'in v)$('#initialText').value=String(v.initialText??'');
  if('repeatText'in v)$('#repeatText').value=String(v.repeatText??'');
  if('repeatCount'in v)$('#repeatCount').value=v.repeatCount;
  if('stableSec'in v)$('#stableSec').value=v.stableSec;
  if('nextDelaySec'in v)$('#nextDelaySec').value=v.nextDelaySec;
  if('responseTimeoutMin'in v)$('#responseTimeoutMin').value=v.responseTimeoutMin;
  if('projectName'in v)$('#projectName').value=v.projectName;
  if('saveEachResponse'in v)$('#saveEachResponse').checked=!!v.saveEachResponse;
  if('cdpFallback'in v)$('#cdpFallback').checked=!!v.cdpFallback;
  if('composerSelector'in v)$('#composerSelector').value=v.composerSelector||'';
  if('sendSelector'in v)$('#sendSelector').value=v.sendSelector||'';
  chars();
}
let saveTimer=null;
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>chrome.storage.local.set({[UI_KEY]:readUi()}),250);}

$('#initialFile').onchange=async e=>{const f=e.target.files?.[0];if(f){$('#initialText').value=await fileText(f);chars();scheduleSave();}};
$('#repeatFile').onchange=async e=>{const f=e.target.files?.[0];if(f){$('#repeatText').value=await fileText(f);chars();scheduleSave();}};
for(const el of document.querySelectorAll('textarea,input')) el.addEventListener('input',()=>{chars();scheduleSave();});
for(const el of document.querySelectorAll('input[type=checkbox]')) el.addEventListener('change',scheduleSave);

$('#probeBtn').onclick=async()=>{
  const tab=await activeChatTab();if(!tab)return setStatus('Tab hiện tại không phải ChatGPT.',true);
  const r=await msg({type:'PROBE_UI',tabId:tab.id,selectors:{composer:$('#composerSelector').value,send:$('#sendSelector').value}});
  setStatus(r?.ok?`UI OK • composer=${r.composer?'có':'không'} • send=${r.sendButton?'có':'không'} • generating=${r.generating?'có':'không'}`:`UI chưa sẵn sàng: ${r?.error||'UNKNOWN'}`,!r?.ok);
};

$('#startBtn').onclick=async()=>{
  const v=readUi();
  if(v.sendInitial && !v.initialText.trim())return setStatus('Đã bật gửi ban đầu nhưng văn bản ban đầu đang trống.',true);
  if(v.repeatCount>0 && !v.repeatText.trim())return setStatus('Số lần lặp > 0 nhưng văn bản lặp đang trống.',true);
  if(!v.sendInitial && v.repeatCount<=0)return setStatus('Không có lượt nào để gửi.',true);
  const tab=await activeChatTab();if(!tab)return setStatus('Hãy mở đúng cuộc chat ChatGPT rồi bấm CHẠY.',true);
  await chrome.storage.local.set({[UI_KEY]:v});
  const r=await msg({type:'START_RUN',tabId:tab.id,config:v});
  setStatus(r?.ok?`Đã bắt đầu trên tab hiện tại • ${v.sendInitial?'1 initial + ':''}${v.repeatCount} lượt lặp.`:`Không chạy được: ${r?.error||'UNKNOWN'}`,!r?.ok);
  refresh();
};
$('#stopBtn').onclick=async()=>{const r=await msg({type:'STOP_RUN'});setStatus(r?.ok?'Đã dừng. Không đóng tab ChatGPT.':`Không dừng được: ${r?.error||'UNKNOWN'}`,!r?.ok);refresh();};
$('#resumeBtn').onclick=async()=>{const tab=await activeChatTab();if(!tab)return setStatus('Hãy mở đúng conversation ChatGPT cần tiếp tục.',true);const r=await msg({type:'RESUME_RUN',tabId:tab.id});setStatus(r?.ok?'Đã nối lại workflow.':`Không nối lại được: ${r?.error||'UNKNOWN'}`,!r?.ok);refresh();};

function render(run){
  if(!run){$('#progress').textContent='Chưa chạy.';return;}
  const total=Number(run.totalTurns||0),done=(run.outputs||[]).length,p=run.pendingTurn;
  const pct=total?Math.round(done/total*1000)/10:0;
  $('#progress').innerHTML=`<b>${esc(run.status)}</b> • ${done}/${total} lượt hoàn tất (${pct}%)`+
    `<br>Initial: ${run.config?.sendInitial?'BẬT':'TẮT'} • Repeat đã gửi: ${run.repeatSent||0}/${run.config?.repeatCount||0}`+
    `${run.phase?`<br>Pha: <b>${esc(run.phase)}</b>`:''}`+
    `${p?`<br>Lượt hiện tại: ${p.index+1}/${total} • ${esc(p.kind)} • ${p.sentConfirmed?'đã xác minh SEND':'chưa xác minh SEND'}`:''}`+
    `${run.lastVerification?`<br>Xác minh gần nhất: ${esc(run.lastVerification)}`:''}`+
    `${run.completionReason?`<br>Kết thúc: ${esc(run.completionReason)}`:''}`+
    `${run.error?`<br><span style="color:#ff9aa2">${esc(run.error)}</span>`:''}`;
}
async function refresh(){
  const r=await msg({type:'GET_STATE'}).catch(()=>null);if(!r?.ok)return;
  render(r.state?.run||null);
  const logs=r.state?.logs||[];$('#logBox').textContent=logs.slice(-80).map(x=>`${String(x.ts||'').slice(11,19)} [${x.level}] ${x.message}${x.data?' '+JSON.stringify(x.data):''}`).join('\n');
}
(async()=>{const saved=(await chrome.storage.local.get(UI_KEY))[UI_KEY];if(saved)applyUi(saved);else chars();await refresh();poll=setInterval(refresh,1200);})();
