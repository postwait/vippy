var events = require('events'),
    util = require('util'),
    os = require('os'),
    net = require('net'),
    fs = require('fs'),
    dgram = require('dgram'),
    crypto = require('crypto'),
    ifeDriver = require('ife'),
    ife = new ifeDriver(),
    VippyConf;

VippyConfig = function(file, hostname) {
  this.hostname = hostname || os.hostname();
  this.config = {};
  this.secret = '';
  var data = fs.readFileSync(file, 'utf-8');
  this.config = JSON.parse(data);
  for (var i in this.config.vips) {
    var vlist = this.config.vips[i];
    for (var j in vlist) {
      if(typeof(vlist[j]) === "string") continue;
      var replace = ip2iface(vlist[j].ip);
      replace.name = vlist[j].interface;
      vlist[j] = replace;
    }
  }
  this.secret = this.config.secret;
  this.refresh_arpcache();
  delete this.config.secret;
};
util.inherits(VippyConfig, events.EventEmitter);

var ip2iface = function (ip_w_mask) {
  var parts = ip_w_mask.split(/\//);
  if(parts == null || !net.isIPv4(parts[0])) return null;
  var ip = parts[0], mask = (parts[1] === undefined) ? 32 : parseInt(parts[1]);
  if(mask > 32 || mask < 0) return null;
  var p = ip.split(/\./).map(function (x) { return parseInt(x); });
  var nm = [ 0, 0, 0, 0 ];
  for (var i=0; i<4; i++) {
    var bits = mask - (i * 8);
    if(bits > 7) nm[i] = 255;
    else if(bits > 0) nm[i] = 255 >> (8-bits) << (8-bits);
  }
  var bc = p.map(function(x,i) { return x | (~nm[i] & 0xff); });
  var nw = p.map(function(x,i) { return x & nm[i]; });
  
  return { 'ip': p.join('.'),
           'netmask': nm.join('.'),
           'broadcast': bc.join('.'),
           'network': nw.join('.') };
};

VippyConfig.prototype.mature = function() {
  var age = new Date() - this._lastConfigChange;
  var mature = this.config.mature || 5;
  return age > (mature * 1000);
};

VippyConfig.prototype.stale = function() {
  return this.config.stale || 3;
};

VippyConfig.prototype.active = function(v) {
  if(v !== undefined) this._active = v;
  if(!this.mature()) return false;
  if(this._active !== undefined) return this._active;
  return true;
};

VippyConfig.prototype.vips = function() {
  return this.config.vips;
};

VippyConfig.prototype.configHash = function(conf, nonce) {
  var sorter = function(a,b) {
    if(a['ip'] < b['ip']) return -1;
    if(a['ip'] > b['ip']) return 1;
    return 0;
  };
  str = conf.vips.map(function(vif) {
    return vif.sort(sorter).map(function(vip) {
      if(typeof(vip) === "string") return vip;
      return vip['ip']
    }).join(',');
  }).join("\n");
  str = str + "\n" + conf.nodes.join('|');
  str = str + "\n" + this.secret + "\n";
  var shasum = crypto.createHash('sha256');
  if(this._lastConfig != str) {
    this._lastConfig = str;
    this._lastConfigChange = +(new Date());
  }
  str = str + nonce;
  shasum.update(str);
  return shasum.digest('hex');
};

VippyConfig.prototype.refresh_arpcache = function() {
  var t = ife.arpcache();
  this.private_arp_cache = {};
  for(var ip in t) {
    var octets = ip.split(/\./);
    // skip IP multicast
    if(octets[0] >= 224 && octets[0] <= 239) continue;
    this.private_arp_cache[ip] = t[ip];
  }
}

VippyConfig.prototype.announce = function() {
  var nonce = crypto.pseudoRandomBytes(32).toString('hex');
  var message = {
    me: this.hostname,
    active: this.active(),
    vips: this.config.vips,
    nodes: this.config.nodes,
    hash: this.configHash(this.config, nonce),
    nonce: nonce,
    arpcache: this.private_arp_cache,
  };
  var payload = new Buffer(JSON.stringify(message));
  this.client.send(payload, 0, payload.length, this.chatport, this.chataddr);
}

VippyConfig.prototype.run = function() {
  var vc = this;
  if(vc.running) return;
  vc.running = true;
  vc.client = dgram.createSocket("udp4");
  var addr = vc.config.chat.split(':');
  vc.chatport = parseInt(addr[1]);
  vc.chataddr = addr[0];
  var completeBind = function() {
    vc.client.addMembership(vc.chataddr);
    vc.client.setBroadcast(true);
    vc.client.setMulticastTTL(128);
    vc.client.on('message', function(data) {
      var inbound = JSON.parse(data.toString('utf-8'));
      var expected = vc.configHash(vc.config, inbound.nonce);
      if(inbound['hash'] != expected)
        vc.emit('ignore', 'hash', inbound);
      else {
        var good = false;
        for(var idx in vc.config.nodes) {
          if(vc.config.nodes[idx] == inbound['me']) {
            vc.emit('announce', inbound);
            good = true;
          }
        }
        if(!good) vc.emit('ignore', 'node', inbound);
      }
    });
    vc.chatJob = setInterval(function() {
      vc.announce();
    }, 1000 * (vc.config.interval || 1));
  };
  vc.client.bind(vc.chatport);
  completeBind();
  vc.arpJob = setInterval(function() {
    vc.refresh_arpcache();
  }, 5000);
}

VippyConfig.prototype.stop = function() {
  if(this.running) {
    removeInterval(this.arpJob);
    removeInterval(this.chatJob);
    this.client.close();
    delete this.client;
    this.running = false;
  }
}

module.exports = VippyConfig;
