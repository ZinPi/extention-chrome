(()=>{
  if(window.__CHATGPT_TEXT_AUTO_VERSION__==='1.0.4')return;window.__CHATGPT_TEXT_AUTO_VERSION__='1.0.4';
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let activeTurn=null;
  const visible=el=>!!el&&!!(el.offsetWidth||el.offsetHeight||el.getClientRects().length);
  const rawText=el=>String(el?.innerText??el?.textContent??'');
  const canon=s=>String(s??'').replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').replace(/\u200b/g,'');
  const canonLoose=s=>canon(s).replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').trim();
  function qVisible(selectors){for(const sel of selectors.filter(Boolean)){try{const hit=[...document.querySelectorAll(sel)].find(visible);if(hit)return hit;}catch(_){}}return null;}
  function findComposer(selectors={}){
    return qVisible([
      selectors.composer,
      'div.ProseMirror[data-composer-markdown][contenteditable="true"]',
      '[data-composer-markdown][contenteditable="true"][role="textbox"]',
      '[contenteditable="true"][role="textbox"][aria-label="Hỏi ChatGPT"]',
      '[contenteditable="true"][role="textbox"][aria-label="Ask ChatGPT"]',
      '#prompt-textarea',
      'textarea[data-testid="prompt-textarea"]',
      'div[contenteditable="true"][data-lexical-editor="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'form[data-type="unified-composer"] [contenteditable="true"]',
      '#thread-bottom-container [contenteditable="true"]',
      'main textarea[placeholder*="Message"]',
      'main textarea[placeholder*="Nhắn"]',
      'main textarea'
    ]);
  }
  const BLOCK_TAGS=new Set(['P','DIV','LI','UL','OL','BLOCKQUOTE','PRE','H1','H2','H3','H4','H5','H6']);
  function editorInlineText(node){
    if(!node)return '';
    if(node.nodeType===Node.TEXT_NODE)return String(node.nodeValue||'');
    if(node.nodeType!==Node.ELEMENT_NODE)return '';
    const el=node;
    if(el.tagName==='BR'){
      // ProseMirror uses a trailingBreak <br> to keep an empty paragraph visible.
      // The top-level block separator already represents that empty logical line.
      if(el.classList?.contains('ProseMirror-trailingBreak'))return '';
      return '\n';
    }
    let out='';
    for(const child of el.childNodes)out+=editorInlineText(child);
    return out;
  }
  function editorBlockText(el){
    if(!el)return '';
    const kids=[...el.childNodes];
    if(!kids.length)return '';
    const top=[];
    for(const n of kids){
      if(n.nodeType===Node.TEXT_NODE){top.push({block:false,text:String(n.nodeValue||'')});continue;}
      if(n.nodeType!==Node.ELEMENT_NODE)continue;
      const e=n;
      if(BLOCK_TAGS.has(e.tagName)){
        if(e.tagName==='UL'||e.tagName==='OL'){
          const lis=[...e.children].filter(x=>x.tagName==='LI');
          if(lis.length){for(const li of lis)top.push({block:true,text:editorInlineText(li)});continue;}
        }
        top.push({block:true,text:editorInlineText(e)});
      }else top.push({block:false,text:editorInlineText(e)});
    }
    if(!top.length)return '';
    let out='';
    for(let i=0;i<top.length;i++){
      const cur=top[i];
      if(i>0&&(cur.block||top[i-1].block))out+='\n';
      out+=cur.text;
    }
    return out;
  }
  function composerText(el){
    if(!el)return '';
    if(el instanceof HTMLTextAreaElement||el instanceof HTMLInputElement)return String(el.value||'');
    if(el.matches?.('.ProseMirror[data-composer-markdown],[data-composer-markdown][contenteditable="true"]'))return editorBlockText(el);
    return rawText(el);
  }
  function composerRawText(el){if(!el)return '';if(el instanceof HTMLTextAreaElement||el instanceof HTMLInputElement)return String(el.value||'');return rawText(el);}
  function nearestComposerForm(c){return c?.closest?.('form')||qVisible(['form[data-type="unified-composer"]','#thread-bottom-container form','main form']);}
  function findSendButton(selectors={}){
    const c=findComposer(selectors),form=nearestComposerForm(c);
    const local=s=>{if(!form)return null;try{return [...form.querySelectorAll(s)].find(visible)||null;}catch(_){return null;}};
    let b=null;
    if(selectors.send){try{b=[...document.querySelectorAll(selectors.send)].find(visible)||null;}catch(_){}}
    if(b)return b;
    for(const sel of [
      'button[type="submit"][aria-label="Gửi"]',
      'button[type="submit"][aria-label="Send"]',
      'button[type="submit"][aria-label*="Gửi"]',
      'button[type="submit"][aria-label*="Send"]',
      '#composer-submit-button',
      'button[data-testid="send-button"]',
      'button[data-testid*="send"]',
      'button[aria-label*="Send prompt"]',
      'button[aria-label*="Send dictated message"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="Gửi"]',
      'button[aria-label*="Submit"]',
      'button.composer-submit-btn',
      'button[type="submit"]'
    ]){b=local(sel)||qVisible([sel]);if(b)return b;}
    const buttons=form?[...form.querySelectorAll('button')]:[...document.querySelectorAll('button')];
    return buttons.find(x=>visible(x)&&/send|submit|gui|gửi/i.test(`${x.getAttribute('aria-label')||''} ${x.getAttribute('title')||''} ${rawText(x)}`))||null;
  }
  function composerControlRoot(selectors={}){
    const c=findComposer(selectors);if(!c)return null;
    return c.closest?.('form')||c.closest?.('[data-composer-body]')||c.parentElement?.parentElement?.parentElement||null;
  }
  function findStopButton(selectors={}){
    // IMPORTANT: only trust a Stop control inside the CURRENT composer. ChatGPT keeps
    // unrelated/stale controls elsewhere in the DOM, especially after virtualization.
    const root=composerControlRoot(selectors);if(!root)return null;
    const selectorsLocal=[
      'button[aria-label="Ngừng"]',
      'button[aria-label="Stop"]',
      'button[data-testid="stop-button"]',
      'button[data-testid*="stop"]',
      'button[aria-label*="Stop"]',
      'button[aria-label*="Dừng"]',
      'button[aria-label*="Ngừng"]',
      'button[title*="Stop"]'
    ];
    for(const sel of selectorsLocal){try{const b=[...root.querySelectorAll(sel)].find(x=>visible(x)&&!isDisabled(x));if(b)return b;}catch(_){}}
    return [...root.querySelectorAll('button')].find(x=>visible(x)&&!isDisabled(x)&&/stop generating|stop response|dừng tạo|dừng phản hồi|ngừng/i.test(`${x.getAttribute('aria-label')||''} ${x.getAttribute('title')||''} ${rawText(x)}`))||null;
  }
  function uniqueNodes(nodes){const out=[];const seen=new Set();for(const n of nodes){if(n&&!seen.has(n)){seen.add(n);out.push(n);}}return out;}
  function turnKey(el){
    if(!el)return '';
    const direct=String(el.getAttribute?.('data-chatgpt-search-unit-key')||el.getAttribute?.('data-content-search-unit-key')||'');
    if(direct)return direct;
    const nested=el.querySelector?.('[data-chatgpt-search-unit-key],[data-content-search-unit-key]');
    return String(nested?.getAttribute?.('data-chatgpt-search-unit-key')||nested?.getAttribute?.('data-content-search-unit-key')||'');
  }
  function currentUiTurnNodes(){
    try{return [...document.querySelectorAll('[data-chatgpt-search-unit-key$=":user"],[data-chatgpt-search-unit-key$=":assistant"]')];}catch(_){return [];}
  }
  function conversationTurnNodes(){
    const current=currentUiTurnNodes();if(current.length)return uniqueNodes(current);
    const all=[];
    for(const sel of ['article[data-testid^="conversation-turn-"]','[data-testid^="conversation-turn-"]','article[data-turn]','[data-turn="user"]','[data-turn="assistant"]','[data-message-author-role]']){try{all.push(...document.querySelectorAll(sel));}catch(_){}}
    return uniqueNodes(all.map(n=>n.closest?.('article[data-testid^="conversation-turn-"],article[data-turn],[data-testid^="conversation-turn-"]')||n));
  }
  function nodeRole(el){
    if(!el)return '';
    const key=turnKey(el).toLowerCase();
    if(key.endsWith(':assistant'))return 'assistant';
    if(key.endsWith(':user'))return 'user';
    if(el.matches?.('[data-conversation-role="assistant"]'))return 'assistant';
    if(el.matches?.('[data-user-message-bubble="true"]'))return 'user';
    if(el.querySelector?.('[data-conversation-role="assistant"]'))return 'assistant';
    if(el.querySelector?.('[data-user-message-bubble="true"]'))return 'user';
    const direct=String(el.getAttribute?.('data-turn')||el.getAttribute?.('data-message-author-role')||'').toLowerCase();if(direct)return direct;
    const nested=el.querySelector?.('[data-message-author-role]');if(nested)return String(nested.getAttribute('data-message-author-role')||'').toLowerCase();
    return '';
  }
  function turnText(el){
    if(!el)return '';
    const role=nodeRole(el);
    if(role==='assistant'){
      const md=el.querySelector?.('[data-markdown-text-style="assistant-message"],[data-message-author-role="assistant"] .markdown,.markdown,[class*="markdown"]');
      if(md)return canonLoose(rawText(md));
    }
    if(role==='user'){
      const bubble=el.matches?.('[data-user-message-bubble="true"]')?el:el.querySelector?.('[data-user-message-bubble="true"]');
      if(bubble)return canonLoose(rawText(bubble));
    }
    const roleNode=el.querySelector?.(`[data-message-author-role="${role}"]`);return canonLoose(rawText(roleNode||el));
  }
  function addMessageNode(out,n){
    if(!n)return;
    for(const o of out){if(o===n||o.contains?.(n))return;}
    for(let i=out.length-1;i>=0;i--){if(n.contains?.(out[i]))out.splice(i,1);}
    out.push(n);
  }
  function sortDom(nodes){return [...nodes].sort((a,b)=>{if(a===b)return 0;const p=a.compareDocumentPosition(b);if(p&Node.DOCUMENT_POSITION_FOLLOWING)return -1;if(p&Node.DOCUMENT_POSITION_PRECEDING)return 1;return 0;});}
  function assistantContainer(x){
    if(!x)return null;
    return x.closest?.('[data-chatgpt-search-unit-key$=":assistant"],[data-content-search-unit-key$=":assistant"],article[data-testid^="conversation-turn-"],article[data-turn],[data-testid^="conversation-turn-"]')||
      (x.matches?.('[data-conversation-role="assistant"]')?x.parentElement:null)||
      x.closest?.('[data-conversation-role="assistant"]')?.parentElement||
      (x.matches?.('[data-markdown-text-style="assistant-message"]')?x.parentElement:null)||x;
  }
  function userContainer(x){
    if(!x)return null;
    return x.closest?.('[data-chatgpt-search-unit-key$=":user"],[data-content-search-unit-key$=":user"],article[data-testid^="conversation-turn-"],article[data-turn],[data-testid^="conversation-turn-"]')||
      (x.matches?.('[data-user-message-bubble="true"]')?x.parentElement:null)||x;
  }
  function assistantNodes(){
    // Union all known representations. The newest streaming assistant can exist without
    // data-chatgpt-search-unit-key while older indexed assistants still have that key.
    const out=[];
    for(const x of document.querySelectorAll('[data-chatgpt-search-unit-key$=":assistant"],[data-content-search-unit-key$=":assistant"]'))addMessageNode(out,assistantContainer(x));
    for(const x of document.querySelectorAll('[data-conversation-role="assistant"]'))addMessageNode(out,assistantContainer(x));
    for(const x of document.querySelectorAll('[data-message-author-role="assistant"]'))addMessageNode(out,assistantContainer(x));
    for(const x of document.querySelectorAll('main [data-markdown-text-style="assistant-message"],main .markdown,main [class*="markdown"]'))addMessageNode(out,assistantContainer(x));
    for(const x of conversationTurnNodes().filter(x=>nodeRole(x)==='assistant'))addMessageNode(out,x);
    return sortDom(out);
  }
  function userNodes(){
    const out=[];
    for(const x of document.querySelectorAll('[data-chatgpt-search-unit-key$=":user"],[data-content-search-unit-key$=":user"]'))addMessageNode(out,userContainer(x));
    for(const x of document.querySelectorAll('[data-user-message-bubble="true"]'))addMessageNode(out,userContainer(x));
    for(const x of document.querySelectorAll('[data-message-author-role="user"]'))addMessageNode(out,userContainer(x));
    for(const x of conversationTurnNodes().filter(x=>nodeRole(x)==='user'))addMessageNode(out,x);
    return sortDom(out);
  }
  function latestAssistant(){const a=assistantNodes();const el=a.at(-1)||null;return {count:a.length,key:turnKey(el),text:turnText(el)||canonLoose(rawText(el)),el};}
  function latestUser(){const a=userNodes();const el=a.at(-1)||null;return {count:a.length,key:turnKey(el),text:turnText(el)||canonLoose(rawText(el)),el};}
  function latestTurn(){const a=conversationTurnNodes();const el=a.at(-1)||null;return {count:a.length,key:turnKey(el),role:nodeRole(el),text:turnText(el),el};}
  function keySet(nodes){return nodes.map(turnKey).filter(Boolean);}
  function findFreshAssistant(baseline={}){
    const nodes=assistantNodes(),seen=new Set(Array.isArray(baseline.assistantKeys)?baseline.assistantKeys:[]);
    if(seen.size){for(let i=nodes.length-1;i>=0;i--){const k=turnKey(nodes[i]);if(k&&!seen.has(k))return {el:nodes[i],key:k,text:turnText(nodes[i])||canonLoose(rawText(nodes[i])),count:nodes.length};}}
    if(nodes.length>Number(baseline.assistantCount||0)){const el=nodes.at(-1);return {el,key:turnKey(el),text:turnText(el)||canonLoose(rawText(el)),count:nodes.length};}
    return null;
  }
  function findFreshUser(baseline={}){
    const nodes=userNodes(),seen=new Set(Array.isArray(baseline.userKeys)?baseline.userKeys:[]);
    if(seen.size){for(let i=nodes.length-1;i>=0;i--){const k=turnKey(nodes[i]);if(k&&!seen.has(k))return {el:nodes[i],key:k,text:turnText(nodes[i])||canonLoose(rawText(nodes[i])),count:nodes.length};}}
    if(nodes.length>Number(baseline.userCount||0)){const el=nodes.at(-1);return {el,key:turnKey(el),text:turnText(el)||canonLoose(rawText(el)),count:nodes.length};}
    return null;
  }
  function findSentUser(baseline={},payload=''){
    const nodes=userNodes();
    if(baseline.sentUserKey){for(let i=nodes.length-1;i>=0;i--){if(turnKey(nodes[i])===baseline.sentUserKey)return {el:nodes[i],key:baseline.sentUserKey,text:turnText(nodes[i])||canonLoose(rawText(nodes[i])),source:'sent-key'};}}
    const fresh=findFreshUser(baseline);if(fresh)return {...fresh,source:'fresh-user'};
    for(let i=nodes.length-1;i>=0;i--){const txt=turnText(nodes[i])||canonLoose(rawText(nodes[i]));if(fingerprintMatches(txt,payload))return {el:nodes[i],key:turnKey(nodes[i]),text:txt,source:'payload-match'};}
    const el=nodes.at(-1)||null;return el?{el,key:turnKey(el),text:turnText(el)||canonLoose(rawText(el)),source:'latest-user'}:null;
  }
  function isAfter(a,b){if(!a||!b||a===b)return false;try{return !!(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING);}catch(_){return false;}}
  function findAssistantAfterSentUser(baseline={},payload=''){
    const u=findSentUser(baseline,payload);if(!u?.el)return null;
    const nodes=assistantNodes();let chosen=null;
    for(const el of nodes){if(isAfter(u.el,el)){const text=turnText(el)||canonLoose(rawText(el));chosen={el,key:turnKey(el),text,count:nodes.length,userKey:u.key||'',source:'after-user'};}}
    return chosen;
  }
  function bestResponseCandidate(baseline={},payload=''){
    const after=findAssistantAfterSentUser(baseline,payload);if(after)return after;
    const fresh=findFreshAssistant(baseline);if(fresh)return {...fresh,source:'fresh-assistant'};
    const nodes=assistantNodes();
    for(let i=nodes.length-1;i>=0;i--){const el=nodes[i],text=turnText(el)||canonLoose(rawText(el)),key=turnKey(el);if(text&&(text!==String(baseline.lastAssistantText||'')||key&&!(baseline.assistantKeys||[]).includes(key)))return {el,key,text,count:nodes.length,source:'changed-latest'};}
    return null;
  }
  function conversationId(){try{const m=location.pathname.match(/(?:^|\/)c\/([^/?#]+)/i);return m?m[1]:'';}catch(_){return '';}}
  function pageError(){const t=canonLoose(document.body?.innerText||'').toLowerCase();if(/something went wrong|đã xảy ra lỗi|network error|lỗi mạng/.test(t))return 'CHATGPT_PAGE_ERROR';return '';}
  async function sha256(s){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canon(s)));return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');}
  async function waitComposer(selectors,ms=30000){const end=Date.now()+ms;while(Date.now()<end){const c=findComposer(selectors);if(c)return c;await sleep(250);}return null;}
  function selectAllEditable(el){const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);}
  async function clearComposer(el){
    el.focus();if(el instanceof HTMLTextAreaElement||el instanceof HTMLInputElement){const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const set=Object.getOwnPropertyDescriptor(proto,'value')?.set;set?set.call(el,''):el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));return;}
    try{selectAllEditable(el);document.execCommand('delete',false,null);}catch(_){el.textContent='';el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward'}));}
  }
  async function insertDom(el,text,mode=0){
    el.focus();
    if(el instanceof HTMLTextAreaElement||el instanceof HTMLInputElement){const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const set=Object.getOwnPropertyDescriptor(proto,'value')?.set;set?set.call(el,text):el.value=text;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return;}
    try{selectAllEditable(el);document.execCommand('delete',false,null);}catch(_){ }
    if(mode===0){try{document.execCommand('insertText',false,text);}catch(_){}}
    else if(mode===1){try{const dt=new DataTransfer();dt.setData('text/plain',text);el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));}catch(_){}}
    else {el.textContent=text;el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));}
  }
  async function readComposerVerification(el,expected,maxWait=1800){
    const end=Date.now()+maxWait;let logical='',raw='',lastLogical='',stableSince=Date.now();
    while(Date.now()<end){
      const live=el?.isConnected?el:findComposer({});
      logical=canon(composerText(live||el));
      raw=canon(composerRawText(live||el));
      if(logical===expected)return {ok:true,logical,raw,el:live||el};
      if(logical!==lastLogical){lastLogical=logical;stableSince=Date.now();}
      if(Date.now()-stableSince>500&&logical.length>=expected.length)break;
      await sleep(80);
    }
    return {ok:logical===expected,logical,raw,el};
  }
  async function pasteVerified(text,settings,emit){
    const selectors=settings.selectors||{};const expected=canon(text);const expectedHash=await sha256(expected);let last='',lastRaw='';
    for(let attempt=1;attempt<=3;attempt++){
      const c=await waitComposer(selectors,12000);if(!c)throw new Error('UI_COMPOSER_NOT_FOUND');
      await clearComposer(c);await sleep(80);await insertDom(c,text,attempt-1);await sleep(Math.min(800,120+Math.floor(text.length/5000)*60));
      const vr=await readComposerVerification(c,expected,Math.min(2500,900+Math.floor(text.length/4000)*100));last=vr.logical;lastRaw=vr.raw;
      if(vr.ok){
        const rawNote=vr.raw!==vr.logical?` • rawDOM=${vr.raw.length}`:'';
        await emit({kind:'PROGRESS',phase:'PASTE_VERIFIED',verification:`LOGICAL EXACT ${expected.length} chars • sha256 ${expectedHash.slice(0,12)}${rawNote}`});
        return {composer:vr.el||c,method:`DOM_${attempt}_LOGICAL`,hash:expectedHash};
      }
    }
    if(settings.cdpFallback!==false){
      const c=await waitComposer(selectors,8000);if(!c)throw new Error('UI_COMPOSER_NOT_FOUND');
      await clearComposer(c);c.focus();
      const r=await chrome.runtime.sendMessage({type:'CDP_INSERT_TEXT',text}).catch(e=>({ok:false,error:String(e)}));
      if(r?.ok){
        const live=findComposer(selectors)||c;const vr=await readComposerVerification(live,expected,2500);last=vr.logical;lastRaw=vr.raw;
        if(vr.ok){
          const rawNote=vr.raw!==vr.logical?` • rawDOM=${vr.raw.length}`:'';
          await emit({kind:'PROGRESS',phase:'PASTE_VERIFIED',verification:`CDP LOGICAL EXACT ${expected.length} chars • sha256 ${expectedHash.slice(0,12)}${rawNote}`});
          return {composer:vr.el||live,method:'CDP_INSERT_TEXT_LOGICAL',hash:expectedHash};
        }
      }
    }
    const actualHash=await sha256(last);const rawHash=await sha256(lastRaw);
    throw new Error(`PASTE_VERIFY_FAILED expected=${expected.length}/${expectedHash.slice(0,12)} logical=${last.length}/${actualHash.slice(0,12)} raw=${lastRaw.length}/${rawHash.slice(0,12)}`);
  }
  function isDisabled(b){return !b||b.disabled||b.getAttribute('aria-disabled')==='true';}
  function fingerprintMatches(rendered,payload){
    const a=canonLoose(rendered),b=canonLoose(payload);if(!a||!b)return false;if(a===b)return true;
    const head=b.slice(0,96),mid=b.slice(Math.max(0,Math.floor(b.length/2)-48),Math.max(0,Math.floor(b.length/2)+48)),tail=b.slice(-96);
    let hits=0;if(head&&a.includes(head))hits++;if(mid&&a.includes(mid))hits++;if(tail&&a.includes(tail))hits++;
    if(b.length<260)return hits>=2||a.includes(b.slice(0,Math.min(120,b.length)));
    return hits>=2||a.includes(head);
  }
  async function confirmSent(baseline,payload,selectors,timeout=20000){
    const end=Date.now()+timeout;let sawComposerClear=false,clearSince=0;
    while(Date.now()<end){
      const u=latestUser(),a=latestAssistant(),t=latestTurn(),freshU=findFreshUser(baseline),freshA=findFreshAssistant(baseline),c=findComposer(selectors),ct=canon(composerText(c));
      if(!ct.trim()){if(!sawComposerClear)clearSince=Date.now();sawComposerClear=true;}
      if(freshU&&fingerprintMatches(freshU.text,payload))return {ok:true,evidence:'NEW_USER_MESSAGE_MATCH',userCount:u.count,userKey:freshU.key};
      if(freshU&&sawComposerClear)return {ok:true,evidence:'NEW_USER_TURN_AFTER_COMPOSER_CLEAR',userCount:u.count,userKey:freshU.key};
      if(t.count>baseline.turnCount&&sawComposerClear&&t.role==='user')return {ok:true,evidence:'NEW_GENERIC_USER_TURN',userCount:u.count,userKey:t.key||''};
      if(sawComposerClear&&(freshA||a.count>baseline.assistantCount||t.role==='assistant'&&t.count>baseline.turnCount||!!findStopButton(selectors)))return {ok:true,evidence:'COMPOSER_CLEAR_AND_RESPONSE_ACTIVITY',userCount:u.count,userKey:freshU?.key||''};
      // Current ChatGPT can truncate/reflow long user bubbles. A verified enabled Send action followed by an empty composer
      // is accepted as committed; the response phase still fails closed until a new assistant turn is proven.
      if(sawComposerClear&&clearSince&&Date.now()-clearSince>=900)return {ok:true,evidence:'COMPOSER_CLEARED_AFTER_SEND',userCount:u.count,userKey:freshU?.key||''};
      await sleep(250);
    }
    return {ok:false,uncertain:false,error:'SEND_NOT_CONFIRMED'};
  }
  async function sendVerified(payload,paste,settings,emit){
    const selectors=settings.selectors||{};const beforeU=latestUser(),beforeA=latestAssistant(),beforeT=latestTurn();const baseline={userCount:beforeU.count,userKeys:keySet(userNodes()),lastUserKey:beforeU.key,lastUserText:beforeU.text,assistantCount:beforeA.count,assistantKeys:keySet(assistantNodes()),lastAssistantKey:beforeA.key,lastAssistantText:beforeA.text,turnCount:beforeT.count,lastTurnKey:beforeT.key,lastTurnRole:beforeT.role,lastTurnText:beforeT.text};
    let method='';const btn=findSendButton(selectors);
    if(btn&&!isDisabled(btn)){btn.click();method='BUTTON_CLICK';}
    else {
      const c=findComposer(selectors),form=nearestComposerForm(c);let used=false;
      if(form){const submit=[...form.querySelectorAll('button[type="submit"]')].find(x=>visible(x)&&!isDisabled(x));if(submit){submit.click();method='FORM_SUBMIT_BUTTON';used=true;}else if(typeof form.requestSubmit==='function'){try{form.requestSubmit();method='FORM_REQUEST_SUBMIT';used=true;}catch(_){}}}
      if(!used&&settings.cdpFallback!==false&&c){c.focus();const r=await chrome.runtime.sendMessage({type:'CDP_PRESS_ENTER'}).catch(()=>null);if(r?.ok){method='CDP_ENTER';used=true;}}
      if(!used&&c){c.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));method='SYNTHETIC_ENTER';}
    }
    await emit({kind:'PROGRESS',phase:'SEND_CLICKED',verification:`send method=${method||'UNKNOWN'}`});
    const conf=await confirmSent(baseline,payload,selectors,22000);
    if(!conf.ok){if(conf.uncertain)throw new Error('SEND_CONFIRM_UNCERTAIN_STOPPED_TO_AVOID_DUPLICATE');throw new Error(conf.error||'SEND_NOT_CONFIRMED');}
    const sentUser=findSentUser(baseline,payload);baseline.sentUserKey=conf.userKey||sentUser?.key||'';baseline.sentUserText=sentUser?.text||'';baseline.sentUserConfirmedAt=Date.now();
    return {method,baseline,conf};
  }
  async function waitPreSendIdle(settings,emit){
    const selectors=settings.selectors||{};const timeout=120000,end=Date.now()+timeout;let last=latestAssistant().text,lastChange=Date.now();
    while(Date.now()<end){const cur=latestAssistant().text;if(cur!==last){last=cur;lastChange=Date.now();}const generating=!!findStopButton(selectors);const c=!!findComposer(selectors);if(!generating&&c&&Date.now()-lastChange>=1600)return true;await emit({kind:'PROGRESS',phase:'WAIT_CHAT_IDLE'});await sleep(350);}throw new Error('CHAT_NOT_IDLE_BEFORE_SEND');
  }
  async function waitResponse(turn,sendInfo,settings,emit,recovery=false){
    const selectors=settings.selectors||{};const stableMs=Math.max(2000,Number(settings.stableSec||5)*1000);const timeout=Math.max(60000,Number(settings.responseTimeoutMin||30)*60000);
    const baseline=sendInfo?.baseline||turn.baseline||{};let remaining=timeout,lastTick=Date.now(),last='',lastKey='',lastChange=Date.now(),sawNew=false,sawGenerating=false,lastBeat=0;
    // Background tabs are heavily throttled/frozen by Chromium. Hidden wall-clock time must
    // NOT consume the response timeout; otherwise a healthy completed response times out
    // immediately when the user returns to the tab.
    while(remaining>0){
      const now=Date.now(),dt=Math.max(0,now-lastTick);lastTick=now;if(!document.hidden)remaining-=dt;
      if(turn.conversationId&&conversationId()&&conversationId()!==turn.conversationId)throw new Error('CONVERSATION_CHANGED');
      const a=latestAssistant(),t=latestTurn(),fresh=findFreshAssistant(baseline),candidateObj=bestResponseCandidate(baseline,turn.prompt||''),generating=!!findStopButton(selectors);if(generating)sawGenerating=true;
      if(candidateObj||fresh||Number(a.count||0)>Number(baseline.assistantCount||0))sawNew=true;
      const candidate=candidateObj?.text||fresh?.text||'';const candidateKey=candidateObj?.key||fresh?.key||'';
      if(candidate&&(candidate!==last||candidateKey!==lastKey)){last=candidate;lastKey=candidateKey;lastChange=now;}
      const stableFor=now-lastChange,composerReady=!!findComposer(selectors);const err=pageError();if(err&&!generating&&!last)throw new Error(err);
      if(now-lastBeat>=2000){lastBeat=now;await emit({kind:'PROGRESS',phase:recovery?'RECOVER_WAIT_RESPONSE':'WAIT_RESPONSE',verification:`assistant=${assistantNodes().length} fresh=${fresh?1:0} source=${candidateObj?.source||'-'} key=${candidateKey||'-'} user=${baseline.sentUserKey||'-'} chars=${last.length} stable=${Math.round(stableFor/100)/10}s generating=${generating} hidden=${document.hidden} timeoutLeft=${Math.ceil(remaining/1000)}s`});}
      if(sawNew&&last&&!generating&&composerReady&&stableFor>=stableMs){await emit({kind:'DONE',text:last,method:recovery?'ASSISTANT_AFTER_USER_RECOVERY':'ASSISTANT_AFTER_USER_DONE'});return;}
      await sleep(document.hidden?750:250);
    }
    // One final current-DOM recovery pass before failing. This catches a tab that woke up
    // exactly as the active-time budget expired.
    const finalCandidate=bestResponseCandidate(baseline,turn.prompt||''),finalGenerating=!!findStopButton(selectors),finalComposer=!!findComposer(selectors);
    if(finalCandidate?.text&&!finalGenerating&&finalComposer){await sleep(Math.min(stableMs,2500));const again=bestResponseCandidate(baseline,turn.prompt||'');if(again?.text===finalCandidate.text&&!findStopButton(selectors)){await emit({kind:'DONE',text:again.text,method:'FINAL_DOM_RECOVERY'});return;}}
    throw new Error('RESPONSE_TIMEOUT_NO_SAFE_ADVANCE');
  }
  async function runTurn(turn,settings){
    const emit=e=>chrome.runtime.sendMessage({type:'TEXT_EVENT',event:{turnId:turn.id,...e}}).catch(()=>null);
    try{await emit({kind:'PROGRESS',phase:'WAIT_CHAT_IDLE'});await waitPreSendIdle(settings,emit);const paste=await pasteVerified(turn.prompt,settings,emit);await emit({kind:'PROGRESS',phase:'PASTE_READY'});const sent=await sendVerified(turn.prompt,paste,settings,emit);turn.baseline=sent.baseline;await emit({kind:'SENT',method:sent.method,baseline:sent.baseline,verification:`${sent.conf.evidence} • ${paste.method}`});await waitResponse(turn,sent,settings,emit,false);}catch(e){await emit({kind:'FAILED',error:String(e?.message||e)});}
  }
  async function recoverTurn(turn,settings){
    const emit=e=>chrome.runtime.sendMessage({type:'TEXT_EVENT',event:{turnId:turn.id,...e}}).catch(()=>null);
    try{if(!turn.sentConfirmed)throw new Error('RECOVERY_REFUSES_TO_RESEND_UNCONFIRMED_TURN');await waitResponse(turn,{baseline:turn.baseline||{}},settings,emit,true);}catch(e){await emit({kind:'FAILED',error:String(e?.message||e)});}
  }

  chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
    (async()=>{
      if(msg?.type==='PING_TEXT_AUTO')return {ok:true,version:'1.0.4',activeTurnId:activeTurn?.id||''};
      if(msg?.type==='PROBE_TEXT_UI'){const c=findComposer(msg.selectors||{}),s=findSendButton(msg.selectors||{});return {ok:!!c,composer:!!c,sendButton:!!s,generating:!!findStopButton(msg.selectors||{}),assistantCount:assistantNodes().length,userCount:userNodes().length,turnCount:conversationTurnNodes().length,lastTurnRole:latestTurn().role,conversationId:conversationId(),url:location.href,error:c?'':'COMPOSER_NOT_FOUND'};}
      if(msg?.type==='RUN_TEXT_TURN'){if(activeTurn)return {ok:false,error:'TURN_ALREADY_ACTIVE'};activeTurn=msg.turn;runTurn(msg.turn,msg.settings||{}).finally(()=>{activeTurn=null;});return {ok:true};}
      if(msg?.type==='RECOVER_TEXT_TURN'){if(activeTurn)return {ok:false,error:'TURN_ALREADY_ACTIVE'};activeTurn=msg.turn;recoverTurn(msg.turn,msg.settings||{}).finally(()=>{activeTurn=null;});return {ok:true};}
      return {ok:false,error:'UNKNOWN_MESSAGE'};
    })().then(sendResponse).catch(e=>sendResponse({ok:false,error:String(e?.message||e)}));return true;
  });
})();
