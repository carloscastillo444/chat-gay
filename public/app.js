const socket = io();
const $ = id => document.getElementById(id);
const state = {
  rooms: [], meta: null, me: null, room: null, detectedCountry: '', privateWith: null,
  privateChats: new Map(), privateUnread: new Map(), privateSound: true, privateVolume: .75,
  blocked: new Set(), privateOpen: new Set(), mobileView:'general'
};
const emojis = ['😀','😂','🤣','😊','😍','🥰','😘','😎','😭','😡','🤭','😉','😈','🥳','🤗','❤️','💕','💖','🌈','🏳️‍🌈','🔥','✨','👏','🍆','💋','😏','👀','🫶','💯','🎉','🥹','😇','🙈','💜','💙','💚','💛','🧡','🤍','🩷','🍓','🍒','🦄','🌸','⭐','☕'];
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function showToast(t){const el=$('toast');if(!el)return;el.textContent=t;el.classList.remove('hidden');clearTimeout(showToast.t);showToast.t=setTimeout(()=>el.classList.add('hidden'),2500)}
function flag(code){return String(code||'').toUpperCase().replace(/./g,c=>String.fromCodePoint(127397+c.charCodeAt(0)))}
function renderRooms(){
  const filter = $('roomFilter')?.value || 'available';
  const arr = state.rooms.filter(r=>filter==='all'||!r.occupied);
  const roomSelect=$('roomSelect'); if(!roomSelect)return;
  roomSelect.innerHTML='<option value="">Selecciona una sala</option>'+arr.map(r=>`<option value="${r.id}" ${r.occupied?'disabled':''}>${esc(r.name)} · ${r.count}/500 · ${r.occupied?'🔴 Ocupada':'🟢 Disponible'}</option>`).join('');
  $('roomHint').textContent=arr.length?`${arr.length} salas visibles.`:'No hay salas disponibles ahora mismo. Espera a que se libere alguna.';
}
function openJoin(){ $('joinModal').classList.remove('hidden'); $('joinError').textContent=''; setTimeout(()=>$('nickname').focus(),50); }
$('openJoin').onclick=openJoin; $('closeJoin').onclick=()=>$('joinModal').classList.add('hidden');
$('roomFilter').onchange=renderRooms;
$('nickname').addEventListener('input',()=>socket.emit('profile:check-admin',{nickname:$('nickname').value}));
socket.on('profile:admin-needed',d=>$('adminSecretWrap').classList.toggle('hidden',!d.needed));
async function detectCountry(){
  try{
    let data=null;
    try{ const direct=await fetch('https://ipwho.is/',{cache:'no-store',signal:AbortSignal.timeout(4500)}); if(direct.ok)data=await direct.json(); }catch{}
    if(!data?.country_code){ const fallback=await fetch('/api/geo',{cache:'no-store'}); if(fallback.ok)data=await fallback.json(); }
    state.detectedCountry=String(data?.country_code||data?.country||'').toUpperCase();
    $('detectedCountry').textContent=data?.country ? `${flag(state.detectedCountry)} ${data.country}` : (data?.countryName ? `${flag(state.detectedCountry)} ${data.countryName}` : 'No se pudo detectar automáticamente.');
  }catch{ $('detectedCountry').textContent='No se pudo detectar automáticamente.'; }
}
$('joinForm').onsubmit=e=>{
  e.preventDefault(); $('joinError').textContent='';
  const nickname=$('nickname').value.trim(), roomId=$('roomSelect').value;
  if(!nickname)return $('joinError').textContent='El nickname es obligatorio.';
  if(!roomId)return $('joinError').textContent='Selecciona una sala.';
  if(!state.detectedCountry)return $('joinError').textContent='Espera a que detectemos tu país.';
  socket.emit('room:join',{nickname,roomId,country:state.detectedCountry,adminPassword:$('adminPassword').value});
};
$('leaveBtn').onclick=()=>socket.emit('leave:room');
function userCard(u){const unread=state.privateUnread.get(u.id)||0;return `<div class="user-item"><div class="user-left"><div class="avatar">${u.flag}</div><div class="user-name-wrap"><div class="user-name">${esc(u.nickname)} ${u.admin?'<span class="admin-crown">👑</span>':''}</div><div class="user-meta"><span>${esc(u.countryName)}</span></div></div></div><button class="select-user pv-button" data-private="${u.id}" title="Abrir chat privado con ${esc(u.nickname)}">💬${unread?`<span class="pv-badge">${unread>99?'99+':unread}</span>`:''}</button></div>`}
function renderRoom(){if(!state.room)return;$('roomTitle').textContent=state.room.name;$('roomCount').textContent=`${state.room.count}/500`;$('userList').innerHTML=state.room.users.map(userCard).join('');$('adminBox').classList.toggle('hidden',!state.me?.admin);renderGeneral();document.querySelectorAll('[data-private]').forEach(b=>b.onclick=()=>openPrivate(b.dataset.private));}
function renderGeneral(){const box=$('generalMessages');const safeHtml=v=>typeof v==='string'?v:'';const safeText=v=>{if(v==null)return '';if(typeof v==='string'||typeof v==='number'||typeof v==='boolean')return String(v);try{return JSON.stringify(v)}catch{return ''}};box.innerHTML=(state.room?.messages||[]).map(m=>{const html=safeHtml(m.html);const text=safeText(m.message);return `<div class="msg ${m.type==='system'?'system':''} ${m.type==='announcement'?'announcement':''} ${m.nickname===state.me?.nickname?'me':''}"><div class="meta"><span>${esc(safeText(m.nickname))}</span>${typeof m.user?.flag==='string'?m.user.flag:''}</div><div>${html||esc(text).replace(/\n/g,'<br>')}</div></div>`}).join('');box.scrollTop=box.scrollHeight}
function insertAtCursor(text){document.execCommand('insertText',false,text)}
function editorFor(kind){return kind==='private' ? $('privateInput') : $('generalInput')}
function setMobileView(view){state.mobileView=view;document.body.classList.toggle('mobile-show-private',view==='private');document.body.classList.toggle('mobile-show-general',view==='general');}
function buildEmojiPicker(pickerId,inputKind){const box=$(pickerId);if(!box)return;box.innerHTML=emojis.map(e=>`<button type="button" data-emoji="${e}">${e}</button>`).join('');box.querySelectorAll('[data-emoji]').forEach(b=>b.onclick=()=>{const input=editorFor(inputKind);if(input){input.focus();insertAtCursor(b.dataset.emoji)}box.classList.add('hidden')});}
buildEmojiPicker('generalEmojiPicker','general'); buildEmojiPicker('privateEmojiPicker','private');
$('generalEmojiBtn').onclick=()=>{$('generalEmojiPicker').classList.toggle('hidden');$('privateEmojiPicker').classList.add('hidden')};
$('privateEmojiBtn').onclick=()=>{$('privateEmojiPicker').classList.toggle('hidden');$('generalEmojiPicker').classList.add('hidden')};
document.addEventListener('click',e=>{if(!e.target.closest('#generalEmojiBtn')&&!e.target.closest('#generalEmojiPicker'))$('generalEmojiPicker').classList.add('hidden');if(!e.target.closest('#privateEmojiBtn')&&!e.target.closest('#privateEmojiPicker'))$('privateEmojiPicker').classList.add('hidden')});
function outgoingHtml(editor){return editor?.innerHTML.trim()||''}
bindEnterToSend('generalInput','generalForm');
$('generalForm').onsubmit=e=>{e.preventDefault();const html=outgoingHtml($('generalInput'));const message=plainRich($('generalInput'));if(message){socket.emit('chat:send',{message,html});$('generalInput').innerHTML=''}};
function plainRich(div){return (div?.innerText||div?.textContent||'').replace(/\u00a0/g,' ').trim().slice(0,500)}
function openPrivate(id){
  const u=state.room?.users?.find(x=>x.id===id); if(!u||!state.me||u.id===state.me.id)return;
  state.privateWith=u.id;state.privateChats.set(u.id,state.privateChats.get(u.id)||[]);state.privateUnread.set(u.id,0);state.privateOpen.add(u.id);updatePrivateTotalBadge();
  $('privateEmpty')?.classList.add('hidden');$('privateThreads')?.classList.remove('hidden');$('privateChat')?.classList.remove('hidden');$('privatePanel')?.classList.add('is-open');setMobileView('private');
  $('privateName').textContent=`${u.flag||''} ${u.nickname}`;$('privateMeta').textContent=`${u.countryName||''}`;
  renderPrivateTabs();renderPrivate();renderRoom();
}
function renderPrivateTabs(){const box=$('privateThreads');if(!box)return;const ids=[...state.privateOpen].filter(id=>state.room?.users.some(u=>u.id===id));if(!ids.length){box.classList.add('hidden');return}box.classList.remove('hidden');box.innerHTML=ids.map(id=>{const u=state.room.users.find(x=>x.id===id);const unread=state.privateUnread.get(id)||0;return `<button class="private-tab ${state.privateWith===id?'active':''}" data-private-tab="${id}">${u?.flag||'💬'} ${esc(u?.nickname||'Usuario')} ${unread?`<span class="pv-badge">${unread>99?'99+':unread}</span>`:''}</button>`}).join('');box.querySelectorAll('[data-private-tab]').forEach(b=>b.onclick=()=>openPrivate(b.dataset.privateTab));}
function updatePrivateTotalBadge(){const total=[...state.privateUnread.values()].reduce((a,b)=>a+b,0);$('privateDot').textContent=total>99?'99+':String(total||1);$('privateDot').classList.toggle('hidden',total===0)}
function renderRichContent(m){if(m.html)return m.html;return esc(m.message).replace(/\n/g,'<br>')}
function renderPrivate(){const arr=state.privateChats.get(state.privateWith)||[];$('privateMessages').innerHTML=arr.map(m=>`<div class="msg ${m.out?'me':''}"><div class="meta"><span>${m.out?'Tú':esc(m.from.nickname)}</span>${m.from.flag||''}</div><div>${renderRichContent(m)}</div></div>`).join('');$('privateMessages').scrollTop=$('privateMessages').scrollHeight;const blocked=state.blocked.has(state.privateWith);$('blockBtn').textContent=blocked?'🔓':'🔒';$('blockBtn').title=blocked?'Desbloquear':'Bloquear';$('blockBtn').setAttribute('aria-label',blocked?'Desbloquear':'Bloquear');}
function plainFromRich(){const div=$('privateInput');return (div.innerText||div.textContent||'').replace(/\u00a0/g,' ').trim().slice(0,300)}
function bindEnterToSend(inputId, formId){const input=$(inputId);const form=$(formId);if(!input||!form)return;input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit();}});}

