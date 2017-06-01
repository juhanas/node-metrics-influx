/*
 * reporter.js: Reporter backend for metrics library
 *
 * (C) 2017 Juhana S.
 * (C) 2015 Brandon Hamilton
 * MIT LICENCE
 *
 */

'use strict';

var Influx = require('./influxdb'),
    Report = require('metrics').Report;

/* Object.assign polyfill for node <= 0.12
 * https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Object/assign
 */
var objectAssign = (typeof Object.assign != 'function') ? function (target) {
  if (target === undefined || target === null) {
    throw new TypeError('Cannot convert undefined or null to object');
  }

  var output = Object(target);
  for (var index = 1; index < arguments.length; index++) {
    var source = arguments[index];
    if (source !== undefined && source !== null) {
      for (var nextKey in source) {
        if (Object.prototype.hasOwnProperty.call(source, nextKey)) {
          output[nextKey] = source[nextKey];
        }
      }
    }
  }
  return output;
} : Object.assign;

var Reporter = function(options) {
  options = options || {}
  this._influx = new Influx(options);
  this._report = new Report(options.trackedMetrics);
  this.tags = options.tags || {};
  this.skipIdleMetrics = options.skipIdleMetrics || false;
  this.bufferSize = options.bufferSize || 0;
  this.previousValues = {};
  this.tagger = options.tagger || function () { return {}; };

  if (options.scheduleInterval) {
    this.start(options.scheduleInterval);
  }
}

function delta(reporter, name, value) {
  var previous = reporter.previousValues[name];
  if (typeof previous == 'undefined') {
    return -1;
  }
  return value - previous;
}

function canSkipMetric(reporter, name, value) {
  var isIdle = delta(reporter, name, value) == 0;
  if (reporter.skipIdleMetrics && !isIdle) {
    reporter.previousValues[name] = value;
  }
  return reporter.skipIdleMetrics && isIdle;
}

Reporter.prototype.report = function(useBuffer) {
  var summary = this._report.summary();
  var timestamp = (new Date().getTime()) * 1000000;

  for (var namespace in summary) {
    for (var metric in summary[namespace]) {
      var key = namespace + '.' + metric;
      var fields = {};
      switch(summary[namespace][metric].type) {
        case 'counter':
          if (canSkipMetric(this, key, summary[namespace][metric].count)) {
            continue;
          }
          fields['count']          = summary[namespace][metric].count ;
          break;
        case 'meter':
          if (canSkipMetric(this, key, summary[namespace][metric].count) || (typeof summary[namespace][metric].m1 == 'undefined')) {
            continue;
          }
          fields['count']          = summary[namespace][metric].count;
          fields['one-minute']     = summary[namespace][metric].m1;
          fields['five-minute']    = summary[namespace][metric].m5;
          fields['fifteen-minute'] = summary[namespace][metric].m15;
          fields['mean-rate']      = summary[namespace][metric].mean;
          break;
        case 'histogram':
          if (canSkipMetric(this, key, summary[namespace][metric].count) || (typeof summary[namespace][metric].p75 == 'undefined')) {
            continue;
          }
          fields['count']          = summary[namespace][metric].count;
          fields['min']            = summary[namespace][metric].min;
          fields['max']            = summary[namespace][metric].max;
          fields['sum']            = summary[namespace][metric].sum;
          fields['mean']           = summary[namespace][metric].mean;
          fields['variance']       = (Number.isNaN(summary[namespace][metric].variance) ? -1 : summary[namespace][metric].variance);
          fields['std-dev']        = (Number.isNaN(summary[namespace][metric].std_dev) ? -1 : summary[namespace][metric].std_dev);
          fields['median']         = summary[namespace][metric].median;
          fields['75-percentile']  = summary[namespace][metric].p75;
          fields['95-percentile']  = summary[namespace][metric].p95;
          fields['99-percentile']  = summary[namespace][metric].p99;
          fields['999-percentile'] = summary[namespace][metric].p999;
          break;
        case 'timer':
          if (canSkipMetric(this, key, summary[namespace][metric].rate.count) || (typeof summary[namespace][metric].duration.p75 == 'undefined')) {
            continue;
          }
          fields['count']          = summary[namespace][metric].rate.count;
          fields['one-minute']     = summary[namespace][metric].rate.m1;
          fields['five-minute']    = summary[namespace][metric].rate.m5;
          fields['fifteen-minute'] = summary[namespace][metric].rate.m15;
          fields['mean-rate']      = summary[namespace][metric].rate.mean;
          fields['min']            = summary[namespace][metric].duration.min;
          fields['max']            = summary[namespace][metric].duration.max;
          fields['sum']            = summary[namespace][metric].duration.sum;
          fields['mean']           = summary[namespace][metric].duration.mean;
          fields['variance']       = (Number.isNaN(summary[namespace][metric].duration.variance) ? -1 : summary[namespace][metric].duration.variance);
          fields['std-dev']        = (Number.isNaN(summary[namespace][metric].duration.std_dev) ? -1 : summary[namespace][metric].duration.std_dev);
          fields['median']         = summary[namespace][metric].duration.median;
          fields['75-percentile']  = summary[namespace][metric].duration.p75;
          fields['95-percentile']  = summary[namespace][metric].duration.p95;
          fields['99-percentile']  = summary[namespace][metric].duration.p99;
          fields['999-percentile'] = summary[namespace][metric].duration.p999;
          break;
        case 'gauge':
          if (canSkipMetric(this, key, summary[namespace][metric].count)) {
            continue;
          }
          var gaugeArray = summary[namespace][metric].points.splice(0, summary[namespace][metric].points.length);
          gaugeArray.forEach(function(gauge) {
            var gaugeFields = {};
            gaugeFields['count']   = gauge.value;
            var tags = objectAssign(this.tagger(key), this.tags);
            this._influx.addPoint(key, tags, gauge.timestamp, gaugeFields);
          }, this);
          continue;
        default:
          continue;
      }
      var tags = objectAssign(this.tagger(key), this.tags);
      this._influx.addPoint(key, tags, timestamp, fields);
    }
  }
  if (useBuffer) {
    if( this._influx.points.length > this.bufferSize) {
      this._influx.write();
    }
  } else {
    this._influx.write();
  }
}

Reporter.prototype.addMetric = function (){
  this._report.addMetric.apply(this._report, arguments);
}

Reporter.prototype.getMetric = function (name){
  this._report.getMetric(name);
}

Reporter.prototype.resetMetric = function (metric, intervalHour, intervalMinute, intervalSecond, resetHour, resetMinute, resetSecond){
  var timeReset = new Date(), timeNow = new Date();
  timeReset.setHours(resetHour,resetMinute,resetSecond,0);
  var timeWait = timeReset.getTime() - timeNow;
  if (timeWait < 0) timeWait += 24*60*60*1000;
  setTimeout(clearMetric.bind(this, metric, intervalHour, intervalMinute, intervalSecond), timeWait);
}

function clearMetric(metric, intervalHour, intervalMinute, intervalSecond) {
  try {
    metric.clear();
    setTimeout(clearMetric.bind(this, metric, intervalHour, intervalMinute, intervalSecond), (((intervalHour * 60 + intervalMinute) * 60) + intervalSecond) * 1000);
  } catch(err) {
    console.log("The metric of type "+ metric.printObj().type + " does not support resetting.");
  }
}

module.exports = Reporter;
