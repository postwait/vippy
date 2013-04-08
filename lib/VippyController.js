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
    http = require('http'),
    VippyController;

VippyController = function(config, manager) {
  var self = this;
  this._config = config;
  this._manager = manager

  this._stats = {
    'net': { 'ignore': 0,
             'send-announce': 0,
             'recv-announce': 0,
           },
    'state-changes': 0
  };
  ['ignore','send-announce','recv-announce'].forEach(function (x) {
    self._config.on(x, function() { self._stats.net[x]++; });
  });
  this._manager.on('state-change',
                   function() { self._stats['state-changes']++ });

  var s = this._config.management_socket();
  this._server = http.createServer();
  this._server.on('request', function(req,res) {
    self.handle(req,res);
  });
  process.on('SIGINT', function() { self._server.close(); });
  process.on('SIGQUIT', function() { self._server.close(); });
  this._server.listen(s);
};
util.inherits(VippyController, events.EventEmitter);

VippyController.prototype.handle = function(request, response) {
  response.setHeader('Content-Type', 'text/json');
  if(request.url == "/status") return this.status(request, response);
  response.statusCode = 404;
  response.end(JSON.stringify({error: 'no such command'}));
};

VippyController.prototype.status = function (request, response) {
  var s = {
    identity: this._config.hostname(),
    stats: this._stats,
    config: {
      version: this._config.version(),
      vips: this._config.vips(),
      nodes: this._config.nodes()
    },
    state: {
      mature: this._config.mature(),
      active: this._config.active(),
      inactive_reason: this._config.inactive_reason(),
      ownership: this._manager.state()
    }
  };
  
  response.write(JSON.stringify(s));
  response.end();
};
module.exports = VippyController;
