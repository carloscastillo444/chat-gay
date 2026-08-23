const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { SUPER_ADMIN_NICKNAME, SUPER_ADMIN_PASSWORD } = require('./config');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
const PORT = process.env.PORT || 3000;
const ROOM_COUNT = 20;
const ROOM_CAPACITY = 500;
const MAX_CHAT = 500;
const MAX_PRIVATE = 300;
const MAX_NICK = 22;

const roomNames = [
  'Gays de toda Venezuela', 'Gays Latinos', 'Rainbow Lounge', 'Arcoiris Caribe',
  'Gays de Caracas', 'Gays de Valencia', 'Gays de Maracaibo', 'Gays de Barquisimeto',
  'Gays de Margarita', 'Latinos con Orgullo', 'Amigos del Arcoiris', 'Rainbow Cafe',
  'Entre Chicos', 'Confesiones Rainbow', 'Chat Sin Etiquetas', 'Orgullo Venezolano',
  'Venezuela Rainbow', 'Gays Sin Fronteras', 'Amistades Nuevas', 'Gran Chat Rainbow'
];

const countries = [
  ['VE','Venezuela'],['CO','Colombia'],['AR','Argentina'],['MX','Mexico'],['CL','Chile'],['PE','Peru'],['EC','Ecuador'],['BO','Bolivia'],['UY','Uruguay'],['PY','Paraguay'],['BR','Brasil'],['CR','Costa Rica'],['PA','Panama'],['DO','Republica Dominicana'],['PR','Puerto Rico'],['US','Estados Unidos'],['CA','Canada'],['ES','España'],['FR','Francia'],['PT','Portugal'],['IT','Italia'],['DE','Alemania'],['GB','Reino Unido'],['NL','Paises Bajos'],['BE','Belgica'],['CH','Suiza'],['AT','Austria'],['SE','Suecia'],['NO','Noruega'],['DK','Dinamarca'],['FI','Finlandia'],['IE','Irlanda'],['AU','Australia'],['NZ','Nueva Zelanda'],['JP','Japon'],['KR','Corea del Sur'],['IN','India'],['ZA','Sudafrica'],['PH','Filipinas'],['TH','Tailandia'],['SG','Singapur'],['IL','Israel'],['MA','Marruecos'],['NG','Nigeria'],['GH','Ghana'],['KE','Kenia'],['TR','Turquia'],['GR','Grecia'],['RO','Rumania'],['PL','Polonia'],['CZ','Chequia'],['HU','Hungria'],['UA','Ucrania'],['RU','Rusia']
];
const countryMap = new Map(countries);

const rooms = new Map();
for (let i = 1; i <= ROOM_COUNT; i++) {
  rooms.set(String(i), { id: String(i), name: roomNames[i - 1], users: new Map(), messages: [] });
}
const bannedIps = new Set();

