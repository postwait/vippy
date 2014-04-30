ping = require("net-ping");
var options = {
  retries: 1,
  timeout: 500
};

var pingInterval = setInterval(function () {
// tests object sets ip addresses to ping
// all remote addresses must be alive for the vippy node
// to remain active.

  var tests = ["192.168.1.4","192.168.1.1","192.168.1.2"],
  i = 0,
  up=true;

  function pingit() {
    if (!up || i >= tests.length){
        config.active(up, "pingRemoteFailed");
        config.log('debug', config.inactive_reason());
        return;
    }
    var testIp = tests[i];
    var session = ping.createSession(options);
    session.on("error", function (error) {
      config.log('err', error.toString());
    });

    session.pingHost(testIp, function (error, target) {
      if (error) {
        if (error instanceof ping.RequestTimedOutError) {
          config.log('crit', target + ": Down");
        } else {
          config.log('crit', target + ": " + error.toString());
        }
        up=false;
        config.log('debug', "var up = "+up.toString())
      } else {
        config.log('debug', target + ": Up");
        i++;
      }
    pingit();
    session.close();
    });
  }
  pingit();
}, 3000);
config.on('stop', function () {
  // clearIntervals
  clearInterval(pingInterval);
  config.active(false,"shutting down");
});
