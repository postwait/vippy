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
    util = require('util'),
    crypto = require('crypto'),
    ifeDriver = require('ife'),
    ife = new ifeDriver(),
    VippyManager;

VippyManager = function(vc, hostname) {
  var self = this;
  this.vc = vc;
  this.hostname = hostname || vc.hostname() || os.hostname();
  this.secret = '';
  this.age = {};
  this.active = {};
  this.arps = {}
  this.ownership = {};
  vc.on('announce', function(p) { self.update(p); });
};
util.inherits(VippyManager, events.EventEmitter);

VippyManager.prototype.update = function(p) {
  this.arps[p['me']] = p['arpcache'];
  this.active[p['me']] = p['active'];
  this.age[p['me']] = +(new Date());
  this.solve();
};

VippyManager.prototype.drop = function(n) {
  delete this.arps[n];
  delete this.age[n];
};

VippyManager.prototype.arpcache = function() {
  var agg = {};
  for (var host in this.arps) {
    for (var ip in this.arps[host]) {
      agg[ip] = this.arps[host][ip];
    }
  }
  return agg;
};

var hasChanged = function(s1, s2) {
  if(s1 == null && s2 == null) return false;
  if(s1 == null || s2 == null) return true;
  if(s1.length != s2.length) return true;
  for(var i=0; i<s1.length; i++) {
    if(s1[i].length != s2[i].length) return true;
    for(var j=0; j<s1[i].length; j++) {
      if(typeof(s1[i][j]) != typeof(s2[i][j])) return true;
      if(typeof(s1[i][j]) === "string") {
        if(s1[i][j] != s2[i][j]) return true;
      }
      else if(typeof(s1[i][j] === "object")) {
        if(s1[i][j].ip != s2[i][j].ip) return true;
      } else return true;
    }
  }
  return false;
}

VippyManager.prototype.solve = function() {
  if(!this.vc.mature()) return;
  var stale = this.vc.stale() * 1000;
  for(var node in this.age) {
    if(new Date() - this.age[node] > stale)
      this.active[node] = false;
  }

  var orig_vips = this.vc.vips(), vips = [],
      nodes = [];
  this.last_ownership = this.ownership;
  this.ownership = { '_': [] };
  for(var node in this.active) {
    if(this.active[node]) {
      this.ownership[node] = [];
      nodes.push(node);
    }
  }
  // First handle explicirt preferences
  for(var idx in orig_vips) {
    var vip = orig_vips[idx];
    if(typeof(vip[0]) === 'string' && this.active[vip[0]])
      this.ownership[node].push(vip);
    else {
      vips.push(orig_vips[idx]);
    }
  }

  // Apply a loose variant of consistent hashing to distribute
  // remaining interfaces.
  for(var idx in vips) {
    var vip = vips[idx];
    var ip = (typeof(vip[0]) === "string") ? vip[1].ip : vip[0].ip;
    var n = nodes.map(function(x) {
      var shasum = crypto.createHash('md5');
      shasum.update(x + "|" + ip);
      return shasum.digest('hex') + ':' + x;
    }).sort();
    if(n.length == 0) {
      this.ownership['_'].push(vip);
    }
    else {
      var node = n[0].substr(n[0].indexOf(':')+1);
      this.ownership[node].push(vip);
    }
  }

  if(hasChanged(this.last_ownership[this.hostname],
                this.ownership[this.hostname])) {
    this.vc.log('info', 'state changed...');
    this.reconcile_interfaces();
  }
};

VippyManager.prototype.reconcile_interfaces = function() {
  var current = ife.list();
  // Make a map of currently plumbed IPs.
  var current_ips = {};
  for(var i in current)
    current_ips[current[i].ip] = current[i];

  for(var owner in this.ownership) {
    var up = (owner == this.hostname);
    var vips = this.ownership[owner];
    for(var idx in vips) {
      var vip = vips[idx];
      for(var sidx in vip) {
        var iface = vip[sidx];
        if(typeof(iface) !== "object") continue;
        if(up && !current_ips[iface.ip]) {
          this.vc.log('notice', 'bringing up ' + iface.name + '/' + iface.ip);
          this.emit('up', iface);
        }
        else if(!up && current_ips[iface.ip]) {
          this.vc.log('notice', 'bringing down ' + iface.name + '/' + iface.ip);
          this.emit('down', iface);
        }
      }
    }
  }
};

module.exports = VippyManager;
