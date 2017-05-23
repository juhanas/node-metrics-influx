/*
*  A simple Gauge object. Added as it is missing in metrics
*/

var Gauge = module.exports = function Gauge() {
  this.points = [];
  this.type = 'gauge';
  this.latestNumber = 0;
}

Gauge.prototype.set = function(val) {
  if (val) {
    this.points.push({value: val, timestamp: new Date().getTime()});
    this.latestNumber = val;
  }
}

Gauge.prototype.clear = function() {
  this.points = [];
}

Gauge.prototype.latest = function() {
  return this.latestNumber;
}

Gauge.prototype.printObj = function() {
  return {type: 'gauge', points: this.points};
}
