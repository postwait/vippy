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
var vippy = require('vippy'),
    os = require('os'),
    fs = require('fs'),
    vm = require('vm'),
    hostname = os.hostname(),
    config_file = '/etc/vippy.conf',
    plugins = [];

function usage(error) {
  if(error) console.log("Error: " + error + "\n");
  console.log(process.argv[1] + ":");
  console.log("\t-h");
  console.log("\t-n <node>");
  console.log("\t-c <config file>");
  console.log("\t-p <plugin file>");
  process.exit(error ? -1 : 0);
}
for(var i=2; i<process.argv.length; i++) {
  if(process.argv[i] == "-h") {
    usage();
  }
  else if(process.argv[i] == "-c") {
    if(process.argv.length < i+1) usage("-c requires and argument");
    config_file = process.argv[++i];
  }
  else if(process.argv[i] == "-n") {
    if(process.argv.length < i+1) usage("-n requires and argument");
    hostname = process.argv[++i];
  }
  else if(process.argv[i] == "-p") {
    if(process.argv.length < i+1) usage("-p requires and argument");
    plugins.push(process.argv[++i]);
  }
  else usage("bad arguments");
}

try {
  var sb = fs.statSync(config_file);
  if(!sb.isFile()) throw new Error("no such file '" + config_file + "'");
} catch (e) {
  console.log("config error: " + e);
  process.exit(-1);
}

var config = new vippy.Config(config_file, hostname),
    manager = new vippy.Manager(config),
    network = new vippy.Network(config, manager),
    controller = new vippy.Controller(config, manager);

plugins.forEach(function(file) {
  fs.readFile(file, 'utf8', function(err, data) {
    if(err) {
      config.log('err', 'Cannot read file '+file+': '+err);
      process.exit(-1);
    }
    var sandbox = vm.createContext({});
    for (var k in global) sandbox[k] = global[k];
    sandbox.global = sandbox;
    sandbox.config = config;
    sandbox.manager = manager
    sandbox.network = network;
    try {
      vm.runInNewContext(data, sandbox, file);
    }
    catch(e) {
      config.log('err', e.stack);
    }
  });
});

config.run();
