var program = process.argv[1],
    facility = 'user',
    opened = false,
    mask = {
      "emerg": true,
      "alert": true,
      "crit": true,
      "err": true,
      "warning": false,
      "notice": true,
      "info": false,
      "debug": false
    };

module.exports.openlog = function(_program, opts, _facility) {
  program = _program;
  if(_facility) facility = _facility;
  opened = true;
}
module.exports.closelog = function() {
  opened = false;
}
module.exports.setlogmask = function(_mask) {
  mask = _mask;
}
module.exports.syslog = function(pri, message) {
  if(!opened) return;
  if(mask[pri]) {
    console.log("[" + new Date() + "] [" + pri + "] " +
                program + "[" + process.pid + "]", message);
  }
}