bindEnterToSend('privateInput','privateForm');
$('privateForm').onsubmit=e=>{e.preventDefault();if(!state.privateWith)return;const html=outgoingHtml($('privateInput'));const message=plainFromRich();if(!message)return;if(state.blocked.has(state.privateWith))return showToast('Has bloqueado a este usuario. Desbloquéalo para escribirle.');socket.emit('private:send',{to:state.privateWith,message,html});state.privateChats.set(state.privateWith,[...(state.privateChats.get(state.privateWith)||[]),{out:true,from:state.me,message,html}]);$('privateInput').innerHTML='';renderPrivate();};
$('blockBtn').onclick=()=>{if(!state.privateWith)return;if(state.blocked.has(state.privateWith)){state.blocked.delete(state.privateWith);socket.emit('private:unblock',state.privateWith)}else{state.blocked.add(state.privateWith);socket.emit('private:block',state.privateWith)}renderPrivate()};
$('closePrivateBtn').onclick=()=>{if(!state.privateWith)return;state.privateOpen.delete(state.privateWith);const ids=[...state.privateOpen];state.privateWith=ids[0]||null;if(state.privateWith){openPrivate(state.privateWith)}else{$('privateChat')?.classList.add('hidden');$('privateEmpty')?.classList.remove('hidden');$('privateThreads')?.classList.add('hidden');$('privatePanel')?.classList.remove('is-open');renderPrivateTabs();renderRoom();setMobileView('general');}};

