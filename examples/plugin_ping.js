// This plugin requires installing the net-ping module before it can be used.
ping = require("net-ping");
var options = {
  retries: 1,
  timeout: 2000
};

var pingInterval = setInterval(function () {
// tests object sets ip addresses to ping
// all remote addresses must be alive for the vippy node
// to remain active.
  var tests = {
    "192.168.1.1": "10.112.102.125"
  }
  for (testIp in tests) {
    var session = ping.createSession(options);
    session.on("error", function (error) {
      config.log('err', error.toString());
    });
    session.pingHost(testIp, function (error, target) {
      if (error) {
        if (error instanceof ping.RequestTimedOutError) {
          config.log('err', target + ": Down");
        } else {
          config.log('err', target + ": " + error.toString());
        }
        config.active(false, "pingRemoteFailed");
        config.log('debug', config.inactive_reason());
      } else {
        config.log('debug', target + ": Up");
        config.active(true, "pingRemoteFailed");
        config.log('debug', config.inactive_reason());
      }
    });
  }
}, 1000);
config.on('stop', function () {
  // clearIntervals
  clearInterval(pingInterval);
});#
