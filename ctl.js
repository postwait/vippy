#!/usr/bin/env node
/*
Copyright (c) 2013, OmniTI Computer Consulting, Inc.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above
      copyright notice, this list of conditions and the following
      disclaimer in the documentation and/or other materials provided
      with the distribution.
    * Neither the name OmniTI Computer Consulting, Inc. nor the names
      of its contributors may be used to endorse or promote products
      derived from this software without specific prior written
      permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

var http = require('http'),
    util = require('util'),
    fs = require('fs'),
    socketPath = '/var/run/vippy.socket',
    cmd = process.argv[2];

if(cmd == '-s') {
  socketPath=process.argv[3];
  cmd = process.argv[4];
}

try {
  var sb = fs.statSync(socketPath);
  if(!sb.isSocket()) throw new Error("is not a socket '" + socketPath +"'");
} catch(e) {
  console.log("control socket: " + e);
  process.exit(-1);
}

function runCmd(cmd, handler) {
  var req = http.request({
    socketPath: socketPath,
    path: '/' + cmd,
  }, function(res) {
    var body = '';
    res.on('data', function(data) { body = body + data; });
    res.on('end', function() {
      handler(JSON.parse(body));
    });
  });
  req.end();
}

function IP2nm(ip) {
  var nm = 0;
  ip.split(/\./)
    .map(function(s) {return parseInt(s); })
    .forEach(function (octet) { while(octet) { nm++; octet = octet >> 1; } });
  return nm;
}
function prettyVIF(vif) {
  var out = vif.filter(function(x) { return typeof(x) === "object"; })
               .map(function(v) { return v.ip + "/" + IP2nm(v.netmask); })
               .join(" ");
  if(typeof(vif[0]) === "string") return out + " P(" + vif[0] + ")";
  return out;
}
function statusOutput(info) {
  if(info.state && info.config) {
    var s = info.state, c = info.config, vifown = {};
    console.log("State:  " + (s.active ? "active" : "inactive"));
    if(!s.active) console.log("Reason: " + s.inactive_reason);
    for (var owner in s.ownership) {
      s.ownership[owner].forEach(function (vif) {
        vifown[prettyVIF(vif)] = (owner == "_") ? '(unowned)' : owner;
      });
    }
    c.vips.forEach(function(vif) {
      var pretty = prettyVIF(vif);
      var out = util.format("%s%s: %s",
                            (vifown[pretty] == info.identity) ? "(*) " : "    ",
                            vifown[pretty] ? vifown[pretty] : "???",
                            pretty);
      console.log(out);
    });
  }
  else console.log(info['config']);
}

switch(cmd) {
  case 'status':
    runCmd('status', statusOutput);
    break;
  default:
    runCmd(cmd, console.log);
}
