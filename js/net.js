'use strict';
// Сеть: браузеры соединяются напрямую (WebRTC через PeerJS), комната — по короткому коду.
// Ведущий держит партию у себя (правила, боты), гости присылают команды и ответы на запросы.

const NET = (() => {
  const LIB = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
  const PREFIX = 'tyrants-podzemya-';
  const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // без похожих O/0, I/1
  // PeerJS (режим json) не пропускает сообщения длиннее ~16 КБ, а при пересылке строки кавычки экранируются —
  // поэтому режем на части с запасом
  const CHUNK = 6000;
  let peer = null, role = null, roomCode = null, seq = 0;
  const conns = new Map();   // id собеседника -> соединение
  let H = {};                // обработчики: msg(from, data), open(from), close(from), error(text)

  function loadLib() {
    if (window.Peer) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = LIB;
      s.onload = res; s.onerror = () => rej(new Error('Не удалось загрузить сетевую библиотеку — нужен интернет.'));
      document.head.append(s);
    });
  }
  const newCode = () => Array.from({ length: 5 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join('');

  function attach(conn) {
    const parts = {};
    conn.on('open', () => { conns.set(conn.peer, conn); H.open && H.open(conn.peer); });
    conn.on('data', d => {
      if (typeof d !== 'string') return;
      if (d[0] === '#') {   // часть: #номер:индекс:всего:кусок
        const m = /^#(\d+):(\d+):(\d+):/.exec(d); if (!m) return;
        const p = parts[m[1]] || (parts[m[1]] = []); p[+m[2]] = d.slice(m[0].length);
        if (p.filter(x => x != null).length < +m[3]) return;
        delete parts[m[1]]; d = p.join('');
      }
      let msg; try { msg = JSON.parse(d); } catch (e) { return; }
      H.msg && H.msg(conn.peer, msg);
    });
    const gone = () => { if (conns.get(conn.peer) === conn) { conns.delete(conn.peer); H.close && H.close(conn.peer); } };
    conn.on('close', gone); conn.on('error', gone);
    // обрыв без закрытия: следим за состоянием ICE
    conn.on('iceStateChanged', st => { if (st === 'failed' || st === 'closed') gone(); });
  }
  function send(to, msg) {
    const c = conns.get(to); if (!c || !c.open) return false;
    const s = JSON.stringify(msg);
    if (s.length <= CHUNK) c.send(s);
    else { const id = ++seq, n = Math.ceil(s.length / CHUNK); for (let i = 0; i < n; i++) c.send(`#${id}:${i}:${n}:` + s.slice(i * CHUNK, (i + 1) * CHUNK)); }
    return true;
  }
  function makePeer(id) {
    return new Promise((res, rej) => {
      const p = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
      let opened = false;
      p.on('open', () => { opened = true; res(p); });
      p.on('error', e => {
        if (!opened) { p.destroy(); rej(e); return; }
        if (e.type === 'peer-unavailable') H.error && H.error('Комната не найдена — проверьте код.');
        else if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') H.error && H.error('Нет связи с сервером соединений.');
      });
      // связь с сервером знакомств пропала — сами соединения живут, но новых не будет; переподключаемся
      p.on('disconnected', () => { if (!p.destroyed) setTimeout(() => { try { p.reconnect(); } catch (e) {} }, 1500); });
    });
  }
  // ведущий: создаёт комнату, возвращает код
  async function host(handlers) {
    H = handlers; await loadLib();
    for (let k = 0; k < 5; k++) {
      const code = newCode();
      try { peer = await makePeer(PREFIX + code); } catch (e) { if (e.type === 'unavailable-id') continue; throw netError(e); }
      role = 'host'; roomCode = code;
      peer.on('connection', conn => attach(conn));
      return code;
    }
    throw new Error('Не удалось создать комнату, попробуйте ещё раз.');
  }
  // гость: подключается к комнате, возвращает id ведущего
  async function join(code, handlers) {
    H = handlers; await loadLib();
    code = code.trim().toUpperCase();
    if (!peer || peer.destroyed) { try { peer = await makePeer(); } catch (e) { throw netError(e); } }
    role = 'guest'; roomCode = code;
    const conn = peer.connect(PREFIX + code, { serialization: 'json', reliable: true });
    attach(conn);
    return conn.peer;
  }
  function netError(e) {
    const t = e && e.type;
    return new Error(t === 'browser-incompatible' ? 'Браузер не поддерживает прямые соединения.' : t === 'network' || t === 'server-error' || t === 'socket-error'
      ? 'Нет связи с сервером соединений — проверьте интернет.' : 'Ошибка сети: ' + (e && e.message || t || e));
  }
  function close() { for (const c of conns.values()) try { c.close(); } catch (e) {} conns.clear(); if (peer) peer.destroy(); peer = null; role = null; }
  const broadcast = msg => { for (const id of conns.keys()) send(id, msg); };
  const kick = id => { const c = conns.get(id); if (c) { conns.delete(id); try { c.close(); } catch (e) {} } };
  return { host, join, send, broadcast, close, kick, get role() { return role; }, get code() { return roomCode; }, get id() { return peer && peer.id; } };
})();
