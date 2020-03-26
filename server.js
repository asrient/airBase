const http = require('http');
const net = require('net');
const { URL } = require('url');
const crypto = require('crypto');

const message = require('./msg.js');

const host = process.env.host || 'localhost';
var port = process.env.PORT || 3000;

const peers = {};

function parseAirId(airId) {
  var ids = airId.split(':');
  return {
    uid: ids[0],
    host: ids[1],
    sessionId: ids[2]
  }
}

function sendToPeer(from,msg) {
  var receiver = parseAirId(msg.to);
  var sender = parseAirId(from);
  msg.from=from;
  function send(uid, sessionId) {
    var rPeer = getPeer(uid, sessionId);
    if (rPeer != null) {
      rPeer.send(message.build(msg));
    }
    else {
      console.warn("send: the peer doesnt exists");
    }
  }
  if (receiver.host == host) {
    if (receiver.sessionId != undefined) {
      send(receiver.uid, receiver.sessionId);
    }
    else {
      if (peers[receiver.uid] != undefined) {
        Object.keys(peers[receiver.uid]).forEach((sessId) => {
          send(receiver.uid, sessId);
        })
      }
    }
  }
  else {
    if (sender.host == host) {
      //relay the message to the other base
    }
  }
}

function Peer(airId, socket) {
  return {
    airId,
    socket,
    send:function(msg){
      this.socket.write(msg)
    }
  }
}

function addPeer(uid, sessionId, peer) {
  if (peers[uid] != undefined) {
    peers[uid][sessionId] = peer;
  }
  else {
    peers[uid] = { [sessionId]: peer };
  }
}

function removePeer(uid, sessionId) {
  if (peers[uid] != undefined) {
    if (peers[uid][sessionId] != undefined) {
      delete peers[uid][sessionId];
      if (!Object.keys(peers[uid])) {
        delete peers[uid];
      }
    }
  }
}

function getPeer(uid, sessionId) {
  if (peers[uid] != undefined) {
    if (peers[uid][sessionId] != undefined) {
      return peers[uid][sessionId];
    }
    else return null;
  }
  else return null;
}

function initSocket(socket) {
  var peer = null;
  var sessionId = null;
  var uid = null;
  socket.on("data", (m) => {
    console.log("new msg from peer",Buffer.from(m).toString());
    console.log("---------------------");
     var msg = message.parse(m);
    if (msg.type != undefined) {
      if (msg.type == 'connect') {
        if (msg.uid != undefined) {
          uid = msg.uid.trim();
          if (uid.length) {
            sessionId = crypto.randomBytes(2).toString('hex');
            var airId = uid + ':' + host + ':' + sessionId;
            peer = Peer(airId, socket);
            addPeer(uid, sessionId, peer);
            socket.write(message.build({ 'type': 'connected', 'airid':airId }));
          }
        }
      }
      else {
        if (peer != null && msg.to != undefined) {
          sendToPeer( peer.airId, msg);
        }
      }
    }
    else{
      //possibly its a HTTP request
      socket.write("HTTP/1.1 101 Switching Protocols\r\n"+
      "Upgrade: websocket\r\n"+
      "Connection: Upgrade\r\n"+
      "\r\n");
    }
  })
  socket.on("error", (msg) => {
    console.error(msg);
  })
  socket.on("close", (msg) => {
    if (peer != null) {
      removePeer(uid, sessionId);
    }
    console.log("socket closed!");
  })
  socket.on("end", (msg) => {
    console.log("socket ended!");
    if (peer != null) {
      removePeer(uid, sessionId);
    }
  })
}

const base = net.createServer((socket) => {
  initSocket(socket);
})

base.listen(port, () => {
  console.log(`
   ------------------
  |                  |
  |     AirBase      |      
  |                  |
   ------------------
  `);
  console.log("Listening on PORT",port);
});