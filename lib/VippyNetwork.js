/*
 * Copyright (c) 2013, OmniTI Computer Consulting, Inc.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 *       copyright notice, this list of conditions and the following
 *       disclaimer in the documentation and/or other materials provided
 *       with the distribution.
 *     * Neither the name OmniTI Computer Consulting, Inc. nor the names
 *       of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written
 *       permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

var events = require('events'),
    net = require('net'),
    util = require('util'),
    ifeDriver = require('ife'),
    ife = new ifeDriver(),
    VippyNetwork;

VippyNetwork = function(config, manager) {
  var self = this;
  this._vc = config
  this._manager = manager;
  this._arpjobs = {};
  this._manager.on('up', function(iface) { self.up(iface); });
  this._manager.on('down', function(iface) { self.down(iface); });
  process.on('SIGINT', function() { self.shutdown(); });
  process.on('SIGQUIT', function() { self.shutdown(); });
  process.on('SIGTERM', function() { self.shutdown(); });
  process.on('uncaughtException', function(err) {
    console.error(err.stack);
    self.shutdown();
  });
}
util.inherits(VippyNetwork, events.EventEmitter);

VippyNetwork.prototype.shutdown_vips = function() {
  var self = this;
  self._vc.vips().forEach(function (vip) {
    vip.forEach(function (iface) {
      if(typeof(iface) === "object" && self.down(iface))
          self._vc.log('notice', 'dropping ' + iface.ip);
    });
  });
};

VippyNetwork.prototype.shutdown = function() {
  this._vc.log('notice', 'shutting down');
  this.shutdown_vips();
  this._vc.stop();
};

VippyNetwork.prototype.up = function(iface) {
  if(ife.up(iface)) {
    this.emit('up', true, iface);
    this.start_arp_accouncements(iface);
  }
  else {
    this.emit('up', false, iface);
    this._vc.log('crit', 'if_up(' + iface.name + '/' + iface.ip + ') failed');
  }
};

VippyNetwork.prototype.down = function(iface) {
  var ret;
  if(iface.state === undefined) 
    ret = ife.down(iface.ip)
  else
    ret = ife.down(iface.ip, iface.state)
  if(ret)
    this.emit('down', true, iface);
  else {
    this.emit('down', false, iface);
    this._vc.log('crit', 'if_down(' + iface.name + '/' + iface.ip + ') failed');
  }
  this._arpjobs[iface.ip] = false;
};

var cmpIPv4 = function(a, b) {
  if(typeof(a) === "string") a = a.split('\.').map(function(x) { return parseInt(x); });
  if(typeof(b) === "string") b = b.split('\.').map(function(x) { return parseInt(x); });
  for (var i=0; i<4; i++) {
    if(a[i] < b[i]) return -1;
    if(a[i] > b[i]) return 1;
  }
  return 0;
}
var explodeIPs = function(start, end) {
  var results = {};
  if(!net.isIPv4(start) || !net.isIPv4(end)) return [];
  var s = start.split('\.').map(function(x) { return parseInt(x); });
  var e = end.split('\.').map(function(x) { return parseInt(x); });
  var plus = function(a) {
    a[3]++;
    for (var i=3; i>0; i--) {
      if(a[i] > 255) {
        a[i]=0;
        a[i-1]++;
      }
    }
  }
  for(;cmpIPv4(s,e) <= 0;plus(s))
    results[s.join('.')] = '';
  return results;
}
VippyNetwork.prototype.gratarp_hitlist = function(iface) {
  var vectors = this._vc.notify();
  var tgts = {};
  var hitlist = [];
  if(!net.isIPv4(iface.ip)) return hitlist;
  for(var idx in vectors) {
    var vector = vectors[idx];
    var subtgt = {}
    // Get a list of IP targets
    if(vector === "arp-cache")
      subtgt = this._manager.arpcache();
    else if(typeof(vector) === "object")
      subtgt = explodeIPs(vector.network, vector.broadcast);
    // Add, but don't replace values (mac)
    for(var ip in subtgt)
      if(!tgts[ip]) tgts[ip] = subtgt[ip];
  }
  for(var ip in tgts) {
    if(cmpIPv4(ip, iface.network) >= 0 &&
       cmpIPv4(ip, iface.broadcast) <= 0) {
      hitlist.push([ip,tgts[ip]]);
    }
  }
  return hitlist;
};

VippyNetwork.prototype.start_arp_accouncements = function(iface) {
  var hitlist = this.gratarp_hitlist(iface),
      self = this, do_one_gratarp;
  this._arpjobs[iface.ip] = true;
  do_one_gratarp = function() {
    var nip = hitlist.shift();
    if(nip === undefined || self._arpjobs[iface.ip] == false) return;
    self._vc.log('debug', 'gratarp from ' + iface.name + '/' + iface.ip +
                 ' to ' + nip[0] + '[' + nip[1] + ']');
    var arpresponse = {
      name: iface.name,
      local_ip: iface.ip,
      remote_ip: nip[0],
    };
    if(nip[1]) arpresponse.remote_mac = nip[1];
    var sent = ife.gratarp(arpresponse, 2, nip[1] ? true : false);
    setTimeout(do_one_gratarp, 20); /* 50/s per interface */
  };
  do_one_gratarp();
};

module.exports = VippyNetwork;