function sanitize(s, max) { return String(s ?? '').trim().slice(0, max); }
function flagFromCode(code) { return String(code || '').toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt())); }
function publicUser(u) {
  return { id: u.id, nickname: u.nickname, country: u.country, countryName: u.countryName, flag: flagFromCode(u.country), admin: !!u.admin };
}
function roomSnapshot(room) {
  return { id: room.id, name: room.name, count: room.users.size, capacity: ROOM_CAPACITY, occupied: room.users.size >= ROOM_CAPACITY, users: [...room.users.values()].map(publicUser), messages: room.messages.slice(-100) };
}
function roomsSnapshot() {
  return [...rooms.values()].map(r => ({ id: r.id, name: r.name, count: r.users.size, occupied: r.users.size >= ROOM_CAPACITY }));
}
function broadcastRoom(room) { io.to(`room:${room.id}`).emit('room:state', roomSnapshot(room)); }
function broadcastRooms() { io.emit('rooms:update', roomsSnapshot()); }
function addRoomMessage(room, nickname, message, type='general', extra={}) {
  room.messages.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, nickname, message: sanitize(message, MAX_CHAT), type, at: Date.now(), ...extra });
  if (room.messages.length > MAX_CHAT) room.messages.shift();
}
function findUserByNickname(room, nickname) {
  const target = nickname.toLowerCase();
  return [...room.users.values()].find(u => u.nickname.toLowerCase() === target);
}
function privateSocket(userId) { return io.sockets.sockets.get(userId); }
function sanitizeRich(html) {
  let out = String(html ?? '').slice(0, MAX_PRIVATE * 8);
  out = out.replace(/<\/?(?:script|style|iframe|object|embed|form|input|button|textarea|select|svg|math)[^>]*>/gi, '');
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  out = out.replace(/<(?!\/?(?:strong|b|em|i|u|br|span)\b)[^>]+>/gi, '');
  out = out.replace(/<span\b[^>]*>/gi, tag => {
    const m = tag.match(/style\s*=\s*"([^"]*)"/i);
    if (!m) return '<span>';
    const safe = m[1].split(';').map(x => x.trim()).filter(Boolean).filter(decl => {
      return /^(?:color\s*:\s*#[0-9a-f]{3,8}|background-image\s*:\s*linear-gradient\([^;]+\)|-webkit-background-clip\s*:\s*text|background-clip\s*:\s*text)$/i.test(decl);
    });
    return safe.length ? `<span style="${safe.join(';')}">` : '<span>';
  });
  return out.trim();
}
function richToPlain(html) {
  return String(html ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().slice(0, MAX_PRIVATE);
}
function sendPrivate(toSocket, fromUser, payload, kind='private', extra={}) {
  toSocket.emit('private:message', { id:`${Date.now()}-${Math.random().toString(16).slice(2)}`, from:publicUser(fromUser), message: payload.message, html: payload.html || '', kind, at:Date.now(), ...extra });
}
function systemPrivate(user, message) {
  io.to(user.id).emit('private:message', { id:`sys-${Date.now()}-${Math.random().toString(16).slice(2)}`, from:{id:'system',nickname:'Sistema',flag:'🌈',admin:true}, message: sanitize(message, MAX_PRIVATE), html:'', kind:'system', at:Date.now() });
}
function removeUser(socket, reason='Has salido de la sala.') {
  const roomId = socket.data.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;
  const user = room.users.get(socket.id);
  if (user) addRoomMessage(room, 'Sistema', `${user.nickname} salió de la sala.`, 'system');
  room.users.delete(socket.id);
  socket.leave(`room:${roomId}`);
  socket.data.roomId = null;
  socket.data.user = null;
  socket.data.blockedUsers = new Set();
  socket.data.ip = null;
  socket.emit('room:left', reason);
  broadcastRoom(room);
  broadcastRooms();
}

app.get('/api/meta', (req,res)=>res.json({ rooms: roomsSnapshot(), countries }));
app.get('/api/geo', async (req,res)=>{
  try {
    const forwarded = req.headers['x-forwarded-for'];
    const candidate = String(forwarded || '').split(',')[0].trim();
    const ip = candidate && !candidate.includes(':') ? candidate : null;
    const url = ip ? `https://ipwho.is/${encodeURIComponent(ip)}` : 'https://ipwho.is/';
    const r = await fetch(url, { signal: AbortSignal.timeout(4500) });
    if (!r.ok) throw new Error('geo failed');
    const data = await r.json();
    const iso = String(data?.country_code || '').toUpperCase();
    if (!countryMap.has(iso)) throw new Error('unknown country');
    res.json({ country: iso, countryName: countryMap.get(iso) });
  } catch {
    res.json({ country: '', countryName: '' });
  }
});
app.use(express.static(path.join(__dirname, 'public')));
app.use((req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

function getClientIp(socket) {
  const forwarded = socket.handshake?.headers?.['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '').split(',')[0].trim();
  const candidate = raw || socket.handshake?.address || socket.conn?.remoteAddress || '';
  return String(candidate).replace(/^::ffff:/, '').trim();
}

io.on('connection', socket => {
  socket.data.ip = getClientIp(socket);
  socket.emit('rooms:update', roomsSnapshot());

  socket.on('profile:check-admin', payload => {
    const nickname = sanitize(payload?.nickname, MAX_NICK);
    socket.emit('profile:admin-needed', { needed: nickname.toLowerCase() === SUPER_ADMIN_NICKNAME.toLowerCase() });
  });

  socket.on('room:join', payload => {
    const nickname = sanitize(payload?.nickname, MAX_NICK);
    const roomId = sanitize(payload?.roomId, 10);
    const country = sanitize(payload?.country, 2).toUpperCase();
    const room = rooms.get(roomId);
    const countryName = countryMap.get(country);
    const adminRequested = !!payload?.adminPassword && nickname.toLowerCase() === SUPER_ADMIN_NICKNAME.toLowerCase();

    if (!nickname) return socket.emit('join:error','El nickname es obligatorio.');
    if (!room) return socket.emit('join:error','La sala seleccionada no existe.');
    if (room.users.size >= ROOM_CAPACITY) return socket.emit('join:error','Esa sala está ocupada. Ha llegado a 500 participantes.');
    if (bannedIps.has(socket.data.ip)) return socket.emit('join:error','Esta conexión ha sido bloqueada para todas las salas por el Super Host.');
    if (!country || !countryName) return socket.emit('join:error','No pudimos detectar tu país automáticamente. Intenta de nuevo.');
    if (nickname.toLowerCase() === SUPER_ADMIN_NICKNAME.toLowerCase() && !adminRequested) return socket.emit('join:error','Esta cuenta requiere la contraseña de Super Host.');
    if (adminRequested && String(payload.adminPassword) !== SUPER_ADMIN_PASSWORD) return socket.emit('join:error','Contraseña de Super Host incorrecta.');
    if (findUserByNickname(room, nickname)) return socket.emit('join:error','Ese nickname ya está en esta sala.');

    if (socket.data.roomId) removeUser(socket, 'Has cambiado de sala.');
    const user = { id:socket.id, nickname, country, countryName, admin: nickname.toLowerCase() === SUPER_ADMIN_NICKNAME.toLowerCase() && adminRequested };
    room.users.set(socket.id,user);
    socket.data.roomId=roomId;
    socket.data.user=user;
    socket.data.blockedUsers=socket.data.blockedUsers || new Set();
    socket.join(`room:${roomId}`);
    addRoomMessage(room,'Sistema',`${nickname} entró a la sala.`,'system');
    socket.emit('room:joined',{room:roomSnapshot(room), me:publicUser(user)});
    broadcastRoom(room);
    broadcastRooms();
  });

  socket.on('chat:send', payload => {
    const room=rooms.get(socket.data.roomId), user=socket.data.user; if(!room||!user) return;
    const html=sanitizeRich(payload?.html || '');
    const message=sanitize(payload?.message || richToPlain(html),MAX_CHAT); if(!message) return;
    if (message.startsWith('/')) return handleCommand(socket, message);
    if (room.mutedUntil && room.mutedUntil > Date.now() && !user.admin) {
      const remaining = Math.ceil((room.mutedUntil - Date.now()) / 1000);
      return systemPrivate(user, `El chat general está silenciado por el Super Host. Intenta de nuevo en ${remaining}s.`);
    }
    if (room.mutedUntil && room.mutedUntil <= Date.now()) room.mutedUntil = 0;
    if (user.quiet) return systemPrivate(user,'Por favor debes moderar tu vocabulario. Has sido silenciado en el chat general de esta sala.');
    const mentionRegex = /@([\wÀ-ÿ.-]{1,22})/g; let m; const mentioned=[];
    while((m=mentionRegex.exec(message))) { const target=findUserByNickname(room,m[1]); if(target && target.id!==user.id) mentioned.push(target); }
    addRoomMessage(room,user.nickname,message,'general',{ user:publicUser(user), html });
    broadcastRoom(room);
    for (const target of mentioned) io.to(target.id).emit('notify:mention',{from:publicUser(user),message:`${user.nickname} te mencionó en ${room.name}.`});
  });

  socket.on('private:send', payload => {
    const room=rooms.get(socket.data.roomId), user=socket.data.user; if(!room||!user) return;
    const targetId=sanitize(payload?.to,60);
    const html=sanitizeRich(payload?.html || '');
    const plain=sanitize(payload?.message || richToPlain(html),MAX_PRIVATE);
    if(!targetId || !plain) return;
    const target=room.users.get(targetId); if(!target) return socket.emit('private:error','Ese usuario ya no está en la sala.');
    if(target.id===user.id) return;
    const targetSocket=privateSocket(target.id);
    const isBlockedByTarget=!!targetSocket?.data?.blockedUsers?.has(user.id);
    if (isBlockedByTarget) return socket.emit('private:error','No puedes enviar mensajes privados a este usuario porque te ha bloqueado.');
    if (socket.data.blockedUsers?.has(target.id)) return socket.emit('private:error','Has bloqueado a este usuario. Desbloquéalo para escribirle.');
    if (!targetSocket) return socket.emit('private:error','Ese usuario ya no está conectado.');
    sendPrivate(targetSocket, user, {message:plain,html});
    socket.emit('private:sent',{to:publicUser(target),message:plain,html,at:Date.now()});
  });

  socket.on('private:block', targetId => {
    socket.data.blockedUsers ||= new Set();
    socket.data.blockedUsers.add(String(targetId));
    socket.emit('private:blocked',String(targetId));
  });
  socket.on('private:unblock', targetId => {
    socket.data.blockedUsers ||= new Set();
    socket.data.blockedUsers.delete(String(targetId));
    socket.emit('private:unblocked',String(targetId));
  });
  socket.on('private:buzz', targetId => {
    const room=rooms.get(socket.data.roomId), user=socket.data.user; if(!room||!user) return;
    const target=room.users.get(String(targetId)); if(!target || target.id===user.id) return;
    if(socket.data.blockedUsers?.has(target.id)) return;
    const targetSocket=privateSocket(target.id);
    if(targetSocket?.data?.blockedUsers?.has(user.id)) return;
    io.to(target.id).emit('private:buzz',{from:publicUser(user)});
  });

  socket.on('leave:room', ()=>removeUser(socket,'Has salido de la sala.'));
  socket.on('disconnect', ()=>removeUser(socket,'Desconectado.'));

  function handleCommand(socket, command) {
    const room=rooms.get(socket.data.roomId), user=socket.data.user; if(!room||!user) return;
    if(!user.admin) return systemPrivate(user,'No tienes permisos de Super Host para usar comandos de moderación.');
    const parts=command.trim().split(/\s+/); const cmd=parts[0].toLowerCase(); const nick=parts.slice(1).join(' ').trim();
    if(cmd==='/kick' && nick){ const target=findUserByNickname(room,nick); if(!target) return systemPrivate(user,'No encontré a ese usuario en la sala.'); io.to(target.id).emit('moderation:kick','Has sido expulsado de esta sala por el Super Host.'); const ts=io.sockets.sockets.get(target.id); if(ts) removeUser(ts,'Has sido expulsado.'); return; }
    if(cmd==='/ban' && nick){
      const target=findUserByNickname(room,nick);
      if(!target) return systemPrivate(user,'No encontré a ese usuario en la sala.');
      const targetIp=io.sockets.sockets.get(target.id)?.data?.ip;
      if(!targetIp) return systemPrivate(user,'No pude identificar la conexión de ese usuario.');
      bannedIps.add(targetIp);
      for (const [sid, s] of io.sockets.sockets) {
        if (s.data?.ip === targetIp) {
          s.emit('moderation:ban','Tu conexión ha sido bloqueada para todas las salas por el Super Host.');
          removeUser(s,'Has sido bloqueado.');
        }
      }
      return;
    }
    if(cmd==='/quiet' && nick){ const target=findUserByNickname(room,nick); if(!target) return systemPrivate(user,'No encontré a ese usuario en la sala.'); target.quiet=true; systemPrivate(target,'Por favor debes moderar tu vocabulario. Has sido silenciado en el chat general de esta sala.'); broadcastRoom(room); return; }
    if(cmd==='/unquiet' && nick){ const target=findUserByNickname(room,nick); if(target){ target.quiet=false; systemPrivate(target,'Tu silencio ha sido levantado por el Super Host.'); broadcastRoom(room); } return; }
    if(cmd==='/announce' && nick){ addRoomMessage(room,'Super Host',parts.slice(1).join(' '),'announcement'); broadcastRoom(room); return; }
    if(cmd==='/muteall'){ room.mutedUntil=Date.now()+60000; addRoomMessage(room,'Super Host','El chat general ha sido pausado durante 60 segundos.','announcement'); broadcastRoom(room); return; }
    systemPrivate(user,'Comandos disponibles: /kick nick, /ban nick, /quiet nick, /unquiet nick, /announce mensaje, /muteall');
  }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Chat Gay ejecutándose en el puerto ${PORT}`);
});