$('showGeneralMobile')?.addEventListener('click',()=>setMobileView('general'));
$('showGeneralFromPrivate')?.addEventListener('click',()=>setMobileView('general'));
$('privateSoundToggle').onclick=()=>{state.privateSound=!state.privateSound;$('privateSoundToggle').textContent=state.privateSound?'🔔':'🔕';$('privateSoundToggle').setAttribute('aria-pressed',String(state.privateSound))};
$('privateSoundVolume').oninput=e=>state.privateVolume=Number(e.target.value)/100;
function tone(freq,duration=.14,type='sine',gain=.06){if(!state.privateSound||state.privateVolume<=0)return;const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const ctx=window._chatAudio||new C();window._chatAudio=ctx;if(ctx.state==='suspended')ctx.resume();const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.value=freq;g.gain.value=gain*state.privateVolume;o.connect(g);g.connect(ctx.destination);const t=ctx.currentTime;o.start(t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.stop(t+duration)}
function playBuzz(){tone(185,.16,'square',.18);setTimeout(()=>tone(140,.16,'square',.18),155);setTimeout(()=>tone(185,.16,'square',.18),310);}
function playPrivatePing(){tone(740,.08,'sine',.08);setTimeout(()=>tone(930,.11,'sine',.07),90)}
function shakePrivate(){const el=$('privateChat');if(!el||el.classList.contains('hidden'))return;el.classList.remove('private-buzz');void el.offsetWidth;el.classList.add('private-buzz');setTimeout(()=>el.classList.remove('private-buzz'),520)}
socket.on('private:message',m=>{const id=m.from.id;if(!state.privateChats.has(id))state.privateChats.set(id,[]);state.privateChats.get(id).push({out:false,from:m.from,message:m.message,html:m.html||''});if(state.privateWith===id){renderPrivate()}else{state.privateUnread.set(id,(state.privateUnread.get(id)||0)+1);renderPrivateTabs();renderRoom()}updatePrivateTotalBadge();if(m.kind==='system')showToast(m.message);else playPrivatePing()});
socket.on('private:sent',d=>{});
socket.on('private:error',m=>showToast(m));
socket.on('notify:mention',d=>{playPrivatePing();showToast(d.message)});
socket.on('room:joined',d=>{state.me=d.me;state.room=d.room;$('joinModal').classList.add('hidden');$('home').classList.add('hidden');$('roomScreen').classList.remove('hidden');renderRoom()});
socket.on('room:state',r=>{state.room=r;if(state.privateWith&&!r.users.some(u=>u.id===state.privateWith)){state.privateOpen.delete(state.privateWith);state.privateWith=null}$('privateChat')?.classList.toggle('hidden',!state.privateWith);$('privateEmpty')?.classList.toggle('hidden',!!state.privateWith);renderRoom();renderPrivateTabs()});
socket.on('rooms:update',rooms=>{state.rooms=rooms;renderRooms()});
socket.on('join:error',m=>$('joinError').textContent=m);
socket.on('room:left',()=>{state.room=null;state.me=null;state.privateWith=null;state.privateChats.clear();state.privateUnread.clear();state.privateOpen.clear();$('roomScreen').classList.add('hidden');$('home').classList.remove('hidden');showToast('Has salido de la sala.')});
socket.on('moderation:kick',m=>showToast(m));socket.on('moderation:ban',m=>showToast(m));
setMobileView('general');
fetch('/api/meta').then(r=>r.json()).then(meta=>{state.meta=meta});detectCountry();
