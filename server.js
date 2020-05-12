const http = require('http');
const net = require('net');
const { URL } = require('url');
const crypto = require('crypto');

const message = require('./msg.js');
const frame = require('./frame.js');

const host = process.env.host || 'localhost';
var port = process.env.PORT || 3000;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const frameSize = 65535;

const peers = {};

function parseAirId(airId) {
  var ids = airId.split(':');
  return {
    uid: ids[0],
    host: ids[1],
    sessionId: ids[2]
  }
}

function sendToPeer(from, fin, key, msg) {
  msg.from = from;
  sendToPeerRaw(msg.to, fin, key, message.build(msg))
}

function sendToPeerRaw(to, fin, key, data) {
  var receiver = parseAirId(to);
  function send(uid, sessionId) {
    var rPeer = getPeer(uid, sessionId);
    if (rPeer != null) {
      var frm = frame.build(fin, key, data);
      if (frm != null)
        console.log("sending frame of length", frm.length);
      rPeer.send(frm);
    }
    else {
      console.warn("send: the peer doesnt exists");
    }
  }
  if (receiver.host == host) {
    if (receiver.sessionId != undefined) {
      //sending to a single peer
      send(receiver.uid, receiver.sessionId);
    }
    else {
      if (peers[receiver.uid] != undefined) {
        //sending to multiple peers
        Object.keys(peers[receiver.uid]).forEach((sessId) => {
          send(receiver.uid, sessId);
        })
      }
    }
  }
  else {
    /*if (sender.host == host) {
      //relay the message to the other base
    }*/
  }
}

function Peer(airId, socket) {
  return {
    airId,
    socket,
    send: function (msg) {
      if (msg != null)
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
  var isUpgraded = false;
  var ongoing = {};
  socket.on("data", (frm) => {
    if (!isUpgraded) {
      //possibly its a HTTP request
      var key = '';
      var headers = Buffer.from(frm).toString().split('\r\n');
      var sechead = headers.find((header) => {
        return (header.split(':')[0].trim() == 'Sec-WebSocket-Key');
      })
      var userAgent = headers.find((header) => {
        return (header.split(':')[0].trim() == 'User-Agent');
      })
      if (sechead != undefined) {
        key = sechead.split(':')[1].trim();
        if (userAgent != undefined) {
          console.log("connecting to a browser..");
        }
      }
      const digest = crypto.createHash('sha1')
        .update(key + GUID)
        .digest('base64');
      socket.write("HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${digest}\r\n` +
        "\r\n");
      isUpgraded = true;
    }
    else {
      var m = frame.parse(frm);
      var key = m.key;
      var fin = m.fin;
      console.log("---------------------");
      console.log("new msg from peer",Buffer.from(frm).toString(),'\n');
      console.log('FIN',m.fin);
      console.log('KEY',Buffer.from(m.key).toString());
      /////
      if (ongoing[key] != undefined) {
        //send the chunk
        console.log("sending a chunk..",key.toString());
        console.log("body length: ", m.data.length);
        sendToPeerRaw(ongoing[key].to, fin, key, m.data);
        if (fin) {
          console.log("Last chunk sent!");
          //delete the record
          delete ongoing[key];
        }
      }
      else {
        var msg = message.parse(m.data);
        if (msg.type != undefined) {
          if (msg.type == 'connect') {
            if (msg.uid != undefined) {
              uid = msg.uid.trim();
              if (uid.length) {
                sessionId = crypto.randomBytes(4).toString('hex');
                var airId = uid + ':' + host + ':' + sessionId;
                peer = Peer(airId, socket);
                addPeer(uid, sessionId, peer);
                var connectedMsg = frame.build(true, crypto.randomBytes(8), message.build({ 'type': 'connected', 'airid': airId }));//
                if (connectedMsg != null)
                  socket.write(connectedMsg);
              }
            }
          }
          else {
            if (peer != null && msg.to != undefined) {
              sendToPeer(peer.airId, fin, key, msg);//
              if (!fin) {
                //more msg supposed to arrive, store the rec in ongoing
                ongoing[key] = { to: msg.to }
                console.log("setting onging rec",ongoing);
              }
            }
          }
        }
        else {
          console.error("Received a corrupted request from peer ",msg);
        }
      }
      willContinue = !m.fin;
      console.log("---------------------");
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
  socket.setNoDelay(true);
  socket.uncork();
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
  console.log("Listening on PORT", port);
});