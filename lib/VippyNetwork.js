var events = require('events'),
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
  process.on('SIGHUP', function() { self.shutdown(); });
  process.on('SIGINT', function() { self.shutdown(); });
  process.on('SIGQUIT', function() { self.shutdown(); });
}
util.inherits(VippyNetwork, events.EventEmitter);

VippyNetwork.prototype.shutdown = function() {
  this._vc.log('notice', 'shutting down');
  var vips = this._vc.vips();
  for(var a in vips) {
    var vip = vips[a];
    for(var j in vip) {
      var iface = vip[j];
      if(typeof(iface) === "object") {
        this._vc.log('notice', 'dropping ' + iface.ip);
        this.down(iface);
      }
    }
  }
  this._vc.stop();
};

VippyNetwork.prototype.up = function(iface) {
  if(ife.up(iface)) {
    this.emit('up', true, iface);
  }
  else {
    this.emit('up', false, iface);
    this._vc.log('crit', 'if_up(' + iface.name + '/' + iface.ip + ') failed');
  }
    this.start_arp_accouncements(iface);
};

VippyNetwork.prototype.down = function(iface) {
  if(ife.down(iface.ip))
    this.emit('down', true, iface);
  else {
    this.emit('down', false, iface);
    this._vc.log('crit', 'if_down(' + iface.name + '/' + iface.ip + ') failed');
  }
  this._arpjobs[iface.ip] = false;
};

var cmpIP = function(a, b) {
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
  var s = start.split('\.').map(function(x) { return parseInt(x); });
  var e = end.split('\.').map(function(x) { return parseInt(x); });
  var plus = function(a) {
    a[3]++;
    for (var i=3; i>0; i--) {
      if(a[i] > 255) {
        a[i]=0;
        a[i-i]++;
      }
    }
  }
  for(;cmpIP(s,e) <= 0;plus(s))
    results[s.join('.')] = '';
  return results;
}
VippyNetwork.prototype.gratarp_hitlist = function(iface) {
  var vectors = this._vc.notify();
  var tgts = {};
  var hitlist = [];
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
    if(cmpIP(ip, iface.network) >= 0 &&
       cmpIP(ip, iface.broadcast) <= 0) {
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
